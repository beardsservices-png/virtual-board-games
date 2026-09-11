/**
 * Rules and engine tests. No browser, no server — just the parts that have to
 * be exactly right.
 *
 *   node tests/rules.mjs
 */
import { Chess } from 'chess.js';
import * as ck from '../shared/checkers.js';
import { parseFen, perft, toFen, legalMoves as fastLegal, from0x88, moveFrom, moveTo } from '../client/src/engine/fastchess.js';
import { createChessAI } from '../client/src/engine/chessAI.js';
import { createCheckersAI } from '../client/src/engine/checkersAI.js';
import { settingsFor } from '../client/src/engine/levels.js';
import { RULES, replay, moveRows } from '../client/src/engine/games.js';

const results = [];
const check = (name, pass, detail = '') => {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`);
};
const section = (name) => console.log(`\n--- ${name} ---`);

const squareName = (i) => 'abcdefgh'[i % 8] + (8 - Math.floor(i / 8));

/* ============================================================ chess: perft */

section('chess move generation (perft)');

// Published node counts. Matching these proves castling, en passant,
// promotion and pin handling are all correct — nothing else covers that ground.
const PERFT = [
  ['initial position', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281, 4865609]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862, 4085603]],
  ['endgame with en passant', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238, 674624]],
  ['promotion heavy', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467, 422333]],
  ['tactical middlegame', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379, 2103487]],
];

for (const [name, fen, expected] of PERFT) {
  let ok = true;
  const seen = [];
  for (let depth = 1; depth <= expected.length; depth++) {
    const pos = parseFen(fen);
    if (toFen(pos) !== fen) { ok = false; seen.push('fen roundtrip broken'); break; }
    const got = perft(pos, depth);
    seen.push(got);
    if (got !== expected[depth - 1]) { ok = false; break; }
  }
  check(`perft: ${name}`, ok, `d1-d${expected.length} = ${seen.join(', ')}`);
}

section('chess generator agrees with chess.js');

// Perft proves the counts; this proves the moves themselves are the same ones
// the server will accept.
{
  let mismatches = 0;
  let positions = 0;
  const board = new Chess();
  for (let ply = 0; ply < 120 && !board.isGameOver(); ply++) {
    const mine = new Set(
      fastLegal(parseFen(board.fen())).map((m) => squareName(from0x88(moveFrom(m))) + squareName(from0x88(moveTo(m))))
    );
    const theirs = new Set(board.moves({ verbose: true }).map((m) => m.from + m.to));
    for (const move of theirs) if (!mine.has(move)) mismatches++;
    for (const move of mine) if (!theirs.has(move)) mismatches++;
    positions++;
    const options = board.moves();
    board.move(options[Math.floor(Math.random() * options.length)]);
  }
  check('every generated move matches chess.js', mismatches === 0, `${positions} positions, ${mismatches} differences`);
}

/* ========================================================= checkers: rules */

section('checkers rules');

check('opening position offers 7 moves', ck.legalMoves(ck.initialState()).length === 7);

{
  let jumps = 0;
  let chains = 0;
  let crowns = 0;
  let forcedViolations = 0;
  let rejected = 0;

  for (let game = 0; game < 200; game++) {
    let state = ck.initialState();
    for (let ply = 0; ply < 400 && !state.result; ply++) {
      const moves = ck.legalMoves(state);
      if (moves.length === 0) break;
      // Compulsory capture: if any jump exists, every legal move is a jump.
      if (moves.some((m) => m.captured !== null) && !moves.every((m) => m.captured !== null)) forcedViolations++;
      const applied = ck.applyMove(state, moves[Math.floor(Math.random() * moves.length)]);
      if (!applied) { rejected++; break; }
      if (applied.move.captured !== null) jumps++;
      if (applied.move.continues) chains++;
      if (applied.move.crowned) crowns++;
      state = applied.state;
    }
  }
  check('captures are always compulsory', forcedViolations === 0, `${forcedViolations} violations`);
  check('no legal move is ever rejected', rejected === 0, `${rejected} rejected`);
  check('random play exercises jumps, chains and crowning',
    jumps > 1000 && chains > 100 && crowns > 100, `${jumps} jumps, ${chains} chain hops, ${crowns} crownings`);
}

{
  // Squares here are flat 0..63 indices with row 0 at the top; only the dark
  // squares ((row + col) odd) are ever in play.
  // Red man on d3, black men on d4 and b6: one jump lands with another waiting.
  const board = new Array(64).fill(null);
  board[44] = { c: ck.RED, k: false };
  board[35] = { c: ck.BLACK, k: false };
  board[17] = { c: ck.BLACK, k: false };
  const state = { board, turn: ck.RED, chain: null, result: null };
  const applied = ck.applyMove(state, { from: 44, to: 26 });
  check('a jump chain continues while jumps remain',
    Boolean(applied) && applied.move.continues === true && applied.move.captured === 35,
    applied ? `captured ${applied.move.captured}, continues=${applied.move.continues}` : 'move rejected');
  check('mid-chain, only the jumping piece may move',
    applied?.state.chain === 26 && ck.legalMoves(applied.state).every((m) => m.from === 26),
    `chain=${applied?.state.chain}`);
}

{
  // Red jumps onto the back row and crowns. Another jump is available from
  // there, and the rule is that crowning ends the turn anyway.
  const board = new Array(64).fill(null);
  board[17] = { c: ck.RED, k: false };
  board[10] = { c: ck.BLACK, k: false };
  board[12] = { c: ck.BLACK, k: false };
  const state = { board, turn: ck.RED, chain: null, result: null };
  const applied = ck.applyMove(state, { from: 17, to: 3 });
  check('crowning ends the turn', Boolean(applied) && applied.move.crowned && !applied.move.continues,
    applied ? `crowned=${applied.move.crowned} continues=${applied.move.continues}` : 'move rejected');
  check('the crowned piece is a king', applied?.state.board[3]?.k === true);
  check('the turn passes after crowning', applied?.state.turn === ck.BLACK);
}

{
  // A man may not move backwards; a king may.
  const board = new Array(64).fill(null);
  board[26] = { c: ck.RED, k: false };
  const man = ck.legalMoves({ board, turn: ck.RED, chain: null, result: null });
  board[26] = { c: ck.RED, k: true };
  const king = ck.legalMoves({ board, turn: ck.RED, chain: null, result: null });
  check('men move forward only, kings move both ways',
    man.length === 2 && king.length === 4, `man ${man.length}, king ${king.length}`);
}

{
  // Running out of moves loses, even with pieces still on the board.
  const board = new Array(64).fill(null);
  board[0] = { c: ck.RED, k: false };
  board[9] = { c: ck.BLACK, k: false };
  board[18] = { c: ck.BLACK, k: false };
  const blocked = ck.computeResult({ board, turn: ck.RED, chain: null, result: null });
  check('being blocked loses the game', blocked?.winner === ck.BLACK, JSON.stringify(blocked));
}

{
  // Two kings circling with nothing to take is a draw, not an endless game.
  const board = new Array(64).fill(null);
  board[0] = { c: ck.RED, k: true };
  board[63] = { c: ck.BLACK, k: true };
  let state = { board, turn: ck.RED, chain: null, idle: ck.IDLE_LIMIT - 1, result: null };
  const applied = ck.applyMove(state, ck.legalMoves(state)[0]);
  check('forty idle moves each is a draw', applied?.state.result?.winner === 'draw',
    JSON.stringify(applied?.state.result));

  // A capture resets the count.
  const b2 = new Array(64).fill(null);
  b2[44] = { c: ck.RED, k: true };
  b2[35] = { c: ck.BLACK, k: false };
  const capture = ck.applyMove({ board: b2, turn: ck.RED, chain: null, idle: 70, result: null }, { from: 44, to: 26 });
  check('a capture resets the idle count', capture?.state.idle === 0, `idle=${capture?.state.idle}`);
}

check('serialising a position round-trips', (() => {
  let state = ck.initialState();
  for (let i = 0; i < 12; i++) {
    const moves = ck.legalMoves(state);
    if (!moves.length) break;
    state = ck.applyMove(state, moves[0]).state;
  }
  const back = ck.deserialize(ck.serialize(state));
  return JSON.stringify(back.board) === JSON.stringify(state.board) && back.turn === state.turn;
})());

/* ================================================================ the AIs */

section('computer opponents');

{
  const ai = createChessAI();
  const tactics = [
    ['finds mate in one', '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'Ra8#'],
    ['takes a hanging queen', 'rnb1kbnr/ppp1pppp/8/3q4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1', 'exd5'],
    ['delivers scholar-style mate', 'rnbqkbnr/ppp2ppp/8/3pp3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 3', 'Qh4#'],
  ];
  for (const [name, fen, want] of tactics) {
    const move = ai(fen, { budgetMs: 1500, maxDepth: 10 });
    const board = new Chess(fen);
    const played = board.move({ from: squareName(move.from), to: squareName(move.to), promotion: move.promotion || 'q' });
    check(`chess AI ${name}`, played.san === want, `played ${played.san}, wanted ${want} (depth ${move.depth})`);
  }

  // Every move the AI proposes must be one chess.js will accept.
  let illegal = 0;
  let decisive = 0;
  for (let game = 0; game < 2; game++) {
    const board = new Chess();
    for (let ply = 0; ply < 140 && !board.isGameOver(); ply++) {
      const move = ai(board.fen(), { budgetMs: 120, maxDepth: 3 });
      if (!move) { illegal++; break; }
      try {
        board.move({ from: squareName(move.from), to: squareName(move.to), promotion: move.promotion || 'q' });
      } catch { illegal++; break; }
    }
    if (board.isGameOver()) decisive++;
  }
  check('chess AI never proposes an illegal move', illegal === 0, `${illegal} illegal`);
  check('chess AI plays games out to a finish', decisive === 2, `${decisive}/2 finished`);
}

{
  const ai = createCheckersAI();
  let illegal = 0;
  let finished = 0;
  for (let game = 0; game < 2; game++) {
    let state = ck.initialState();
    // Long enough for the 40-move rule to bite: two even engines trade down to
    // kings and then need eighty idle plies before the draw lands.
    for (let ply = 0; ply < 400 && !state.result; ply++) {
      const move = ai(ck.serialize(state), { budgetMs: 120, maxDepth: 6 });
      if (!move) break;
      const applied = ck.applyMove(state, { from: move.from, to: move.to });
      if (!applied) { illegal++; break; }
      state = applied.state;
    }
    if (state.result) finished++;
  }
  check('checkers AI never proposes an illegal move', illegal === 0, `${illegal} illegal`);
  check('checkers AI plays games out to a finish', finished === 2, `${finished}/2 finished`);
  check('two equal engines reach a result rather than shuffling forever',
    finished === 2, `${finished}/2 — the 40-move rule ends a king standoff`);

  // A stronger level should beat a weaker one over a few games.
  let strongWins = 0;
  for (let game = 0; game < 4; game++) {
    let state = ck.initialState();
    const strong = game % 2 === 0 ? ck.RED : ck.BLACK;
    for (let ply = 0; ply < 220 && !state.result; ply++) {
      const move = ai(
        ck.serialize(state),
        state.turn === strong
          ? { budgetMs: 200, maxDepth: 8 }
          : { budgetMs: 30, maxDepth: 1, blunderChance: 0.3 }
      );
      if (!move) break;
      const applied = ck.applyMove(state, { from: move.from, to: move.to });
      if (!applied) break;
      state = applied.state;
    }
    if (state.result?.winner === strong) strongWins++;
  }
  check('a higher level beats a lower one', strongWins >= 3, `${strongWins}/4 wins for the stronger side`);
}

check('every difficulty level is configured for both games',
  [1, 2, 3, 4].every((level) =>
    ['chess', 'checkers'].every((type) => {
      const s = settingsFor(type, level);
      return s && s.budgetMs > 0 && s.maxDepth > 0;
    })
  ));
check('the levels get stronger, not weaker',
  [1, 2, 3].every((level) => settingsFor('chess', level).budgetMs < settingsFor('chess', level + 1).budgetMs));

/* ================================================== the shared rules adapter */

section('rules adapter');

for (const type of ['chess', 'checkers']) {
  const rules = RULES[type];
  let state = rules.initial();
  const history = [];
  for (let i = 0; i < 24; i++) {
    const moves = rules.legalMoves(state);
    if (!moves.length) break;
    const applied = rules.applyMove(state, moves[Math.floor(Math.random() * moves.length)]);
    if (!applied) break;
    state = applied.state;
    history.push(applied.record);
  }
  check(`${type}: replaying the history reproduces the position`,
    JSON.stringify(replay(type, history)) === JSON.stringify(state));
  check(`${type}: the board view has 64 squares`, rules.boardView(state).length === 64);
  check(`${type}: every move row has a turn number`, moveRows(type, history).every((r) => r.no > 0));
}

check('chess: the starting position is materially level', RULES.chess.materialScore(RULES.chess.initial()) === 0);
check('checkers: the starting position is materially level', RULES.checkers.materialScore(RULES.checkers.initial()) === 0);
check('chess: nothing is captured at the start',
  RULES.chess.captured(RULES.chess.initial()).w.length === 0);

/* ------------------------------------------------------------------ summary */

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
