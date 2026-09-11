import { useEffect, useRef } from 'react';
import { moveRows } from '../engine/games.js';

/**
 * The move list doubles as the history scrubber: tapping an entry rewinds the
 * board to that point, and the board goes read-only until you come back to live.
 */
export default function MoveList({ type, history, viewPly, onScrub }) {
  const rows = moveRows(type, history);
  const listRef = useRef(null);
  const live = viewPly === null;

  // Scroll the list itself rather than calling scrollIntoView: on a phone the
  // list sits below the board, and scrollIntoView drags the whole page down
  // with it, pushing the board under the header.
  useEffect(() => {
    const el = listRef.current;
    if (live && el) el.scrollTop = el.scrollHeight;
  }, [history.length, live]);

  const entry = (turn, key) => {
    if (!turn) return <span key={key} />;
    const current = viewPly === turn.ply;
    return (
      <button
        key={key}
        type="button"
        aria-current={current}
        onClick={() => onScrub(turn.ply === history.length - 1 ? null : turn.ply)}
      >
        {turn.text}
      </button>
    );
  };

  return (
    <div className="card panel">
      <h4>Moves</h4>
      <div className="moves" ref={listRef}>
        {rows.length === 0 && <div className="empty">No moves yet — the board is set.</div>}
        {rows.map((row) => (
          <div key={row.no} style={{ display: 'contents' }}>
            <span className="no">{row.no}.</span>
            {entry(row.a, 'a')}
            {entry(row.b, 'b')}
          </div>
        ))}
      </div>

      <div className="scrub">
        <button className="btn btn-sm btn-ghost" disabled={history.length === 0 || viewPly === 0}
          onClick={() => onScrub(0)} aria-label="Jump to first move">⏮</button>
        <button className="btn btn-sm btn-ghost" disabled={history.length === 0 || viewPly === 0}
          onClick={() => onScrub(viewPly === null ? Math.max(0, history.length - 2) : Math.max(0, viewPly - 1))}
          aria-label="Previous move">◀</button>
        <button className="btn btn-sm btn-ghost" disabled={live}
          onClick={() => onScrub(viewPly + 1 >= history.length - 1 ? null : viewPly + 1)}
          aria-label="Next move">▶</button>
        <button className="btn btn-sm btn-ghost" disabled={live}
          onClick={() => onScrub(null)} aria-label="Back to the live position">⏭</button>
      </div>
      {!live && <p className="tiny muted" style={{ margin: '9px 0 0' }}>Reviewing an earlier position — jump to the end to play on.</p>}
    </div>
  );
}
