/**
 * Original vector pieces. Deliberately hand-drawn rather than pulled from a
 * sprite set so the whole board is one visual system and there is no asset
 * licence riding along with the repo.
 *
 * Every piece is authored in a 45x45 box, the traditional chess-set viewBox, so
 * the shapes line up with each other without per-piece fiddling.
 */

const LIGHT = { fill: '#f7f2e7', stroke: '#211d18', detail: '#211d18' };
const DARK = { fill: '#2f2924', stroke: '#0d0b09', detail: '#b9ac99' };

const CHESS_SHAPES = {
  p: (s) => (
    <>
      <circle cx="22.5" cy="14.2" r="4.9" fill={s.fill} stroke={s.stroke} strokeWidth="1.5" />
      <path d="M17.4 19.2h10.2c.6 1.9-.4 3.3-1.6 4.2 3 1.8 5 5 5.6 8.6H13.4c.6-3.6 2.6-6.8 5.6-8.6-1.2-.9-2.2-2.3-1.6-4.2z"
        fill={s.fill} stroke={s.stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12.2 32h20.6l1.6 4.6H10.6z" fill={s.fill} stroke={s.stroke} strokeWidth="1.5" strokeLinejoin="round" />
    </>
  ),
  r: (s) => (
    <>
      <path d="M11 9h4.2v3.3h4.3V9h6v3.3h4.3V9H34v8.2H11z"
        fill={s.fill} stroke={s.stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M14.6 17.2h15.8l-1.4 13.4H16z"
        fill={s.fill} stroke={s.stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12.4 30.6h20.2l2 6H10.4z"
        fill={s.fill} stroke={s.stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M16.6 21.4h11.8M16.2 26.4h12.6" stroke={s.detail} strokeWidth="1.1" opacity="0.5" />
    </>
  ),
  n: (s) => (
    <>
      <path d="M13.6 31c-.6-3.2.3-5.8 2.4-7.7l-2.6 2.2c-1.4 1.2-3.3.8-3.8-.8-.6-2 .4-4 2.3-5.5l7.8-6.3.3-5.3c.1-1.6 2-2.3 3.1-1l2 2.4 2.2-2.5c1-1.2 2.9-.5 3 1.1l.3 5c3.6 3.3 5.8 8.1 5.8 13.4V31z"
        fill={s.fill} stroke={s.stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M11.4 31h22.4l1.6 5.6H9.8z"
        fill={s.fill} stroke={s.stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="25.2" cy="16.4" r="1.45" fill={s.detail} />
      <path d="M27.6 20.6c2.6 2.3 4 5.6 4.2 9.4" stroke={s.detail} strokeWidth="1.2" fill="none" opacity="0.55" />
    </>
  ),
  b: (s) => (
    <>
      <circle cx="22.5" cy="7.6" r="2.4" fill={s.fill} stroke={s.stroke} strokeWidth="1.4" />
      <path d="M22.5 10.2c-4 2.7-6.9 7-6.9 11.2 0 3 1.5 5.6 3.8 7.2h6.2c2.3-1.6 3.8-4.2 3.8-7.2 0-4.2-2.9-8.5-6.9-11.2z"
        fill={s.fill} stroke={s.stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M19.3 18.2l6.4 6.4" stroke={s.detail} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <path d="M15 28.6h15l1.2 3.2H13.8z"
        fill={s.fill} stroke={s.stroke} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12.2 31.8h20.6l2 4.8H10.2z"
        fill={s.fill} stroke={s.stroke} strokeWidth="1.5" strokeLinejoin="round" />
    </>
  ),
  q: (s) => (
    <>
      <path d="M9 17.6L12 30h21l3-12.4-6.2 5.2-3.9-9.6-3.4 8.2-3.4-8.2-3.9 9.6z"
        fill={s.fill} stroke={s.stroke} strokeWidth="1.5" strokeLinejoin="round" />
      {[[9, 15.4], [15.6, 12.2], [22.5, 10.2], [29.4, 12.2], [36, 15.4]].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={i === 2 ? 2.5 : 2.2} fill={s.fill} stroke={s.stroke} strokeWidth="1.4" />
      ))}
      <path d="M11.6 30h21.8l1.1 3.4H10.5z" fill={s.fill} stroke={s.stroke} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M9.8 33.4h25.4l1.6 4.2H8.2z" fill={s.fill} stroke={s.stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M13.4 26.6h18.2" stroke={s.detail} strokeWidth="1.1" opacity="0.45" />
    </>
  ),
  k: (s) => (
    <>
      <path d="M22.5 5.6v7.2M19.1 9h6.8" stroke={s.stroke} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M22.5 13.4c-1.7 2.7-5.4 4.2-8.6 4.2-2.6 0-4.6 1.7-4.6 4.3 0 3.2 3.1 6.2 6.2 8.6h14c3.1-2.4 6.2-5.4 6.2-8.6 0-2.6-2-4.3-4.6-4.3-3.2 0-6.9-1.5-8.6-4.2z"
        fill={s.fill} stroke={s.stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M11.6 30.5h21.8l1.1 3.2H10.5z" fill={s.fill} stroke={s.stroke} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M9.8 33.7h25.4l1.6 4.1H8.2z" fill={s.fill} stroke={s.stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M15.4 26.2c3.4-2.6 10.8-2.6 14.2 0" stroke={s.detail} strokeWidth="1.2" fill="none" opacity="0.55" />
    </>
  ),
};

const CHECKER_COLORS = {
  r: { top: '#e2604c', bottom: '#a3311f', edge: '#7d2213', ink: '#ffe4dc' },
  b: { top: '#4a4741', bottom: '#221f1b', edge: '#100e0c', ink: '#ded4c4' },
};

function Checker({ color, king }) {
  const c = CHECKER_COLORS[color] || CHECKER_COLORS.b;
  const id = `chk-${color}`;
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c.top} />
          <stop offset="100%" stopColor={c.bottom} />
        </linearGradient>
      </defs>
      {/* the stacked edge that gives the disc physical thickness */}
      <ellipse cx="22.5" cy="26.4" rx="16.4" ry="14.2" fill={c.edge} />
      <ellipse cx="22.5" cy="23.4" rx="16.4" ry="14.2" fill={`url(#${id})`} stroke={c.edge} strokeWidth="1.2" />
      <ellipse cx="22.5" cy="23.4" rx="12.6" ry="10.9" fill="none" stroke={c.ink} strokeWidth="1.1" opacity="0.35" />
      <ellipse cx="22.5" cy="23.4" rx="9.8" ry="8.4" fill="none" stroke={c.ink} strokeWidth="0.9" opacity="0.22" />
      {king ? (
        <g transform="translate(22.5 23.4) scale(0.86)" fill="none" stroke={c.ink} strokeWidth="2.1"
           strokeLinejoin="round" strokeLinecap="round" opacity="0.95">
          <path d="M-8 4l-1.6-9 5 3.6L0-8l4.6 6.6 5-3.6L8 4z" />
          <path d="M-7.4 7.2h14.8" />
        </g>
      ) : (
        <ellipse cx="22.5" cy="23.4" rx="6.2" ry="5.3" fill={c.ink} opacity="0.12" />
      )}
    </>
  );
}

/**
 * @param {'chess'|'checkers'} game
 * @param {string} color  'w'|'b' for chess, 'r'|'b' for checkers
 * @param {string} kind   'p'|'n'|'b'|'r'|'q'|'k' for chess, 'man'|'king' for checkers
 */
export default function Piece({ game, color, kind, className = '', style }) {
  if (game === 'checkers') {
    return (
      <svg className={`piece ${className}`} style={style} viewBox="0 0 45 45" aria-hidden="true">
        <Checker color={color} king={kind === 'king'} />
      </svg>
    );
  }
  const shape = CHESS_SHAPES[kind];
  if (!shape) return null;
  return (
    <svg className={`piece ${className}`} style={style} viewBox="0 0 45 45" aria-hidden="true">
      <g strokeLinecap="round">{shape(color === 'w' ? LIGHT : DARK)}</g>
    </svg>
  );
}

export const PIECE_NAMES = {
  p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King',
  man: 'Checker', king: 'King',
};
