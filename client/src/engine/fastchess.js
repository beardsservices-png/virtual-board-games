/**
 * A 0x88 chess move generator built for search speed.
 *
 * chess.js remains the authority everywhere a real move is made — the server
 * validates with it, the UI renders from it. This exists only because
 * chess.js's verbose move list rebuilds a FEN string for every move it returns
 * (measured at ~630 positions/second), which caps an AI at a depth that plays
 * like a beginner. This generator is verified against published perft counts,
 * so what the search believes is legal and what chess.js will accept agree.
 */

export const EMPTY = 0;
export const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
export const WHITE = 0, BLACK = 1;

export const typeOf = (p) => p & 7;
export const colorOf = (p) => p >> 3;
const make = (type, color) => type | (color << 3);

/* 0x88: square = rank * 16 + file, rank 0 is the 8th rank (top of the board). */
export const to0x88 = (i) => (i & 7) | ((i >> 3) << 4);
export const from0x88 = (sq) => ((sq >> 4) << 3) | (sq & 7);
const onBoard = (sq) => (sq & 0x88) === 0;

const KNIGHT_DIRS = [-33, -31, -18, -14, 14, 18, 31, 33];
const BISHOP_DIRS = [-17, -15, 15, 17];
const ROOK_DIRS = [-16, -1, 1, 16];
const KING_DIRS = [-17, -16, -15, -1, 1, 15, 16, 17];

const CASTLE_WK = 1, CASTLE_WQ = 2, CASTLE_BK = 4, CASTLE_BQ = 8;

export const F_CAPTURE = 1, F_EP = 2, F_DOUBLE = 4, F_KCASTLE = 8, F_QCASTLE = 16, F_PROMO = 32;

export const encode = (from, to, promo, flags) => from | (to << 8) | (promo << 16) | (flags << 20);
export const moveFrom = (m) => m & 0xff;
export const moveTo = (m) => (m >> 8) & 0xff;
export const movePromo = (m) => (m >> 16) & 0xf;
export const moveFlags = (m) => m >>> 20;

/* -------------------------------------------------------------------- setup */

const FEN_PIECES = {
  p: make(PAWN, BLACK), n: make(KNIGHT, BLACK), b: make(BISHOP, BLACK),
  r: make(ROOK, BLACK), q: make(QUEEN, BLACK), k: make(KING, BLACK),
  P: make(PAWN, WHITE), N: make(KNIGHT, WHITE), B: make(BISHOP, WHITE),
  R: make(ROOK, WHITE), Q: make(QUEEN, WHITE), K: make(KING, WHITE),
};
const PIECE_CHARS = { 1: 'P', 2: 'N', 3: 'B', 4: 'R', 5: 'Q', 6: 'K' };

export function parseFen(fen) {
  const parts = fen.trim().split(/\s+/);
  const board = new Int8Array(128);
  let sq = 0;
  for (const ch of parts[0]) {
    if (ch === '/') continue; // ranks are already 8 squares apart
    if (ch >= '1' && ch <= '9') { sq += Number(ch); continue; }
    board[to0x88(sq)] = FEN_PIECES[ch];
    sq++;
  }
  let castling = 0;
  for (const ch of parts[2] || '-') {
    if (ch === 'K') castling |= CASTLE_WK;
    else if (ch === 'Q') castling |= CASTLE_WQ;
    else if (ch === 'k') castling |= CASTLE_BK;
    else if (ch === 'q') castling |= CASTLE_BQ;
  }
  const epField = parts[3] || '-';
  const pos = {
    board,
    turn: (parts[1] || 'w') === 'w' ? WHITE : BLACK,
    castling,
    ep: epField === '-' ? -1 : to0x88((8 - Number(epField[1])) * 8 + (epField.charCodeAt(0) - 97)),
    half: Number(parts[4] || 0),
    full: Number(parts[5] || 1),
    kings: [-1, -1],
    undo: [],
  };
  for (let s = 0; s < 128; s++) {
    if (!onBoard(s)) continue;
    const p = board[s];
    if (p && typeOf(p) === KING) pos.kings[colorOf(p)] = s;
  }
  return pos;
}

export function toFen(pos) {
  let placement = '';
  for (let rank = 0; rank < 8; rank++) {
    let run = 0;
    for (let file = 0; file < 8; file++) {
      const p = pos.board[rank * 16 + file];
      if (!p) { run++; continue; }
      if (run) { placement += run; run = 0; }
      const ch = PIECE_CHARS[typeOf(p)];
      placement += colorOf(p) === WHITE ? ch : ch.toLowerCase();
    }
    if (run) placement += run;
    if (rank < 7) placement += '/';
  }
  let castle = '';
  if (pos.castling & CASTLE_WK) castle += 'K';
  if (pos.castling & CASTLE_WQ) castle += 'Q';
  if (pos.castling & CASTLE_BK) castle += 'k';
  if (pos.castling & CASTLE_BQ) castle += 'q';
  const epStr = pos.ep < 0 ? '-' : 'abcdefgh'[pos.ep & 7] + (8 - (pos.ep >> 4));
  return `${placement} ${pos.turn === WHITE ? 'w' : 'b'} ${castle || '-'} ${epStr} ${pos.half} ${pos.full}`;
}

/* ----------------------------------------------------------------- attacks */

export function isAttacked(pos, sq, byColor) {
  const board = pos.board;

  // pawns: a white attacker sits below the square it attacks
  const pawnDir = byColor === WHITE ? 16 : -16;
  for (const side of [-1, 1]) {
    const from = sq + pawnDir + side;
    if (onBoard(from)) {
      const p = board[from];
      if (p && colorOf(p) === byColor && typeOf(p) === PAWN) return true;
    }
  }

  for (const d of KNIGHT_DIRS) {
    const from = sq + d;
    if (!onBoard(from)) continue;
    const p = board[from];
    if (p && colorOf(p) === byColor && typeOf(p) === KNIGHT) return true;
  }

  for (const d of KING_DIRS) {
    const from = sq + d;
    if (!onBoard(from)) continue;
    const p = board[from];
    if (p && colorOf(p) === byColor && typeOf(p) === KING) return true;
  }

  for (const d of BISHOP_DIRS) {
    for (let from = sq + d; onBoard(from); from += d) {
      const p = board[from];
      if (!p) continue;
      if (colorOf(p) === byColor) {
        const t = typeOf(p);
        if (t === BISHOP || t === QUEEN) return true;
      }
      break;
    }
  }

  for (const d of ROOK_DIRS) {
    for (let from = sq + d; onBoard(from); from += d) {
      const p = board[from];
      if (!p) continue;
      if (colorOf(p) === byColor) {
        const t = typeOf(p);
        if (t === ROOK || t === QUEEN) return true;
      }
      break;
    }
  }
  return false;
}

export const inCheck = (pos, color) => isAttacked(pos, pos.kings[color], color ^ 1);

/* -------------------------------------------------------- move generation */

const PROMO_PIECES = [QUEEN, ROOK, BISHOP, KNIGHT];

/**
 * Pseudo-legal moves. `capturesOnly` drives the quiescence search.
 * Legality (own king left in check) is filtered by the caller via makeMove.
 */
export function generate(pos, out, capturesOnly = false) {
  const board = pos.board;
  const us = pos.turn;
  const them = us ^ 1;
  let n = 0;

  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const piece = board[sq];
    if (!piece || colorOf(piece) !== us) continue;
    const type = typeOf(piece);

    if (type === PAWN) {
      const push = us === WHITE ? -16 : 16;
      const startRank = us === WHITE ? 6 : 1;
      const promoRank = us === WHITE ? 0 : 7;

      const one = sq + push;
      if (onBoard(one) && !board[one]) {
        if ((one >> 4) === promoRank) {
          for (const promo of PROMO_PIECES) out[n++] = encode(sq, one, promo, F_PROMO);
        } else if (!capturesOnly) {
          out[n++] = encode(sq, one, 0, 0);
          const two = sq + push * 2;
          if ((sq >> 4) === startRank && !board[two]) out[n++] = encode(sq, two, 0, F_DOUBLE);
        }
      }
      for (const side of [-1, 1]) {
        const target = sq + push + side;
        if (!onBoard(target)) continue;
        const victim = board[target];
        if (victim && colorOf(victim) === them) {
          if ((target >> 4) === promoRank) {
            for (const promo of PROMO_PIECES) out[n++] = encode(sq, target, promo, F_PROMO | F_CAPTURE);
          } else {
            out[n++] = encode(sq, target, 0, F_CAPTURE);
          }
        } else if (!victim && target === pos.ep) {
          out[n++] = encode(sq, target, 0, F_CAPTURE | F_EP);
        }
      }
      continue;
    }

    const dirs = type === KNIGHT ? KNIGHT_DIRS
      : type === BISHOP ? BISHOP_DIRS
      : type === ROOK ? ROOK_DIRS
      : KING_DIRS;
    const sliding = type === BISHOP || type === ROOK || type === QUEEN;

    for (const d of dirs) {
      let target = sq + d;
      while (onBoard(target)) {
        const victim = board[target];
        if (!victim) {
          if (!capturesOnly) out[n++] = encode(sq, target, 0, 0);
        } else {
          if (colorOf(victim) === them) out[n++] = encode(sq, target, 0, F_CAPTURE);
          break;
        }
        if (!sliding) break;
        target += d;
      }
    }

    if (type === KING && !capturesOnly) {
      const kSide = us === WHITE ? CASTLE_WK : CASTLE_BK;
      const qSide = us === WHITE ? CASTLE_WQ : CASTLE_BQ;
      // Castling is only legal out of, through and into a safe square.
      if ((pos.castling & kSide) && !board[sq + 1] && !board[sq + 2]
          && !isAttacked(pos, sq, them) && !isAttacked(pos, sq + 1, them) && !isAttacked(pos, sq + 2, them)) {
        out[n++] = encode(sq, sq + 2, 0, F_KCASTLE);
      }
      if ((pos.castling & qSide) && !board[sq - 1] && !board[sq - 2] && !board[sq - 3]
          && !isAttacked(pos, sq, them) && !isAttacked(pos, sq - 1, them) && !isAttacked(pos, sq - 2, them)) {
        out[n++] = encode(sq, sq - 2, 0, F_QCASTLE);
      }
    }
  }
  return n;
}

/* ------------------------------------------------------------ make / unmake */

const CASTLE_MASK = (() => {
  // Moving from — or capturing on — these squares kills the matching right.
  const mask = new Int8Array(128).fill(15);
  mask[to0x88(60)] = 15 & ~(CASTLE_WK | CASTLE_WQ); // e1
  mask[to0x88(63)] = 15 & ~CASTLE_WK;               // h1
  mask[to0x88(56)] = 15 & ~CASTLE_WQ;               // a1
  mask[to0x88(4)] = 15 & ~(CASTLE_BK | CASTLE_BQ);  // e8
  mask[to0x88(7)] = 15 & ~CASTLE_BK;                // h8
  mask[to0x88(0)] = 15 & ~CASTLE_BQ;                // a8
  return mask;
})();

export function makeMove(pos, mv) {
  const board = pos.board;
  const from = moveFrom(mv);
  const to = moveTo(mv);
  const flags = moveFlags(mv);
  const promo = movePromo(mv);
  const piece = board[from];
  const us = pos.turn;

  const epCaptureSq = (flags & F_EP) ? to + (us === WHITE ? 16 : -16) : -1;
  const captured = epCaptureSq >= 0 ? board[epCaptureSq] : board[to];

  pos.undo.push({ mv, captured, epCaptureSq, castling: pos.castling, ep: pos.ep, half: pos.half, full: pos.full });

  if (epCaptureSq >= 0) board[epCaptureSq] = EMPTY;
  board[from] = EMPTY;
  board[to] = (flags & F_PROMO) ? make(promo, us) : piece;

  if (flags & F_KCASTLE) { board[to - 1] = board[to + 1]; board[to + 1] = EMPTY; }
  else if (flags & F_QCASTLE) { board[to + 1] = board[to - 2]; board[to - 2] = EMPTY; }

  if (typeOf(piece) === KING) pos.kings[us] = to;

  pos.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
  pos.ep = (flags & F_DOUBLE) ? from + (us === WHITE ? -16 : 16) : -1;
  pos.half = (typeOf(piece) === PAWN || (flags & F_CAPTURE)) ? 0 : pos.half + 1;
  if (us === BLACK) pos.full++;
  pos.turn = us ^ 1;
}

export function unmakeMove(pos) {
  const rec = pos.undo.pop();
  const board = pos.board;
  const { mv, captured, epCaptureSq } = rec;
  const from = moveFrom(mv);
  const to = moveTo(mv);
  const flags = moveFlags(mv);

  pos.turn ^= 1;
  const us = pos.turn;
  pos.castling = rec.castling;
  pos.ep = rec.ep;
  pos.half = rec.half;
  pos.full = rec.full;

  const moved = (flags & F_PROMO) ? make(PAWN, us) : board[to];
  board[from] = moved;
  board[to] = EMPTY;

  if (epCaptureSq >= 0) board[epCaptureSq] = captured;
  else if (captured) board[to] = captured;

  if (flags & F_KCASTLE) { board[to + 1] = board[to - 1]; board[to - 1] = EMPTY; }
  else if (flags & F_QCASTLE) { board[to - 2] = board[to + 1]; board[to + 1] = EMPTY; }

  if (typeOf(moved) === KING) pos.kings[us] = from;
}

/* ----------------------------------------------------------- legal wrappers */

const buffers = [];
export function bufferAt(ply) {
  if (!buffers[ply]) buffers[ply] = new Int32Array(256);
  return buffers[ply];
}

/** Filter pseudo-legal moves down to legal ones. Returns a plain array. */
export function legalMoves(pos) {
  const buf = bufferAt(100); // out of the search's ply range
  const n = generate(pos, buf, false);
  const us = pos.turn;
  const out = [];
  for (let i = 0; i < n; i++) {
    makeMove(pos, buf[i]);
    if (!inCheck(pos, us)) out.push(buf[i]);
    unmakeMove(pos);
  }
  return out;
}

export function perft(pos, depth) {
  if (depth === 0) return 1;
  const buf = bufferAt(depth);
  const n = generate(pos, buf, false);
  const us = pos.turn;
  let total = 0;
  for (let i = 0; i < n; i++) {
    makeMove(pos, buf[i]);
    if (!inCheck(pos, us)) total += depth === 1 ? 1 : perft(pos, depth - 1);
    unmakeMove(pos);
  }
  return total;
}
