import { Chess } from 'chess.js';
import * as ck from '@vbg/shared/checkers';

/**
 * One rules interface, two games. Everything above this file — the board, the
 * move list, the sidebar, the network layer — is written against this shape and
 * never asks which game it is rendering.
 *
 * Squares are always a flat 0..63 index with index 0 at the TOP-LEFT of an
 * unflipped board (a8 in chess).
 */

/* --------------------------------------------------------------- chess glue */

export const idxToSquare = (i) => 'abcdefgh'[i % 8] + (8 - Math.floor(i / 8));
export const squareToIdx = (sq) => (8 - Number(sq[1])) * 8 + (sq.charCodeAt(0) - 97);

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const chessRules = {
  type: 'chess',
  colors: ['w', 'b'],
  label: (c) => (c === 'w' ? 'White' : 'Black'),
  pieceLabel: (c) => (c === 'w' ? 'light' : 'dark'),

  initial: () => ({ fen: new Chess().fen() }),

  turn: (state) => new Chess(state.fen).turn(),

  boardView(state) {
    const cells = new Array(64).fill(null);
    for (const row of new Chess(state.fen).board()) {
      for (const cell of row) {
        if (cell) cells[squareToIdx(cell.square)] = { color: cell.color, kind: cell.type };
      }
    }
    return cells;
  },

  legalMoves(state) {
    return new Chess(state.fen).moves({ verbose: true }).map((m) => ({
      from: squareToIdx(m.from),
      to: squareToIdx(m.to),
      capture: m.flags.includes('c') || m.flags.includes('e'),
      promotion: m.promotion || null,
      isPromotion: m.flags.includes('p'),
      san: m.san,
    }));
  },

  applyMove(state, move) {
    const game = new Chess(state.fen);
    let made;
    try {
      made = game.move({
        from: idxToSquare(move.from),
        to: idxToSquare(move.to),
        promotion: move.promotion || 'q',
      });
    } catch { return null; }
    if (!made) return null;
    return {
      state: { fen: game.fen() },
      record: {
        san: made.san,
        from: squareToIdx(made.from),
        to: squareToIdx(made.to),
        color: made.color,
        captured: made.captured || null,
        promotion: made.promotion || null,
        castle: made.flags.includes('k') || made.flags.includes('q'),
        check: game.isCheck(),
        mate: game.isCheckmate(),
      },
      result: chessResult(game),
    };
  },

  checkSquare(state) {
    const game = new Chess(state.fen);
    if (!game.isCheck()) return null;
    for (const row of game.board()) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === game.turn()) return squareToIdx(cell.square);
      }
    }
    return null;
  },

  result: (state) => chessResult(new Chess(state.fen)),

  captured(state) {
    // Read from the board rather than the move list, so a game joined halfway
    // through (or scrubbed backwards) still shows the right tray.
    const start = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
    const have = { w: { ...start, p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 } };
    for (const cell of this.boardView(state)) if (cell) have[cell.color][cell.kind]++;
    const out = { w: [], b: [] };
    for (const color of ['w', 'b']) {
      for (const kind of ['q', 'r', 'b', 'n', 'p']) {
        for (let i = have[color][kind]; i < start[kind]; i++) out[color].push(kind);
      }
    }
    return out; // out.w = white pieces that were taken
  },

  materialScore(state) {
    let score = 0;
    for (const cell of this.boardView(state)) {
      if (cell) score += (cell.color === 'w' ? 1 : -1) * PIECE_VALUE[cell.kind];
    }
    return score;
  },

  mustCapture: () => false,
  chainSquare: () => null,
  needsPromotionChoice: (move) => Boolean(move.isPromotion),
  notation: (record) => record.san,
  squareName: idxToSquare,
};

function chessResult(game) {
  if (game.isCheckmate()) return { winner: game.turn() === 'w' ? 'b' : 'w', reason: 'Checkmate' };
  if (game.isStalemate()) return { winner: 'draw', reason: 'Stalemate' };
  if (game.isInsufficientMaterial()) return { winner: 'draw', reason: 'Insufficient material' };
  if (game.isThreefoldRepetition()) return { winner: 'draw', reason: 'Threefold repetition' };
  if (game.isDraw()) return { winner: 'draw', reason: 'Fifty-move rule' };
  return null;
}

/* ------------------------------------------------------------ checkers glue */

const checkersRules = {
  type: 'checkers',
  colors: ['r', 'b'],
  label: (c) => (c === 'r' ? 'Red' : 'Black'),
  pieceLabel: (c) => (c === 'r' ? 'red' : 'black'),

  initial: () => ck.serialize(ck.initialState()),

  turn: (state) => state.turn,

  boardView(state) {
    const live = ck.deserialize(state);
    return live.board.map((p) => (p ? { color: p.c, kind: p.k ? 'king' : 'man' } : null));
  },

  legalMoves(state) {
    return ck.legalMoves(ck.deserialize(state)).map((m) => ({
      from: m.from,
      to: m.to,
      capture: m.captured !== null,
      captured: m.captured,
      promotion: null,
      isPromotion: false,
    }));
  },

  applyMove(state, move) {
    const live = ck.deserialize(state);
    const applied = ck.applyMove(live, { from: move.from, to: move.to });
    if (!applied) return null;
    return {
      state: ck.serialize(applied.state),
      record: {
        text: ck.moveText(applied.move),
        from: applied.move.from,
        to: applied.move.to,
        captured: applied.move.captured,
        crowned: applied.move.crowned,
        continues: applied.move.continues,
        color: live.turn,
      },
      result: applied.state.result
        ? { winner: applied.state.result.winner, reason: applied.state.result.reason }
        : null,
    };
  },

  checkSquare: () => null,
  result: (state) => ck.computeResult(ck.deserialize(state)),

  captured(state) {
    const m = ck.countMaterial(ck.deserialize(state));
    const gone = (side) => 12 - (m[side].men + m[side].kings);
    return {
      r: Array.from({ length: Math.max(0, gone('r')) }, () => 'man'),
      b: Array.from({ length: Math.max(0, gone('b')) }, () => 'man'),
    };
  },

  materialScore(state) {
    const m = ck.countMaterial(ck.deserialize(state));
    const w = (s) => s.men + s.kings * 1.6;
    return Number((w(m.r) - w(m.b)).toFixed(1));
  },

  mustCapture: (state) => ck.hasCapture(ck.deserialize(state)),
  chainSquare: (state) => state.chain ?? null,
  needsPromotionChoice: () => false,
  notation: (record) => record.text + (record.crowned ? '♔' : ''),
  squareName: (i) => String(ck.squareNumber(i) || ''),
};

/* -------------------------------------------------------------------- exposed */

export const RULES = { chess: chessRules, checkers: checkersRules };

export function rulesFor(type) {
  const r = RULES[type];
  if (!r) throw new Error(`Unknown game type: ${type}`);
  return r;
}

/** Replay a move list from the opening position — used to scrub history. */
export function replay(type, history, upTo) {
  const rules = rulesFor(type);
  let state = rules.initial();
  const limit = upTo === undefined ? history.length : upTo;
  for (let i = 0; i < limit && i < history.length; i++) {
    const applied = rules.applyMove(state, history[i]);
    if (!applied) break;
    state = applied.state;
  }
  return state;
}

/**
 * Group the flat move list into display rows. Chess is simply two plies per
 * row; in checkers a multi-jump is several records but one *turn*, so the hops
 * are collapsed into a single "23x14x5" entry before pairing.
 */
export function moveRows(type, history) {
  const rules = rulesFor(type);

  const turns = [];
  let chain = null;
  history.forEach((rec, ply) => {
    if (chain) {
      chain.text += `x${rules.squareName(rec.to)}`;
      chain.ply = ply;
      if (rec.crowned) chain.text += '\u2654';
      if (!rec.continues) { turns.push(chain); chain = null; }
      return;
    }
    const entry = { color: rec.color, text: rules.notation(rec), ply };
    if (rec.continues) chain = entry;
    else turns.push(entry);
  });
  if (chain) turns.push(chain);

  const [first] = rules.colors;
  const rows = [];
  let row = null;
  for (const turn of turns) {
    if (turn.color === first) {
      row = { no: rows.length + 1, a: turn, b: null };
      rows.push(row);
    } else {
      if (!row || row.b) { row = { no: rows.length + 1, a: null, b: null }; rows.push(row); }
      row.b = turn;
    }
  }
  return rows;
}
