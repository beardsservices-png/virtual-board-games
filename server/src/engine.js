import { Chess } from 'chess.js';
import * as checkers from '@vbg/shared/checkers';

/**
 * One interface over two very different rule sets, so the room code, the
 * persistence layer and the socket handlers never branch on game type.
 * The first colour in each pair is the side that moves first and sits at the
 * bottom of the board by default.
 */
export const COLORS = {
  chess: ['w', 'b'],
  checkers: ['r', 'b'],
};

export const COLOR_NAMES = {
  w: 'White', b: 'Black', r: 'Red',
};

/**
 * Squares cross the wire as a flat 0..63 index with 0 at the top-left (a8),
 * the same convention the board component uses. chess.js speaks algebraic, so
 * the translation lives here rather than being duplicated at both ends.
 */
export const idxToSquare = (i) => 'abcdefgh'[i % 8] + (8 - Math.floor(i / 8));
export const squareToIdx = (sq) => (8 - Number(sq[1])) * 8 + (sq.charCodeAt(0) - 97);

const asSquare = (value) =>
  typeof value === 'number' ? idxToSquare(value) : String(value);

export function isValidType(type) {
  return type === 'chess' || type === 'checkers';
}

export function newState(type) {
  if (type === 'chess') return { fen: new Chess().fen() };
  return checkers.serialize(checkers.initialState());
}

export function turnOf(type, state) {
  if (type === 'chess') return new Chess(state.fen).turn();
  return state.turn;
}

function chessResult(game) {
  if (game.isCheckmate()) {
    return { winner: game.turn() === 'w' ? 'b' : 'w', reason: 'Checkmate' };
  }
  if (game.isStalemate()) return { winner: 'draw', reason: 'Stalemate' };
  if (game.isInsufficientMaterial()) return { winner: 'draw', reason: 'Insufficient material' };
  if (game.isThreefoldRepetition()) return { winner: 'draw', reason: 'Threefold repetition' };
  if (game.isDraw()) return { winner: 'draw', reason: 'Fifty-move rule' };
  return null;
}

/**
 * Validate and apply one move. Returns null when the move is not legal — the
 * server never trusts a move the client claims is fine.
 */
export function applyMove(type, state, move) {
  if (type === 'chess') {
    const game = new Chess(state.fen);
    let made;
    try {
      made = game.move({
        from: asSquare(move.from),
        to: asSquare(move.to),
        promotion: move.promotion || 'q',
      });
    } catch {
      return null;
    }
    if (!made) return null;
    const result = chessResult(game);
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
      result,
    };
  }

  const current = checkers.deserialize(state);
  const applied = checkers.applyMove(current, { from: move.from, to: move.to });
  if (!applied) return null;
  const next = applied.state;
  return {
    state: checkers.serialize(next),
    record: {
      text: checkers.moveText(applied.move),
      from: applied.move.from,
      to: applied.move.to,
      captured: applied.move.captured,
      crowned: applied.move.crowned,
      continues: applied.move.continues,
      color: current.turn,
    },
    result: next.result
      ? { winner: next.result.winner, reason: next.result.reason }
      : null,
  };
}

/** Colours of the two seats, first-mover first. */
export function colorsFor(type) {
  return COLORS[type];
}

export function otherColor(type, color) {
  const [a, b] = COLORS[type];
  return color === a ? b : a;
}

export function labelFor(type, color) {
  if (type === 'checkers' && color === 'b') return 'Black';
  return COLOR_NAMES[color] || color;
}
