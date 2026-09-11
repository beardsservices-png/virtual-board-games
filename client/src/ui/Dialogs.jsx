import Piece from './Pieces.jsx';

export function PromotionPicker({ color, onPick, onCancel }) {
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <span className="eyebrow">Pawn reached the end</span>
        <h2 style={{ marginTop: 6 }}>Promote to</h2>
        <div className="promo">
          {['q', 'r', 'b', 'n'].map((kind) => (
            <button key={kind} type="button" onClick={() => onPick(kind)} aria-label={kind}>
              <Piece game="chess" color={color} kind={kind} />
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel move</button>
      </div>
    </div>
  );
}

const MARK = { win: '🏆', lose: '🫡', draw: '🤝' };

export function EndOverlay({ title, detail, outcome, actions, onClose }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-label={title}>
        <div className="result-mark">{MARK[outcome] || '♟'}</div>
        <h2>{title}</h2>
        <p>{detail}</p>
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, detail, confirmLabel = 'Confirm', onConfirm, onCancel }) {
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        <p>{detail}</p>
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Never mind</button>
          <button className="btn btn-primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
