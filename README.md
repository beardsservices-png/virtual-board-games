# Board Room — virtual chess & checkers

A board that's always set up. Play chess or checkers across the table on one
device, against the computer, or with someone anywhere by sending them a link.

- **Pass & play** — one device, two people
- **Play the computer** — four levels, from careless to genuinely hard
- **Play online** — a four-character code and a shareable link; moves land live
  and the game survives a closed tab, a refresh, or a redeploy

---

## Deploying to Railway

The repo is set up to deploy on every push to `main`.

### 1. Create the service

In Railway: **New Project → Deploy from GitHub repo →
`beardsservices-png/virtual-board-games`**. Railway reads `railway.json`, builds
the `Dockerfile`, and health-checks `/api/health`.

### 2. Add the volume

**Service → Settings → Volumes → Add Volume.** Paste this into the mount path
field:

```
/data
```

Name it whatever you like (`board-room-data` is a reasonable choice). This is
where saved games live — without it, every deploy starts the world over.

### 3. Set the variables

**Service → Variables → Raw Editor**, then paste this whole block:

```
DATA_DIR=/data
NODE_ENV=production
```

That is the entire list. `PORT` is supplied by Railway automatically — do not
set it yourself.

### 4. Generate the domain

**Service → Settings → Networking → Generate Domain.** That URL is the app, and
it is also the base of every invite link players share.

---

## Running it locally

```bash
npm install
npm run dev
```

Flask-style split: the API and sockets run on `:5000`, the Vite dev server on
`:5173` and proxies `/api` and `/socket.io` across. Open http://localhost:5173.

To run the way production does — one server, one port, prebuilt client:

```bash
npm run build
npm start                 # http://localhost:5000
```

Games are written to `./data/games.db` locally and `/data/games.db` on Railway.

---

## Tests

```bash
npm test              # rules engines, AI legality, perft
npm run test:browser  # end-to-end in a real browser (server must be running)
npm run test:online   # socket-level online play
```

`npm test` includes a **perft** check: the chess move generator is verified
against the published node counts for five standard positions, to depth 5. That
is the test that proves castling, en passant, promotion and pinned pieces are
all handled exactly right — if those numbers match, the generator is correct.

---

## How it fits together

```
shared/checkers.js      Checkers rules. One copy, used by both the browser and
                        the server, so they can never disagree about a jump.
client/src/engine/      fastchess.js  perft-verified 0x88 move generator
                        chessAI.js    negamax + alpha-beta + quiescence
                        checkersAI.js the same search over the shared rules
                        ai.worker.js  runs both off the main thread
client/src/ui/          Board, pieces, panels. The board component knows
                        nothing about either game — it renders 64 cells and
                        reports taps and drags back as square indices.
server/src/             Express + Socket.IO. Authoritative: it validates every
                        move with chess.js or the shared checkers engine before
                        it touches the database.
server/src/db.js        SQLite on the volume. One table, and a 30-day sweep.
```

### Why the chess AI has its own move generator

`chess.js` is the authority everywhere a real move is made — the server
validates with it and the UI renders from it. But its verbose move list rebuilds
a FEN string for every move it returns, measured here at about **630
positions/second**, which caps a search at a depth that plays like a beginner.

`fastchess.js` reaches roughly **6 million positions/second** on the same
hardware, which is the difference between the computer seeing two moves ahead
and seeing seven. It is only trusted because its perft counts match the
published values exactly, so what the search believes is legal and what the
server will accept always agree.

### Why geofence-style server-side authority

The server holds the position and validates every move. A client can be
refreshed, backgrounded, or tampered with; the game state on the volume is the
only copy that counts. This is also what makes reconnecting work — your browser
keeps a `playerId`, and returning with it puts you back in your seat with the
board exactly as you left it.

---

## Rules covered

**Chess** — castling (including the "can't castle through check" cases), en
passant, underpromotion, checkmate, stalemate, insufficient material, threefold
repetition, and the fifty-move rule.

**Checkers** — American / English draughts: captures are compulsory, jump chains
must be played to the end, men move forward only, kings move both ways, and
crowning ends the turn even mid-chain. Red moves first from the bottom.

---

## Playing notes

- Tap a piece, or drag it — both work, on any device.
- The move list is also the history scrubber. Tap any move to rewind the board;
  the board goes read-only until you jump back to the end.
- **Flip board**, five board themes, sound and coordinates are all in the
  sidebar (or the **Board** tab on a phone), and your choices are remembered.
- Pass & play and vs-computer games are saved in your browser, so closing the
  tab mid-game and coming back later picks up where you left off.

---

## Minecraft build plans

Moved on 20 Oct 2026 to the `vrlike` repo, `tools/mc-builder/`, next to the
MC Track Plotter and the Bedrock command guide.
