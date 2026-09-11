import {
  parseFen, generate, makeMove, unmakeMove, inCheck, bufferAt,
  moveFrom, moveTo, movePromo, moveFlags, from0x88,
  typeOf, F_CAPTURE, F_EP, F_PROMO,
  PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, WHITE,
} from './fastchess.js';

/**
 * Negamax with alpha-beta, quiescence, check extensions, MVV-LVA ordering,
 * killer moves and a history heuristic — searching the perft-verified 0x88
 * generator rather than chess.js.
 *
 * Depth is never fixed. Each level is a time budget and the search deepens
 * until it runs out, so the engine plays as well as the device allows and a
 * slow phone gets a shallower game instead of a frozen one.
 */

const VALUE = [0, 100, 320, 330, 500, 900, 20000]; // indexed by piece type
const MATE = 100000;
const MAX_PLY = 64;

// Authored a8 -> h1, matching the flat index used across the app.
const PST_P = [
    0,  0,  0,  0,  0,  0,  0,  0,
   50, 50, 50, 50, 50, 50, 50, 50,
   10, 10, 20, 30, 30, 20, 10, 10,
    5,  5, 10, 25, 25, 10,  5,  5,
    0,  0,  0, 20, 20,  0,  0,  0,
    5, -5,-10,  0,  0,-10, -5,  5,
    5, 10, 10,-20,-20, 10, 10,  5,
    0,  0,  0,  0,  0,  0,  0,  0];
const PST_N = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50];
const PST_B = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20];
const PST_R = [
    0,  0,  0,  0,  0,  0,  0,  0,
    5, 10, 10, 10, 10, 10, 10,  5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
    0,  0,  0,  5,  5,  0,  0,  0];
const PST_Q = [
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5,  5,  5,  5,  0,-10,
   -5,  0,  5,  5,  5,  5,  0, -5,
    0,  0,  5,  5,  5,  5,  0, -5,
  -10,  5,  5,  5,  5,  5,  0,-10,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20];
const PST_K = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
   20, 20,  0,  0,  0,  0, 20, 20,
   20, 30, 10,  0,  0, 10, 30, 20];
const PST_K_END = [
  -50,-40,-30,-20,-20,-30,-40,-50,
  -30,-20,-10,  0,  0,-10,-20,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-30,  0,  0,  0,  0,-30,-30,
  -50,-30,-30,-30,-30,-30,-30,-50];

const PST = [null, PST_P, PST_N, PST_B, PST_R, PST_Q, PST_K];
const PROMO_CHAR = { [QUEEN]: 'q', [ROOK]: 'r', [BISHOP]: 'b', [KNIGHT]: 'n' };

class Timeout extends Error {}

/** White-relative evaluation, read straight off the Int8Array board. */
function evaluateWhite(pos) {
  const board = pos.board;
  let score = 0;
  let heavy = 0;
  let whitePawnFiles = 0;
  let blackPawnFiles = 0;

  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const piece = board[sq];
    if (!piece) continue;
    const type = piece & 7;
    if (type === QUEEN) heavy += 2;
    else if (type === ROOK) heavy += 1;
    if (type === PAWN) {
      if (piece >> 3 === WHITE) whitePawnFiles |= 1 << (sq & 7);
      else blackPawnFiles |= 1 << (sq & 7);
    }
  }
  // Kings belong tucked away with heavy pieces on, and in the centre once
  // they come off — two tables rather than one compromise.
  const endgame = heavy <= 2;

  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const piece = board[sq];
    if (!piece) continue;
    const type = piece & 7;
    const white = (piece >> 3) === WHITE;
    const i = from0x88(sq);
    const table = type === KING ? (endgame ? PST_K_END : PST_K) : PST[type];
    const worth = VALUE[type] + table[white ? i : i ^ 56];
    score += white ? worth : -worth;
  }

  // A bishop pair and a rook on an open file are the two positional facts
  // cheap enough to be worth checking every node.
  let wb = 0, bb = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const piece = board[sq];
    if (!piece) continue;
    const type = piece & 7;
    const white = (piece >> 3) === WHITE;
    if (type === BISHOP) { if (white) wb++; else bb++; }
    else if (type === ROOK) {
      const file = 1 << (sq & 7);
      const open = !(whitePawnFiles & file) && !(blackPawnFiles & file);
      if (open) score += white ? 18 : -18;
    }
  }
  if (wb >= 2) score += 30;
  if (bb >= 2) score -= 30;

  return score;
}

export function createChessAI() {
  let nodes = 0;
  let deadline = Infinity;
  const history = new Int32Array(128 * 128);
  const killers = new Int32Array(MAX_PLY * 2);
  const scoreBufs = [];

  const scoresAt = (ply) => (scoreBufs[ply] ||= new Int32Array(256));

  function tick() {
    if ((++nodes & 2047) === 0 && Date.now() > deadline) throw new Timeout();
  }

  function scoreMoves(pos, moves, scores, n, ply) {
    const k1 = killers[ply * 2];
    const k2 = killers[ply * 2 + 1];
    for (let i = 0; i < n; i++) {
      const mv = moves[i];
      const flags = moveFlags(mv);
      let s = 0;
      if (flags & F_CAPTURE) {
        const victim = (flags & F_EP) ? PAWN : typeOf(pos.board[moveTo(mv)]);
        const attacker = typeOf(pos.board[moveFrom(mv)]);
        s = 1_000_000 + VALUE[victim] * 16 - VALUE[attacker];
      } else if (mv === k1) s = 900_000;
      else if (mv === k2) s = 800_000;
      else s = history[moveFrom(mv) * 128 + moveTo(mv)];
      if (flags & F_PROMO) s += 2_000_000 + VALUE[movePromo(mv)];
      scores[i] = s;
    }
  }

  /** Selection sort one slot at a time — cheaper than sorting a list we will usually cut off early. */
  function selectBest(moves, scores, n, i) {
    let best = i;
    for (let j = i + 1; j < n; j++) if (scores[j] > scores[best]) best = j;
    if (best !== i) {
      const m = moves[i]; moves[i] = moves[best]; moves[best] = m;
      const s = scores[i]; scores[i] = scores[best]; scores[best] = s;
    }
  }

  function quiesce(pos, alpha, beta, ply) {
    tick();
    const side = pos.turn === WHITE ? 1 : -1;
    const stand = side * evaluateWhite(pos);
    if (ply >= MAX_PLY - 2) return stand;
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;

    const moves = bufferAt(ply);
    const n = generate(pos, moves, true);
    const scores = scoresAt(ply);
    scoreMoves(pos, moves, scores, n, ply);

    const us = pos.turn;
    for (let i = 0; i < n; i++) {
      selectBest(moves, scores, n, i);
      makeMove(pos, moves[i]);
      if (inCheck(pos, us)) { unmakeMove(pos); continue; }
      const score = -quiesce(pos, -beta, -alpha, ply + 1);
      unmakeMove(pos);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function search(pos, depth, alpha, beta, ply) {
    tick();
    if (pos.half >= 100) return 0; // fifty-move draw
    const us = pos.turn;
    const checked = inCheck(pos, us);
    // Extend one ply when in check so the search never stops mid-tactic.
    if (depth <= 0) {
      if (!checked || ply >= MAX_PLY - 4) return quiesce(pos, alpha, beta, ply);
      depth = 1;
    }

    const moves = bufferAt(ply);
    const n = generate(pos, moves, false);
    const scores = scoresAt(ply);
    scoreMoves(pos, moves, scores, n, ply);

    let best = -Infinity;
    let legal = 0;

    for (let i = 0; i < n; i++) {
      selectBest(moves, scores, n, i);
      const mv = moves[i];
      makeMove(pos, mv);
      if (inCheck(pos, us)) { unmakeMove(pos); continue; }
      legal++;
      const score = -search(pos, depth - 1, -beta, -alpha, ply + 1);
      unmakeMove(pos);

      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) {
        if (!(moveFlags(mv) & F_CAPTURE)) {
          killers[ply * 2 + 1] = killers[ply * 2];
          killers[ply * 2] = mv;
          history[moveFrom(mv) * 128 + moveTo(mv)] += depth * depth;
        }
        break;
      }
    }

    // Mate scored by distance, so a mate in 1 is preferred to a mate in 5.
    if (legal === 0) return checked ? -MATE + ply : 0;
    return best;
  }

  /**
   * @returns {{from:number,to:number,promotion:string|null,depth:number,nodes:number,score:number}|null}
   */
  return function pick(fen, { budgetMs = 1200, maxDepth = 6, blunderChance = 0 } = {}) {
    const pos = parseFen(fen);
    const rootBuf = bufferAt(62);
    const rootN = generate(pos, rootBuf, false);

    const root = [];
    const us = pos.turn;
    for (let i = 0; i < rootN; i++) {
      makeMove(pos, rootBuf[i]);
      if (!inCheck(pos, us)) root.push(rootBuf[i]);
      unmakeMove(pos);
    }
    if (root.length === 0) return null;

    const emit = (mv, depth, score) => ({
      from: from0x88(moveFrom(mv)),
      to: from0x88(moveTo(mv)),
      promotion: (moveFlags(mv) & F_PROMO) ? PROMO_CHAR[movePromo(mv)] : null,
      depth, nodes, score: Math.round(score),
    });

    nodes = 0;
    deadline = Date.now() + budgetMs;
    history.fill(0);
    killers.fill(0);

    // A weak setting should read as a careless opponent, not a broken one:
    // it still searches, it just sometimes plays something else entirely.
    if (blunderChance > 0 && Math.random() < blunderChance) {
      return emit(root[Math.floor(Math.random() * root.length)], 0, 0);
    }

    let best = root[0];
    let bestScore = 0;
    let reached = 0;

    for (let depth = 1; depth <= maxDepth; depth++) {
      let localBest = null;
      let localScore = -Infinity;
      let alpha = -Infinity;

      // Try the previous iteration's best first — it is usually still best,
      // and a good first move is what makes alpha-beta pay.
      const ordered = root.slice();
      const prev = ordered.indexOf(best);
      if (prev > 0) ordered.unshift(ordered.splice(prev, 1)[0]);

      try {
        for (const mv of ordered) {
          makeMove(pos, mv);
          const score = -search(pos, depth - 1, -Infinity, -alpha, 1);
          unmakeMove(pos);
          if (score > localScore) { localScore = score; localBest = mv; }
          if (score > alpha) alpha = score;
        }
      } catch (err) {
        if (!(err instanceof Timeout)) throw err;
        break; // keep the best move from the last completed depth
      }

      if (localBest !== null) { best = localBest; bestScore = localScore; reached = depth; }
      if (Math.abs(bestScore) > MATE - 200) break; // forced mate found
      if (Date.now() > deadline) break;
    }

    return emit(best, reached, bestScore);
  };
}
