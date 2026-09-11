import { createChessAI } from './chessAI.js';
import { createCheckersAI } from './checkersAI.js';
import { settingsFor } from './levels.js';

/**
 * The search runs here so a five-second "Brutal" think never blocks the board.
 * The UI stays fully interactive while the engine works, which is the whole
 * reason this is a worker and not a setTimeout.
 */
const chess = createChessAI();
const checkers = createCheckersAI();

self.onmessage = (event) => {
  const { id, type, state, level } = event.data || {};
  const started = Date.now();
  try {
    const opts = settingsFor(type, level);
    const move = type === 'chess' ? chess(state.fen, opts) : checkers(state, opts);
    self.postMessage({ id, move, ms: Date.now() - started });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message ? err.message : err) });
  }
};
