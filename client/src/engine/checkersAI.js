import * as ck from '@vbg/shared/checkers';

/**
 * The same negamax shape as the chess engine, but it searches the shared rules
 * module rather than a private copy. That is a deliberate trade: a purpose-built
 * bitboard would search deeper, but any divergence between what the AI believes
 * is legal and what the server will accept becomes a bug a player sees.
 *
 * A jump chain keeps the turn, so this branches on `state.turn` instead of
 * flipping sign by depth parity.
 */

const MAN = 100;
const KING = 172;
const WIN = 50000;

class Timeout extends Error {}

/** Positive favours Red (the side at the bottom of the board). */
function evaluate(state) {
  let score = 0;
  let men = 0;

  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (!p) continue;
    const red = p.c === ck.RED;
    const sign = red ? 1 : -1;
    const row = i >> 3;
    const col = i & 7;

    if (p.k) {
      score += sign * KING;
      // Kings are worth more near the middle, where they cover both diagonals.
      score += sign * (4 - Math.abs(3.5 - row)) * 2;
      score += sign * (4 - Math.abs(3.5 - col)) * 2;
    } else {
      men++;
      score += sign * MAN;
      // Advancement: distance travelled toward the crowning row.
      score += sign * (red ? 7 - row : row) * 5;
      // Holding the back row denies the opponent easy kings.
      if ((red && row === 7) || (!red && row === 0)) score += sign * 8;
    }
    // A piece on the outer file cannot be jumped.
    if (col === 0 || col === 7) score += sign * 4;
    // Central files are where the play is.
    else if (col >= 2 && col <= 5) score += sign * 2;
  }

  // With few men left, trading down is good for whoever is ahead.
  if (men <= 6) score *= 1.1;
  return score;
}

export function createCheckersAI() {
  let nodes = 0;
  let deadline = Infinity;

  const tick = () => {
    if ((++nodes & 511) === 0 && Date.now() > deadline) throw new Timeout();
  };

  function orderMoves(state, moves) {
    return moves
      .map((m) => {
        let s = m.captured !== null ? 100 : 0;
        const piece = state.board[m.from];
        if (piece && !piece.k) {
          const crowningRow = piece.c === ck.RED ? 0 : 7;
          if ((m.to >> 3) === crowningRow) s += 60;
        }
        return { m, s };
      })
      .sort((a, b) => b.s - a.s)
      .map((x) => x.m);
  }

  function search(state, depth, alpha, beta, me) {
    tick();
    if (state.result) {
      if (state.result.winner === 'draw') return 0;
      return state.result.winner === me ? WIN - (20 - depth) : -WIN + (20 - depth);
    }
    if (depth <= 0) return me === ck.RED ? evaluate(state) : -evaluate(state);

    const moves = orderMoves(state, ck.legalMoves(state));
    if (moves.length === 0) return state.turn === me ? -WIN + (20 - depth) : WIN - (20 - depth);

    const maximizing = state.turn === me;
    let best = maximizing ? -Infinity : Infinity;

    for (const m of moves) {
      const applied = ck.applyMove(state, m);
      if (!applied) continue;
      // A chain keeps the turn, so that hop is not a ply of the opponent's.
      const nextDepth = applied.move.continues ? depth : depth - 1;
      const score = search(applied.state, nextDepth, alpha, beta, me);
      if (maximizing) {
        if (score > best) best = score;
        if (best > alpha) alpha = best;
      } else {
        if (score < best) best = score;
        if (best < beta) beta = best;
      }
      if (alpha >= beta) break;
    }
    return best;
  }

  return function pick(serialized, { budgetMs = 1500, maxDepth = 8, blunderChance = 0 } = {}) {
    const state = ck.deserialize(serialized);
    const root = ck.legalMoves(state);
    if (root.length === 0) return null;
    if (root.length === 1) {
      return { from: root[0].from, to: root[0].to, depth: 0, nodes: 0, score: 0 };
    }

    nodes = 0;
    deadline = Date.now() + budgetMs;
    const me = state.turn;

    if (blunderChance > 0 && Math.random() < blunderChance) {
      const m = root[Math.floor(Math.random() * root.length)];
      return { from: m.from, to: m.to, depth: 0, nodes: 0, score: 0 };
    }

    let best = root[0];
    let bestScore = -Infinity;
    let reached = 0;

    for (let depth = 1; depth <= maxDepth; depth++) {
      let localBest = null;
      let localScore = -Infinity;
      let alpha = -Infinity;
      try {
        const ordered = orderMoves(state, root.slice());
        const i = ordered.findIndex((m) => m.from === best.from && m.to === best.to);
        if (i > 0) ordered.unshift(ordered.splice(i, 1)[0]);

        for (const m of ordered) {
          const applied = ck.applyMove(state, m);
          if (!applied) continue;
          const nextDepth = applied.move.continues ? depth : depth - 1;
          const score = search(applied.state, nextDepth, alpha, Infinity, me);
          if (score > localScore) { localScore = score; localBest = m; }
          if (score > alpha) alpha = score;
        }
      } catch (err) {
        if (!(err instanceof Timeout)) throw err;
        break;
      }
      if (localBest) { best = localBest; bestScore = localScore; reached = depth; }
      if (Math.abs(bestScore) > WIN - 200) break;
      if (Date.now() > deadline) break;
    }

    return { from: best.from, to: best.to, depth: reached, nodes, score: Math.round(bestScore) };
  };
}
