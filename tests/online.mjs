/**
 * Socket-level check of the online game loop, with no browser in the way:
 * two clients, a seat each, moves relayed both directions, and a reconnect
 * that lands back in the same seat.
 *
 *   node tests/online.mjs [baseUrl]
 */
import { io } from 'socket.io-client';

const BASE = process.argv[2] || 'http://localhost:5099';
const results = [];
const check = (name, pass, detail = '') => {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`);
};

const connect = () => io(BASE, { transports: ['websocket'], forceNew: true });

/** Wait for the next game:state that satisfies `predicate`. */
function nextState(socket, predicate = () => true, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('game:state', onState); reject(new Error('timed out')); }, timeoutMs);
    function onState(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off('game:state', onState);
      resolve(payload);
    }
    socket.on('game:state', onState);
  });
}

const created = await fetch(`${BASE}/api/games`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ type: 'chess', hostColor: 'w', hostName: 'Host', hostPlayerId: 'host-1' }),
}).then((r) => r.json());
check('REST creates a game', /^[A-Z0-9]{4}$/.test(created.code || ''), JSON.stringify(created));

const code = created.code;
const host = connect();
const guest = connect();

let hostState = nextState(host);
host.emit('game:join', { code, playerId: 'host-1', name: 'Host' });
let payload = await hostState;
check('host is seated as White', payload.you === 'w', `you=${payload.you}`);

const hostSeesGuest = nextState(host, (p) => Boolean(p.seats?.b));
guest.emit('game:join', { code, playerId: 'guest-1', name: 'Guest' });
const guestPayload = await nextState(guest);
check('guest takes the free seat', guestPayload.you === 'b', `you=${guestPayload.you}`);
await hostSeesGuest;
check('host is told the guest arrived', true);

const guestSeesMove = nextState(guest, (p) => p.history.length === 1);
host.emit('game:move', { code, playerId: 'host-1', move: { from: 52, to: 36 } }); // e2-e4
const afterMove = await guestSeesMove.catch(() => null);
check("host's move reaches the guest", Boolean(afterMove), afterMove ? afterMove.history[0].san : 'timed out');
check('turn passes to the guest', afterMove?.turn === 'b', `turn=${afterMove?.turn}`);

const hostSeesReply = nextState(host, (p) => p.history.length === 2);
guest.emit('game:move', { code, playerId: 'guest-1', move: { from: 12, to: 28 } }); // e7-e5
const afterReply = await hostSeesReply.catch(() => null);
check("guest's reply reaches the host", Boolean(afterReply), afterReply ? afterReply.history[1].san : 'timed out');

// the server must refuse a move from the wrong side
const refused = new Promise((resolve) => guest.once('game:error', (e) => resolve(e.message)));
guest.emit('game:move', { code, playerId: 'guest-1', move: { from: 3, to: 39 } });
const refusal = await Promise.race([refused, new Promise((r) => setTimeout(() => r(null), 2500))]);
check('server refuses an out-of-turn or illegal move', Boolean(refusal), refusal || 'no error sent');

// reconnecting with the same player id returns you to your seat
guest.close();
await new Promise((r) => setTimeout(r, 300));
const guest2 = connect();
const rejoined = nextState(guest2);
guest2.emit('game:join', { code, playerId: 'guest-1', name: 'Guest' });
const back = await rejoined.catch(() => null);
check('reconnecting keeps the same seat', back?.you === 'b', `you=${back?.you}`);
check('reconnecting keeps the position', back?.history?.length === 2, `${back?.history?.length} moves`);

// a spectator gets the board but no seat
const watcher = connect();
const watching = nextState(watcher);
watcher.emit('game:join', { code, playerId: 'watcher-1', name: 'Watcher' });
const watched = await watching.catch(() => null);
check('a third person watches rather than playing', watched?.you === null, `you=${watched?.you}`);

// persistence: the REST view agrees with the socket view
const rest = await fetch(`${BASE}/api/games/${code}?playerId=guest-1`).then((r) => r.json());
check('the game is persisted and readable over REST', rest.history?.length === 2, `${rest.history?.length} moves`);

host.close(); guest2.close(); watcher.close();

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
