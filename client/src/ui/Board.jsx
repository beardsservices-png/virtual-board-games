import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Piece from './Pieces.jsx';

const FILES = 'abcdefgh';

/**
 * The board surface. It knows nothing about chess or checkers — it renders 64
 * cells and reports taps and drags back as square indices.
 *
 * Tap-to-move and drag-to-move are both live at once, on the same pointer
 * handlers, because on a phone people do one and on a desktop the other, and
 * making them choose is the fastest way to make a board feel wrong.
 */
export default function Board({
  type,
  board,
  flipped = false,
  selected = null,
  targets = null,        // Map(toSquare -> move)
  lastMove = null,       // {from, to}
  checkSquare = null,
  movable = null,        // Set of squares this player may pick up right now
  interactive = true,
  showCoords = true,
  onSelect,
  onMove,
}) {
  const boardRef = useRef(null);
  const [drag, setDrag] = useState(null); // {from, x, y, over, moved}
  const pressRef = useRef(null);

  const visual = useCallback(
    (i) => {
      const row = i >> 3;
      const col = i & 7;
      return flipped ? { row: 7 - row, col: 7 - col } : { row, col };
    },
    [flipped]
  );

  const squareFromPoint = useCallback(
    (clientX, clientY) => {
      const el = boardRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const col = Math.floor(((clientX - rect.left) / rect.width) * 8);
      const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
      if (row < 0 || row > 7 || col < 0 || col > 7) return null;
      return flipped ? (7 - row) * 8 + (7 - col) : row * 8 + col;
    },
    [flipped]
  );

  const canLift = useCallback(
    (square) => interactive && movable && movable.has(square),
    [interactive, movable]
  );

  const handlePointerDown = (event) => {
    if (!interactive || event.button === 1 || event.button === 2) return;
    const square = squareFromPoint(event.clientX, event.clientY);
    if (square === null) return;

    // Completing a move always wins over starting a new one, so tapping a
    // highlighted square never gets swallowed by picking up another piece.
    if (targets?.has(square) && selected !== null) {
      onMove?.(selected, square);
      pressRef.current = null;
      return;
    }
    if (!canLift(square)) {
      if (selected !== null) onSelect?.(null);
      return;
    }

    event.currentTarget.setPointerCapture?.(event.pointerId);
    onSelect?.(square);
    pressRef.current = { square, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    setDrag({ from: square, x: event.clientX, y: event.clientY, over: square, moved: false });
  };

  const handlePointerMove = (event) => {
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    // A few pixels of slop, so a slightly shaky tap is still a tap.
    const moved = Math.abs(dx) > 5 || Math.abs(dy) > 5;
    setDrag((prev) =>
      prev ? { ...prev, x: event.clientX, y: event.clientY, over: squareFromPoint(event.clientX, event.clientY), moved: prev.moved || moved } : prev
    );
  };

  const endPress = (event) => {
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    const wasDragging = drag?.moved;
    const over = squareFromPoint(event.clientX, event.clientY);
    pressRef.current = null;
    setDrag(null);

    if (wasDragging) {
      if (over !== null && over !== press.square && targets?.has(over)) onMove?.(press.square, over);
      else if (over === press.square) onSelect?.(press.square); // dropped back where it started
      else onSelect?.(null);
    }
    // A plain tap leaves the piece selected — handled in pointerdown.
  };

  useEffect(() => {
    if (!drag) return undefined;
    const cancel = () => { pressRef.current = null; setDrag(null); };
    window.addEventListener('pointercancel', cancel);
    return () => window.removeEventListener('pointercancel', cancel);
  }, [drag]);

  const cells = useMemo(() => {
    const out = [];
    for (let vrow = 0; vrow < 8; vrow++) {
      for (let vcol = 0; vcol < 8; vcol++) {
        const square = flipped ? (7 - vrow) * 8 + (7 - vcol) : vrow * 8 + vcol;
        out.push({ square, vrow, vcol, dark: (vrow + vcol) % 2 === 1 });
      }
    }
    return out;
  }, [flipped]);

  const dragPiece = drag?.moved ? board[drag.from] : null;

  return (
    <div className="board-frame">
      <div
        ref={boardRef}
        className={`board${interactive && movable?.size ? ' can-play' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPress}
        role="grid"
        aria-label={type === 'chess' ? 'Chess board' : 'Checkers board'}
      >
        {cells.map(({ square, vrow, vcol, dark }) => {
          const classes = ['sq', dark ? 'dark' : 'light'];
          if (square === selected) classes.push('sel');
          else if (lastMove && (square === lastMove.from || square === lastMove.to)) classes.push('last');
          if (square === checkSquare) classes.push('check');
          if (drag?.moved && drag.over === square && targets?.has(square)) classes.push('target');
          return (
            <div key={square} className={classes.join(' ')}>
              {showCoords && vcol === 0 && (
                <span className="coord rank">{flipped ? vrow + 1 : 8 - vrow}</span>
              )}
              {showCoords && vrow === 7 && (
                <span className="coord file">{flipped ? FILES[7 - vcol] : FILES[vcol]}</span>
              )}
            </div>
          );
        })}

        <div className="layer">
          {board.map((cell, square) => {
            if (!cell) return null;
            const { row, col } = visual(square);
            const isMoved = lastMove && lastMove.to === square;
            let style = { transform: `translate(${col * 100}%, ${row * 100}%)` };
            let pieceStyle;
            let pieceClass = '';
            if (isMoved && lastMove.from !== undefined && lastMove.from !== null) {
              const origin = visual(lastMove.from);
              pieceClass = 'slide';
              pieceStyle = { '--dx': `${(origin.col - col) * 100}%`, '--dy': `${(origin.row - row) * 100}%` };
            }
            return (
              <div
                key={`${square}-${cell.color}-${cell.kind}`}
                className={`cell${drag?.moved && drag.from === square ? ' dragging' : ''}`}
                style={style}
              >
                <Piece game={type} color={cell.color} kind={cell.kind} className={pieceClass} style={pieceStyle} />
              </div>
            );
          })}

          {targets && [...targets.keys()].map((square) => {
            const { row, col } = visual(square);
            const occupied = Boolean(board[square]);
            const move = targets.get(square);
            const isCapture = occupied || move?.capture;
            const hot = drag?.moved && drag.over === square;
            return (
              <div
                key={`hint-${square}`}
                className="cell"
                style={{ transform: `translate(${col * 100}%, ${row * 100}%)` }}
              >
                <span className={`hint${isCapture ? ' capture' : ''}${hot ? ' hot' : ''}`}><i /></span>
              </div>
            );
          })}
        </div>
      </div>

      {dragPiece && (
        <div className="drag-layer">
          <div
            className="drag-piece"
            style={{
              left: drag.x,
              top: drag.y,
              width: (boardRef.current?.getBoundingClientRect().width || 400) / 8,
              height: (boardRef.current?.getBoundingClientRect().width || 400) / 8,
            }}
          >
            <Piece game={type} color={dragPiece.color} kind={dragPiece.kind} />
          </div>
        </div>
      )}
    </div>
  );
}
