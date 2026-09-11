import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

/**
 * Games live on the Railway volume (DATA_DIR=/data), never in the image, so a
 * redeploy does not wipe a game in progress. Locally it falls back to ./data.
 */
const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'games.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS games (
    code        TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    state       TEXT NOT NULL,
    history     TEXT NOT NULL DEFAULT '[]',
    seats       TEXT NOT NULL DEFAULT '{}',
    status      TEXT NOT NULL DEFAULT 'active',
    winner      TEXT,
    reason      TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_games_updated ON games(updated_at);
`);

const stmts = {
  insert: db.prepare(`INSERT INTO games (code, type, state, history, seats, status, winner, reason, created_at, updated_at)
                      VALUES (@code, @type, @state, @history, @seats, @status, @winner, @reason, @created_at, @updated_at)`),
  get: db.prepare('SELECT * FROM games WHERE code = ?'),
  update: db.prepare(`UPDATE games SET state=@state, history=@history, seats=@seats,
                      status=@status, winner=@winner, reason=@reason, updated_at=@updated_at
                      WHERE code=@code`),
  purge: db.prepare("DELETE FROM games WHERE updated_at < datetime('now', '-30 days')"),
  count: db.prepare('SELECT COUNT(*) AS n FROM games'),
};

const nowIso = () => new Date().toISOString();

function hydrate(row) {
  if (!row) return null;
  return {
    code: row.code,
    type: row.type,
    state: JSON.parse(row.state),
    history: JSON.parse(row.history),
    seats: JSON.parse(row.seats),
    status: row.status,
    winner: row.winner,
    reason: row.reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createGame(game) {
  const ts = nowIso();
  stmts.insert.run({
    code: game.code,
    type: game.type,
    state: JSON.stringify(game.state),
    history: JSON.stringify(game.history ?? []),
    seats: JSON.stringify(game.seats ?? {}),
    status: game.status ?? 'active',
    winner: game.winner ?? null,
    reason: game.reason ?? null,
    created_at: ts,
    updated_at: ts,
  });
  return hydrate(stmts.get.get(game.code));
}

export function getGame(code) {
  return hydrate(stmts.get.get(code));
}

export function saveGame(game) {
  stmts.update.run({
    code: game.code,
    state: JSON.stringify(game.state),
    history: JSON.stringify(game.history ?? []),
    seats: JSON.stringify(game.seats ?? {}),
    status: game.status ?? 'active',
    winner: game.winner ?? null,
    reason: game.reason ?? null,
    updated_at: nowIso(),
  });
  return game;
}

export function purgeOldGames() {
  const { changes } = stmts.purge.run();
  return changes;
}

export function stats() {
  return { path: DB_PATH, games: stmts.count.get().n };
}

export { DATA_DIR, DB_PATH };
