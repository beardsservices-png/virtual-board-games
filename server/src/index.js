import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import compression from 'compression';
import { Server as SocketServer } from 'socket.io';

import * as db from './db.js';
import * as engine from './engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');
const PORT = Number(process.env.PORT) || 5000;

const app = express();
app.disable('x-powered-by');
app.use(compression());
app.use(express.json({ limit: '64kb' }));

/* ---------------------------------------------------------------- room codes */

// No 0/O/1/I — these get read aloud and typed in by hand.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode() {
  for (let attempt = 0; attempt < 40; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    if (!db.getGame(code)) return code;
  }
  throw new Error('Could not allocate a room code');
}

/* ------------------------------------------------------------------- presence */

/** code -> Map(playerId -> socket count). Live only; never persisted. */
const presence = new Map();

/** code -> Set(playerId) who have asked for a rematch. */
const rematchRequests = new Map();

function markOnline(code, playerId) {
  if (!presence.has(code)) presence.set(code, new Map());
  const room = presence.get(code);
  room.set(playerId, (room.get(playerId) || 0) + 1);
}

function markOffline(code, playerId) {
  const room = presence.get(code);
  if (!room) return;
  const n = (room.get(playerId) || 1) - 1;
  if (n <= 0) room.delete(playerId);
  else room.set(playerId, n);
  if (room.size === 0) presence.delete(code);
}

function onlineMap(game) {
  const room = presence.get(game.code);
  const out = {};
  for (const color of engine.colorsFor(game.type)) {
    const seat = game.seats[color];
    out[color] = Boolean(seat && room && room.has(seat.playerId));
  }
  return out;
}

/* --------------------------------------------------------------- serialisation */

/** Never ship another player's id to the browser — it is their seat credential. */
function publicGame(game, forPlayerId) {
  const seats = {};
  let you = null;
  for (const [color, seat] of Object.entries(game.seats || {})) {
    if (!seat) continue;
    seats[color] = { name: seat.name || engine.labelFor(game.type, color) };
    if (forPlayerId && seat.playerId === forPlayerId) you = color;
  }
  return {
    code: game.code,
    type: game.type,
    state: game.state,
    history: game.history,
    seats,
    status: game.status,
    winner: game.winner,
    reason: game.reason,
    turn: engine.turnOf(game.type, game.state),
    online: onlineMap(game),
    you,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
  };
}

/* ------------------------------------------------------------------------ REST */

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ...db.stats(), uptime: Math.round(process.uptime()) });
});

app.post('/api/games', (req, res) => {
  const { type, hostColor, hostName, hostPlayerId } = req.body || {};
  if (!engine.isValidType(type)) {
    return res.status(400).json({ error: 'type must be "chess" or "checkers"' });
  }
  if (!hostPlayerId || typeof hostPlayerId !== 'string') {
    return res.status(400).json({ error: 'hostPlayerId is required' });
  }

  const colors = engine.colorsFor(type);
  let color = hostColor;
  if (!colors.includes(color)) {
    color = colors[Math.random() < 0.5 ? 0 : 1];
  }

  const game = db.createGame({
    code: newCode(),
    type,
    state: engine.newState(type),
    history: [],
    seats: {
      [color]: {
        playerId: hostPlayerId,
        name: String(hostName || '').slice(0, 24) || 'Host',
      },
    },
    status: 'waiting',
  });

  res.json({ code: game.code, color });
});

app.get('/api/games/:code', (req, res) => {
  const game = db.getGame(String(req.params.code || '').toUpperCase());
  if (!game) return res.status(404).json({ error: 'No game with that code' });
  res.json(publicGame(game, req.query.playerId));
});

/* ------------------------------------------------------- static client bundle */

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, { maxAge: '1h', index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.type('text').send('Client bundle not built. Run: npm run build');
  });
}

/* -------------------------------------------------------------------- sockets */

const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: { origin: true, credentials: true },
  pingTimeout: 25000,
});

function broadcast(code, extra = {}) {
  const game = db.getGame(code);
  if (!game) return;
  const pending = rematchRequests.get(code);
  for (const socketId of io.sockets.adapter.rooms.get(code) || []) {
    const s = io.sockets.sockets.get(socketId);
    if (!s) continue;
    s.emit('game:state', {
      ...publicGame(game, s.data.playerId),
      rematchOffered: Boolean(pending && pending.size && !pending.has(s.data.playerId)),
      rematchRequested: Boolean(pending && pending.has(s.data.playerId)),
      ...extra,
    });
  }
}

function seatPlayer(game, playerId, name) {
  const colors = engine.colorsFor(game.type);
  for (const color of colors) {
    if (game.seats[color]?.playerId === playerId) return color;
  }
  for (const color of colors) {
    if (!game.seats[color]) {
      game.seats[color] = { playerId, name: String(name || '').slice(0, 24) || engine.labelFor(game.type, color) };
      if (colors.every((c) => game.seats[c])) game.status = 'active';
      db.saveGame(game);
      return color;
    }
  }
  return null; // spectator
}

io.on('connection', (socket) => {
  socket.data.playerId = null;
  socket.data.code = null;

  socket.on('game:join', ({ code, playerId, name } = {}) => {
    code = String(code || '').toUpperCase().trim();
    if (!code || !playerId) return socket.emit('game:error', { message: 'Missing game code' });

    const game = db.getGame(code);
    if (!game) return socket.emit('game:error', { message: `No game found with code ${code}` });

    socket.join(code);
    socket.data.playerId = playerId;
    socket.data.code = code;
    markOnline(code, playerId);
    seatPlayer(game, playerId, name);
    broadcast(code);
  });

  socket.on('game:move', ({ code, playerId, move } = {}) => {
    const game = db.getGame(String(code || '').toUpperCase());
    if (!game) return socket.emit('game:error', { message: 'Game not found' });
    if (game.status === 'finished') return socket.emit('game:error', { message: 'This game is over' });

    const seat = Object.entries(game.seats).find(([, s]) => s?.playerId === playerId);
    if (!seat) return socket.emit('game:error', { message: 'You are watching this game, not playing it' });

    const [color] = seat;
    if (engine.turnOf(game.type, game.state) !== color) {
      return socket.emit('game:error', { message: 'Not your turn' });
    }

    const applied = engine.applyMove(game.type, game.state, move || {});
    if (!applied) return socket.emit('game:error', { message: 'Illegal move' });

    game.state = applied.state;
    game.history = [...game.history, applied.record];
    if (applied.result) {
      game.status = 'finished';
      game.winner = applied.result.winner;
      game.reason = applied.result.reason;
    } else if (game.status === 'waiting') {
      game.status = 'active';
    }
    db.saveGame(game);
    broadcast(game.code);
  });

  socket.on('game:resign', ({ code, playerId } = {}) => {
    const game = db.getGame(String(code || '').toUpperCase());
    if (!game || game.status === 'finished') return;
    const seat = Object.entries(game.seats).find(([, s]) => s?.playerId === playerId);
    if (!seat) return;
    game.status = 'finished';
    game.winner = engine.otherColor(game.type, seat[0]);
    game.reason = `${engine.labelFor(game.type, seat[0])} resigned`;
    db.saveGame(game);
    broadcast(game.code);
  });

  // Both seats must ask; colours swap so nobody is stuck playing one side.
  // Requests are deliberately in-memory: a rematch offer should not outlive a
  // redeploy, or people come back to a game that silently restarted itself.
  socket.on('game:rematch', ({ code, playerId } = {}) => {
    const game = db.getGame(String(code || '').toUpperCase());
    if (!game || game.status !== 'finished') return;
    const seat = Object.entries(game.seats).find(([, s]) => s?.playerId === playerId);
    if (!seat) return;

    if (!rematchRequests.has(game.code)) rematchRequests.set(game.code, new Set());
    const pending = rematchRequests.get(game.code);
    pending.add(playerId);

    const colors = engine.colorsFor(game.type);
    const seated = colors.map((c) => game.seats[c]?.playerId).filter(Boolean);
    const everyoneReady = seated.length > 0 && seated.every((id) => pending.has(id));

    if (everyoneReady) {
      const swapped = {};
      colors.forEach((c, i) => {
        const other = game.seats[colors[colors.length - 1 - i]];
        if (other) swapped[c] = other;
      });
      game.seats = swapped;
      game.state = engine.newState(game.type);
      game.history = [];
      game.status = colors.every((c) => game.seats[c]) ? 'active' : 'waiting';
      game.winner = null;
      game.reason = null;
      db.saveGame(game);
      rematchRequests.delete(game.code);
    }
    broadcast(game.code, { rematchPending: [...(rematchRequests.get(game.code) || [])].length });
  });

  socket.on('disconnect', () => {
    const { code, playerId } = socket.data;
    if (code && playerId) {
      markOffline(code, playerId);
      broadcast(code);
    }
  });
});

/* ----------------------------------------------------------------------- boot */

const purged = db.purgeOldGames();
server.listen(PORT, '0.0.0.0', () => {
  const info = db.stats();
  console.log(`[vbg] listening on :${PORT}`);
  console.log(`[vbg] database ${info.path} (${info.games} games, purged ${purged} stale)`);
  console.log(`[vbg] client bundle ${fs.existsSync(CLIENT_DIST) ? 'served' : 'NOT BUILT'}`);
});
