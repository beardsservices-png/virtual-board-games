import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Board from './Board.jsx';
import PlayerBar from './PlayerBar.jsx';
import MoveList from './MoveList.jsx';
import { PromotionPicker, EndOverlay, ConfirmDialog } from './Dialogs.jsx';
import { rulesFor, replay } from '../engine/games.js';
import { LEVELS } from '../engine/levels.js';
import { useOnlineGame } from '../net/socket.js';
import useAI from '../lib/useAI.js';
import useMediaQuery from '../lib/useMediaQuery.js';
import { localGame } from '../lib/storage.js';
import { playForMove, sounds, unlockAudio } from '../lib/sound.js';

const BOARD_THEMES = [
  { id: 'walnut', name: 'Walnut', light: '#e9dcc3', dark: '#9c7148' },
  { id: 'emerald', name: 'Emerald', light: '#ecdfc4', dark: '#4e7a5c' },
  { id: 'slate', name: 'Slate', light: '#dfe3e8', dark: '#6a7a8c' },
  { id: 'midnight', name: 'Midnight', light: '#b9c2d6', dark: '#39425c' },
  { id: 'rosewood', name: 'Rosewood', light: '#efdccd', dark: '#9c5f5a' },
];

export default function GameScreen({ session, prefs, setPrefs, onExit, onNewGame, toast }) {
  const { mode, code, level = 2, myColor: chosenColor, name } = session;
  const isOnline = mode === 'online';
  const narrow = useMediaQuery('(max-width: 940px)');

  // An online game's type is the server's to state, not the URL's — the link
  // that was shared says nothing about which game is on the board.
  const online = useOnlineGame(isOnline ? code : null, name);
  const type = isOnline ? online.game?.type || 'chess' : session.type;
  const rules = useMemo(() => rulesFor(type), [type]);

  /* ------------------------------------------------------------ game state */

  const [offline, setOffline] = useState(() => {
    if (isOnline) return null;
    const saved = localGame.load(type);
    if (saved && saved.mode === mode && saved.level === level && saved.myColor === chosenColor) {
      return { state: saved.state, history: saved.history, result: saved.result ?? null };
    }
    return { state: rules.initial(), history: [], result: null };
  });

  const ai = useAI();

  const game = isOnline
    ? (online.game && { state: online.game.state, history: online.game.history, result: online.game.winner ? { winner: online.game.winner, reason: online.game.reason } : null })
    : offline;

  const myColor = isOnline ? online.game?.you ?? null : chosenColor;
  const [first, second] = rules.colors;

  /* --------------------------------------------------------------- view state */

  const [selected, setSelected] = useState(null);
  const [viewPly, setViewPly] = useState(null);
  const [promotion, setPromotion] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [flippedManually, setFlippedManually] = useState(null);
  const [tab, setTab] = useState('moves');
  const [dismissedEnd, setDismissedEnd] = useState(false);
  const lastSounded = useRef(0);

  const live = viewPly === null;
  const shownState = live ? game?.state : replay(type, game?.history || [], viewPly + 1);

  const orientation = flippedManually ?? (mode === 'local' ? first : myColor || first);
  const flipped = orientation === second;

  /* -------------------------------------------------------------- derived */

  const boardCells = useMemo(() => (shownState ? rules.boardView(shownState) : new Array(64).fill(null)), [rules, shownState]);
  const turn = shownState ? rules.turn(shownState) : first;
  const result = game?.result || null;
  const chainSquare = live && shownState ? rules.chainSquare(shownState) : null;

  const myTurn = useMemo(() => {
    if (!live || result) return false;
    if (mode === 'local') return true;
    if (mode === 'ai') return turn === myColor;
    return Boolean(myColor) && turn === myColor && online.game?.status !== 'waiting';
  }, [live, result, mode, turn, myColor, online.game?.status]);

  const legal = useMemo(
    () => (live && shownState && !result ? rules.legalMoves(shownState) : []),
    [rules, shownState, live, result]
  );

  const movable = useMemo(() => {
    if (!myTurn) return new Set();
    return new Set(legal.map((m) => m.from));
  }, [legal, myTurn]);

  const targets = useMemo(() => {
    if (selected === null) return null;
    const map = new Map();
    for (const m of legal) if (m.from === selected && !map.has(m.to)) map.set(m.to, m);
    return map.size ? map : null;
  }, [legal, selected]);

  const lastMove = useMemo(() => {
    const history = game?.history || [];
    const index = live ? history.length - 1 : viewPly;
    const rec = history[index];
    return rec ? { from: rec.from, to: rec.to } : null;
  }, [game?.history, live, viewPly]);

  const captured = useMemo(() => (shownState ? rules.captured(shownState) : { [first]: [], [second]: [] }), [rules, shownState, first, second]);
  const balance = shownState ? rules.materialScore(shownState) : 0;

  /* ------------------------------------------------------------- reactions */

  // A jump chain is not optional, so pre-select the piece that has to keep going.
  useEffect(() => {
    if (chainSquare !== null && chainSquare !== undefined) setSelected(chainSquare);
  }, [chainSquare]);

  useEffect(() => { if (!live) setSelected(null); }, [live]);

  // Sound whatever just landed, once, whoever played it.
  useEffect(() => {
    const history = game?.history || [];
    if (history.length === lastSounded.current) return;
    if (history.length > lastSounded.current && history.length > 0) {
      playForMove(history[history.length - 1]);
    }
    lastSounded.current = history.length;
  }, [game?.history]);

  useEffect(() => {
    if (!result) { setDismissedEnd(false); return; }
    if (result.winner === 'draw') return;
    const won = mode === 'local' ? true : result.winner === myColor;
    const timer = setTimeout(() => (won ? sounds.win() : sounds.lose()), 220);
    return () => clearTimeout(timer);
  }, [result, mode, myColor]);

  // Persist pass-and-play and vs-computer games so a refresh does not lose them.
  useEffect(() => {
    if (isOnline || !offline) return;
    localGame.save(type, { mode, level, myColor: chosenColor, ...offline });
  }, [isOnline, offline, type, mode, level, chosenColor]);

  /* ---------------------------------------------------------- applying moves */

  const commit = useCallback((move) => {
    if (isOnline) {
      online.send('game:move', { move: { from: move.from, to: move.to, promotion: move.promotion || null } });
      setSelected(null);
      return;
    }
    setOffline((prev) => {
      if (!prev) return prev;
      const applied = rules.applyMove(prev.state, move);
      if (!applied) { sounds.illegal(); return prev; }
      return { state: applied.state, history: [...prev.history, applied.record], result: applied.result };
    });
    setSelected(null);
  }, [isOnline, online, rules]);

  const attemptMove = useCallback((from, to) => {
    unlockAudio();
    const candidates = legal.filter((m) => m.from === from && m.to === to);
    if (candidates.length === 0) { sounds.illegal(); return; }
    if (rules.needsPromotionChoice(candidates[0])) { setPromotion({ from, to }); return; }
    commit({ from, to, promotion: candidates[0].promotion || null });
  }, [legal, rules, commit]);

  const onSelect = useCallback((square) => {
    unlockAudio();
    // Mid-chain the piece is not really selectable — it is committed.
    if (chainSquare !== null && chainSquare !== undefined) { setSelected(chainSquare); return; }
    setSelected(square);
  }, [chainSquare]);

  /* ------------------------------------------------------------- computer */

  // Think once per position, keyed on the state object itself. Keying on the
  // move count instead would skip a think after a take-back returned the board
  // to a length it had already reached.
  const thoughtAbout = useRef(null);
  const { think: aiThink } = ai;

  useEffect(() => {
    if (mode !== 'ai' || !offline || offline.result || !live) return;
    if (rules.turn(offline.state) === chosenColor) return;
    if (thoughtAbout.current === offline.state) return;
    thoughtAbout.current = offline.state;

    aiThink(type, offline.state, level)
      .then((move) => {
        if (!move) return;
        setOffline((prev) => {
          if (!prev || prev.result || prev.state !== offline.state) return prev;
          const applied = rules.applyMove(prev.state, move);
          if (!applied) return prev;
          return { state: applied.state, history: [...prev.history, applied.record], result: applied.result };
        });
      })
      .catch(() => toast('The computer stumbled — your move stands.'));
  }, [mode, offline, live, rules, chosenColor, aiThink, type, level, toast]);

  /* -------------------------------------------------------------- actions */

  const undo = () => {
    setOffline((prev) => {
      if (!prev || prev.history.length === 0) return prev;
      // Take back to the player's own last move, so vs-computer undoes a pair.
      let back = 1;
      if (mode === 'ai') {
        const last = prev.history[prev.history.length - 1];
        back = last.color === chosenColor ? 1 : Math.min(2, prev.history.length);
      }
      const history = prev.history.slice(0, prev.history.length - back);
      lastSounded.current = history.length;
      return { state: replay(type, history), history, result: null };
    });
    setViewPly(null);
    setSelected(null);
  };

  const restart = () => {
    setConfirming(null);
    if (isOnline) { online.send('game:rematch'); return; }
    lastSounded.current = 0;
    setOffline({ state: rules.initial(), history: [], result: null });
    setViewPly(null);
    setSelected(null);
    setDismissedEnd(false);
  };

  const shareLink = typeof window !== 'undefined' ? `${window.location.origin}/g/${code}` : '';

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied`);
    } catch {
      toast(`Copy this: ${text}`);
    }
  };

  /* ----------------------------------------------------------------- render */

  if (isOnline && !online.game) {
    return (
      <div className="game"><div className="board-col"><div className="board-stage">
        <div className="status-strip"><span className="msg">
          {online.error ? online.error : 'Connecting to the game…'}
        </span></div>
        {online.error && <button className="btn" onClick={onExit} style={{ marginTop: 12 }}>Back to the lobby</button>}
      </div></div></div>
    );
  }

  const nameFor = (color) => {
    if (isOnline) return online.game?.seats?.[color]?.name || 'Waiting…';
    if (mode === 'ai') return color === chosenColor ? 'You' : `Computer · ${LEVELS.find((l) => l.id === level)?.name}`;
    return rules.label(color);
  };

  const topColor = flipped ? first : second;
  const bottomColor = flipped ? second : first;

  const statusMessage = () => {
    if (result) {
      if (result.winner === 'draw') return `Draw — ${result.reason.toLowerCase()}`;
      return `${rules.label(result.winner)} wins — ${result.reason.toLowerCase()}`;
    }
    if (!live) return 'Reviewing an earlier position';
    if (isOnline && online.game?.status === 'waiting') return 'Waiting for an opponent to join';
    if (chainSquare !== null && chainSquare !== undefined) return 'Keep jumping — that piece must take again';
    if (type === 'checkers' && rules.mustCapture(shownState)) {
      return myTurn ? 'You have a jump — a capture is compulsory' : `${rules.label(turn)} must jump`;
    }
    if (rules.checkSquare(shownState) !== null) {
      return myTurn || mode === 'local' ? `${rules.label(turn)} is in check` : 'Check!';
    }
    if (mode === 'local') return `${rules.label(turn)} to move`;
    if (myTurn) return 'Your move';
    return mode === 'ai' ? 'Computer is thinking' : `Waiting for ${rules.label(turn)}`;
  };

  const statusTone = () => {
    if (result) return 'msg';
    if (chainSquare !== null && chainSquare !== undefined) return 'msg warn';
    if (shownState && rules.checkSquare(shownState) !== null) return 'msg bad';
    return 'msg';
  };

  /* One definition of each panel, arranged differently by width: stacked in a
     sidebar on a desktop, behind tabs under the board on a phone. */

  const MovesPanel = () => (
    <MoveList type={type} history={game?.history || []} viewPly={viewPly} onScrub={setViewPly} />
  );

  const InvitePanel = () => (!isOnline ? null : (
    <div className="card panel">
      <h4>Invite</h4>
      <div className="share-code">
        <b>{code}</b>
        <button className="btn btn-sm" onClick={() => copy(code, 'Code')}>Copy code</button>
      </div>
      <button className="btn btn-sm" style={{ width: '100%', marginTop: 10 }}
        onClick={() => copy(shareLink, 'Link')}>Copy invite link</button>
      <p className="tiny muted" style={{ margin: '10px 0 0' }}>
        Whoever opens the link first takes the empty seat. Anyone after that watches.
      </p>
    </div>
  ));

  const GamePanel = () => (
    <div className="card panel">
      <h4>Game</h4>
      <div className="opts">
        <div className="field-row">
          <button className="btn btn-sm" onClick={() => setFlippedManually(flipped ? first : second)}>Flip board</button>
          {!isOnline && (
            <button className="btn btn-sm" onClick={undo} disabled={!game?.history?.length}>Take back</button>
          )}
          {isOnline && !result && (
            <button className="btn btn-sm btn-danger" onClick={() => setConfirming({ kind: 'resign' })}
              disabled={!myColor}>Resign</button>
          )}
        </div>
        <div className="field-row">
          <button className="btn btn-sm" onClick={() => setConfirming({ kind: 'restart' })}>
            {isOnline ? 'Offer rematch' : 'New game'}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={onNewGame}>Change game</button>
        </div>
        {isOnline && online.game?.rematchOffered && (
          <p className="tiny" style={{ margin: 0, color: 'var(--accent)' }}>Your opponent wants a rematch.</p>
        )}
        {isOnline && online.game?.rematchRequested && !online.game?.rematchOffered && (
          <p className="tiny muted" style={{ margin: 0 }}>Rematch offered — waiting on your opponent.</p>
        )}
      </div>
    </div>
  );

  const BoardPanel = () => (
    <div className="card panel">
      <h4>Board</h4>
      <div className="opts">
        <div className="opt-row">
          <span className="tiny muted">Theme</span>
          <div className="swatches">
            {BOARD_THEMES.map((theme) => (
              <button key={theme.id} className="swatch" aria-pressed={prefs.board === theme.id}
                title={theme.name} onClick={() => setPrefs({ board: theme.id })}>
                <i style={{ background: theme.light }} /><i style={{ background: theme.dark }} />
                <i style={{ background: theme.dark }} /><i style={{ background: theme.light }} />
              </button>
            ))}
          </div>
        </div>
        <div className="opt-row">
          <span className="tiny muted">Sound</span>
          <button className="btn btn-sm" onClick={() => setPrefs({ sound: !prefs.sound })}>
            {prefs.sound ? 'On' : 'Off'}
          </button>
        </div>
        <div className="opt-row">
          <span className="tiny muted">Coordinates</span>
          <button className="btn btn-sm" onClick={() => setPrefs({ coords: prefs.coords === false })}>
            {prefs.coords === false ? 'Hidden' : 'Shown'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="game">
      <div className="board-col">
        <div className="board-stage">
          <PlayerBar
            type={type} color={topColor} name={nameFor(topColor)}
            active={live && !result && turn === topColor}
            online={isOnline ? online.game?.online?.[topColor] : undefined}
            captured={captured[topColor === first ? second : first]}
            capturedColor={topColor === first ? second : first}
            advantage={topColor === first ? Math.max(0, balance) : Math.max(0, -balance)}
            sub={isOnline && myColor === topColor ? 'You' : undefined}
          />

          <Board
            type={type}
            board={boardCells}
            flipped={flipped}
            selected={selected}
            targets={myTurn ? targets : null}
            lastMove={lastMove}
            checkSquare={shownState ? rules.checkSquare(shownState) : null}
            movable={movable}
            interactive={myTurn}
            showCoords={prefs.coords !== false}
            onSelect={onSelect}
            onMove={attemptMove}
          />

          <PlayerBar
            type={type} color={bottomColor} name={nameFor(bottomColor)}
            active={live && !result && turn === bottomColor}
            online={isOnline ? online.game?.online?.[bottomColor] : undefined}
            captured={captured[bottomColor === first ? second : first]}
            capturedColor={bottomColor === first ? second : first}
            advantage={bottomColor === first ? Math.max(0, balance) : Math.max(0, -balance)}
            sub={isOnline && myColor === bottomColor ? 'You' : undefined}
          />

          <div className="status-strip">
            <span className={statusTone()}>{statusMessage()}</span>
            {ai.thinking && <span className="thinking"><i /><i /><i /></span>}
            <div className="bar-spacer" />
            {result && dismissedEnd && (
              <button className="btn btn-sm btn-primary" onClick={() => setConfirming({ kind: 'restart' })}>
                {isOnline ? 'Rematch' : 'Play again'}
              </button>
            )}
          </div>
        </div>
      </div>

      {narrow ? (
        <div className="side">
          <div className="seg mobile-tabs">
            {[['moves', 'Moves'], ['game', 'Game'], ['board', 'Board']].map(([id, label]) => (
              <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
          <div className="mobile-panel">
            {tab === 'moves' && <MovesPanel />}
            {tab === 'game' && <><InvitePanel /><GamePanel /></>}
            {tab === 'board' && <BoardPanel />}
          </div>
        </div>
      ) : (
        <aside className="side">
          <MovesPanel />
          <InvitePanel />
          <GamePanel />
          <BoardPanel />
        </aside>
      )}

      {promotion && (
        <PromotionPicker
          color={turn}
          onPick={(kind) => { commit({ ...promotion, promotion: kind }); setPromotion(null); }}
          onCancel={() => { setPromotion(null); setSelected(null); }}
        />
      )}

      {result && !dismissedEnd && (
        <EndOverlay
          outcome={result.winner === 'draw' ? 'draw' : (mode === 'local' ? 'win' : result.winner === myColor ? 'win' : 'lose')}
          title={
            result.winner === 'draw' ? 'Drawn'
              : mode === 'local' ? `${rules.label(result.winner)} wins`
              : result.winner === myColor ? 'You win' : 'You lose'
          }
          detail={result.reason}
          onClose={() => setDismissedEnd(true)}
          actions={
            <>
              <button className="btn btn-ghost" onClick={() => setDismissedEnd(true)}>Review the board</button>
              <button className="btn btn-primary" onClick={restart}>{isOnline ? 'Offer rematch' : 'Play again'}</button>
            </>
          }
        />
      )}

      {confirming?.kind === 'restart' && (
        <ConfirmDialog
          title={isOnline ? 'Offer a rematch?' : 'Start a new game?'}
          detail={isOnline ? 'Colours swap and the board resets once both of you agree.' : 'The current position will be cleared.'}
          confirmLabel={isOnline ? 'Offer rematch' : 'New game'}
          onConfirm={restart}
          onCancel={() => setConfirming(null)}
        />
      )}

      {confirming?.kind === 'resign' && (
        <ConfirmDialog
          title="Resign this game?"
          detail="Your opponent is awarded the win. This cannot be undone."
          confirmLabel="Resign"
          onConfirm={() => { online.send('game:resign'); setConfirming(null); }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
