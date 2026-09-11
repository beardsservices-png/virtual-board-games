/**
 * American checkers (English draughts) engine — pure, dependency-free ESM.
 * Shared verbatim by the browser client and the authoritative game server.
 *
 * Board is a flat 64-array. Index = row * 8 + col, row 0 is the TOP of the
 * screen. Only dark squares ((row + col) % 2 === 1) are ever occupied.
 *
 * The 40-move rule is enforced: forty moves by each side with no capture and no
 * man advanced is a draw. Without it two strong players shuffle kings forever,
 * and a game against the hardest setting would have no way to end.
 *
 *   'r' (Red)   starts on the bottom three rows and moves UP   (row decreasing)
 *   'b' (Black) starts on the top three rows    and moves DOWN (row increasing)
 *
 * Red moves first, so the player at the bottom of the screen opens — the same
 * way White does in chess. Rules enforced: capture is compulsory, a jump chain
 * must be played to its end, and crowning ends the turn even mid-chain.
 */

export const RED = 'r';
export const BLACK = 'b';

export const isDark = (i) => ((i >> 3) + (i & 7)) % 2 === 1;
export const rowOf = (i) => i >> 3;
export const colOf = (i) => i & 7;
export const opponent = (c) => (c === RED ? BLACK : RED);

/** Standard 1..32 draughts square numbers, for move notation. */
const SQUARE_NUMBER = (() => {
  const map = new Array(64).fill(0);
  let n = 1;
  for (let i = 0; i < 64; i++) if (isDark(i)) map[i] = n++;
  return map;
})();
export const squareNumber = (i) => SQUARE_NUMBER[i];

const DIRS = {
  [RED]: [-9, -7],   // up-left, up-right
  [BLACK]: [7, 9],   // down-left, down-right
};
const ALL_DIRS = [-9, -7, 7, 9];

/** A diagonal step is only real if it also moves exactly one column. */
function step(from, delta) {
  const to = from + delta;
  if (to < 0 || to > 63) return -1;
  if (Math.abs(colOf(to) - colOf(from)) !== 1) return -1;
  return to;
}

function jump(from, delta) {
  const over = step(from, delta);
  if (over < 0) return null;
  const to = step(over, delta);
  if (to < 0) return null;
  return { over, to };
}

/** Plies without a capture or a man move before the game is drawn (40 each). */
export const IDLE_LIMIT = 80;

export function initialState() {
  const board = new Array(64).fill(null);
  for (let i = 0; i < 24; i++) if (isDark(i)) board[i] = { c: BLACK, k: false };
  for (let i = 40; i < 64; i++) if (isDark(i)) board[i] = { c: RED, k: false };
  return { board, turn: RED, chain: null, idle: 0, result: null };
}

export function cloneState(s) {
  return {
    board: s.board.map((p) => (p ? { c: p.c, k: p.k } : null)),
    turn: s.turn,
    chain: s.chain,
    idle: s.idle || 0,
    result: s.result ? { ...s.result } : null,
  };
}

function directionsFor(piece) {
  return piece.k ? ALL_DIRS : DIRS[piece.c];
}

function jumpsFrom(board, from) {
  const piece = board[from];
  if (!piece) return [];
  const out = [];
  for (const d of directionsFor(piece)) {
    const j = jump(from, d);
    if (!j) continue;
    const victim = board[j.over];
    if (!victim || victim.c === piece.c) continue;
    if (board[j.to]) continue;
    out.push({ from, to: j.to, captured: j.over });
  }
  return out;
}

function slidesFrom(board, from) {
  const piece = board[from];
  if (!piece) return [];
  const out = [];
  for (const d of directionsFor(piece)) {
    const to = step(from, d);
    if (to >= 0 && !board[to]) out.push({ from, to, captured: null });
  }
  return out;
}

const crowningRow = (c) => (c === RED ? 0 : 7);

function willCrown(piece, to) {
  return !piece.k && rowOf(to) === crowningRow(piece.c);
}

/**
 * Every legal move for the side to play.
 *
 * Mid-chain (state.chain is a square index) the only legal moves are further
 * jumps by that one piece. Otherwise, if any jump exists anywhere on the board
 * the jumps are the whole move list — capture is compulsory.
 */
export function legalMoves(state) {
  if (state.result) return [];
  const { board, turn, chain } = state;

  if (chain !== null && chain !== undefined) {
    return jumpsFrom(board, chain).map((m) => ({ ...m, chain: true }));
  }

  const jumps = [];
  const slides = [];
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p.c !== turn) continue;
    jumps.push(...jumpsFrom(board, i));
    if (jumps.length === 0) slides.push(...slidesFrom(board, i));
  }
  if (jumps.length) return jumps;

  // A jump found late would have suppressed earlier slides, so rebuild cleanly.
  if (slides.length) {
    const all = [];
    for (let i = 0; i < 64; i++) {
      const p = board[i];
      if (p && p.c === turn) all.push(...slidesFrom(board, i));
    }
    return all;
  }
  return [];
}

export function movesFrom(state, square) {
  return legalMoves(state).filter((m) => m.from === square);
}

export function hasCapture(state) {
  return legalMoves(state).some((m) => m.captured !== null);
}

/** Apply a move and return the next state. Never mutates the input. */
export function applyMove(state, move) {
  const legal = legalMoves(state).find(
    (m) => m.from === move.from && m.to === move.to
  );
  if (!legal) return null;

  const next = cloneState(state);
  const piece = next.board[legal.from];
  const wasKing = piece.k;
  next.board[legal.from] = null;
  if (legal.captured !== null) next.board[legal.captured] = null;

  const crowned = willCrown(piece, legal.to);
  if (crowned) piece.k = true;
  next.board[legal.to] = piece;

  // A capture that can continue keeps the turn — unless the piece just crowned.
  const canContinue =
    legal.captured !== null &&
    !crowned &&
    jumpsFrom(next.board, legal.to).length > 0;

  // Progress is a capture or a man moving forward; anything else is two kings
  // circling, which is what the 40-move rule exists to end.
  next.idle = (legal.captured !== null || !wasKing) ? 0 : (state.idle || 0) + 1;

  if (canContinue) {
    next.chain = legal.to;
  } else {
    next.chain = null;
    next.turn = opponent(state.turn);
  }

  next.result = computeResult(next);
  return { state: next, move: { ...legal, crowned, continues: canContinue } };
}

export function computeResult(state) {
  let red = 0;
  let black = 0;
  for (const p of state.board) {
    if (!p) continue;
    if (p.c === RED) red++;
    else black++;
  }
  if (red === 0) return { winner: BLACK, reason: 'All red pieces captured' };
  if (black === 0) return { winner: RED, reason: 'All black pieces captured' };
  if (legalMoves({ ...state, result: null }).length === 0) {
    return { winner: opponent(state.turn), reason: 'No legal moves left' };
  }
  if ((state.idle || 0) >= IDLE_LIMIT) {
    return { winner: 'draw', reason: 'Forty moves each with no capture' };
  }
  return null;
}

export function countMaterial(state) {
  const t = { r: { men: 0, kings: 0 }, b: { men: 0, kings: 0 } };
  for (const p of state.board) {
    if (!p) continue;
    if (p.k) t[p.c].kings++;
    else t[p.c].men++;
  }
  return t;
}

/** "11-15" for a slide, "23x14" for a jump, hops joined for a chain. */
export function moveText(move) {
  const sep = move.captured !== null ? 'x' : '-';
  return `${squareNumber(move.from)}${sep}${squareNumber(move.to)}`;
}

export function serialize(state) {
  return {
    board: state.board.map((p) => (p ? (p.k ? p.c.toUpperCase() : p.c) : '.')).join(''),
    turn: state.turn,
    chain: state.chain,
    idle: state.idle || 0,
  };
}

export function deserialize(data) {
  const board = new Array(64).fill(null);
  for (let i = 0; i < 64; i++) {
    const ch = data.board[i];
    if (ch === '.') continue;
    const lower = ch.toLowerCase();
    board[i] = { c: lower, k: ch !== lower };
  }
  const state = {
    board,
    turn: data.turn,
    chain: data.chain ?? null,
    idle: data.idle ?? 0,
    result: null,
  };
  state.result = computeResult(state);
  return state;
}
