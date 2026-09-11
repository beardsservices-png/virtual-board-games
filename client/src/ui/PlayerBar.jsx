import Piece from './Pieces.jsx';

const AVATAR_CLASS = { w: 'light', b: 'dark', r: 'red' };

/**
 * One side's name, connection state and captured pieces. The bar for whoever is
 * to move lights up — on a phone that is the clearest possible turn indicator,
 * and it costs no vertical space.
 */
export default function PlayerBar({ type, color, name, active, online, captured = [], capturedColor, advantage = 0, sub }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <div className={`player-bar${active ? ' active' : ''}`}>
      <div className={`avatar ${AVATAR_CLASS[color] || 'dark'}`}>{initial}</div>
      <div style={{ minWidth: 0 }}>
        <div className="player-name">{name}</div>
        {sub && <div className="tiny muted">{sub}</div>}
      </div>
      <div className="bar-spacer" />
      <div className="tray">
        {captured.map((kind, i) => (
          <Piece key={i} game={type} color={capturedColor} kind={kind} />
        ))}
        {advantage > 0 && <span className="adv">+{advantage}</span>}
      </div>
      {online !== undefined && <span className={`dot${online ? ' on' : ''}`} title={online ? 'Connected' : 'Not connected'} />}
    </div>
  );
}
