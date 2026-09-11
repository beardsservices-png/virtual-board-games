import { useState } from 'react';
import { LEVELS } from '../engine/levels.js';
import { rulesFor } from '../engine/games.js';
import { localGame, playerId } from '../lib/storage.js';

const GAMES = [
  { id: 'chess', name: 'Chess' },
  { id: 'checkers', name: 'Checkers' },
];

export default function Home({ prefs, setPrefs, onStart, onJoin, toast }) {
  const [type, setType] = useState(prefs.lastType || 'chess');
  const [stage, setStage] = useState('modes');
  const [level, setLevel] = useState(prefs.level || 2);
  const [side, setSide] = useState('bottom');
  const [joinCode, setJoinCode] = useState('');
  const [name, setName] = useState(prefs.name || '');
  const [busy, setBusy] = useState(false);

  const rules = rulesFor(type);
  const [first, second] = rules.colors;
  const saved = localGame.load(type);
  const hasSaved = saved && saved.history?.length > 0 && !saved.result;

  const chooseType = (next) => {
    setType(next);
    setStage('modes');
    setPrefs({ lastType: next });
  };

  const startAI = () => {
    const myColor = side === 'bottom' ? first : side === 'top' ? second : (Math.random() < 0.5 ? first : second);
    setPrefs({ level, name });
    onStart({ mode: 'ai', type, level, myColor });
  };

  const createOnline = async (hostColor) => {
    setBusy(true);
    try {
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, hostColor, hostName: name || 'Host', hostPlayerId: playerId() }),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Could not create the game');
      const { code } = await response.json();
      setPrefs({ name });
      onJoin(code);
    } catch (err) {
      toast(err.message || 'Could not reach the server');
    } finally {
      setBusy(false);
    }
  };

  const join = (event) => {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) { toast('A game code is four characters'); return; }
    setPrefs({ name });
    onJoin(code);
  };

  return (
    <div className="home">
      <header className="hero">
        <h1>A board that&rsquo;s always <em>set up</em></h1>
        <p>Chess and checkers — across the table, against the computer, or with someone anywhere on a shared link.</p>
      </header>

      <div className="choice-row">
        <div className="seg" role="group" aria-label="Choose a game">
          {GAMES.map((g) => (
            <button key={g.id} aria-pressed={type === g.id} onClick={() => chooseType(g.id)}>{g.name}</button>
          ))}
        </div>
      </div>

      {hasSaved && stage === 'modes' && (
        <div className="card panel" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <span className="eyebrow">Unfinished</span>
            <div style={{ fontWeight: 600 }}>
              {saved.mode === 'ai' ? `vs Computer · ${LEVELS.find((l) => l.id === saved.level)?.name}` : 'Pass &amp; play'}
              <span className="muted tiny"> · {saved.history.length} moves in</span>
            </div>
          </div>
          <button className="btn btn-primary btn-sm"
            onClick={() => onStart({ mode: saved.mode, type, level: saved.level, myColor: saved.myColor })}>
            Resume
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => { localGame.clear(type); toast('Saved game cleared'); }}>
            Discard
          </button>
        </div>
      )}

      {stage === 'modes' && (
        <div className="mode-grid">
          <button className="mode-card" onClick={() => onStart({ mode: 'local', type, myColor: first })}>
            <span className="mode-icon">👥</span>
            <h3>Pass &amp; play</h3>
            <p>One device, two people. The board turns itself around for whoever is to move.</p>
          </button>
          <button className="mode-card" onClick={() => setStage('ai')}>
            <span className="mode-icon">🤖</span>
            <h3>Play the computer</h3>
            <p>Four levels, from careless to genuinely hard. It thinks in the background.</p>
          </button>
          <button className="mode-card" onClick={() => setStage('online')}>
            <span className="mode-icon">🔗</span>
            <h3>Play online</h3>
            <p>Send a link. Moves land live, and the game survives a closed tab.</p>
          </button>
        </div>
      )}

      {stage === 'ai' && (
        <div className="card panel stack">
          <div>
            <span className="eyebrow">Difficulty</span>
            <div className="mode-grid" style={{ marginTop: 10 }}>
              {LEVELS.map((l) => (
                <button key={l.id} className="mode-card" style={{ padding: 14 }}
                  aria-pressed={level === l.id}
                  onClick={() => setLevel(l.id)}>
                  <h3 style={{ color: level === l.id ? 'var(--accent)' : undefined }}>{l.name}</h3>
                  <p>{l.blurb}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="eyebrow">You play</span>
            <div className="field-row" style={{ marginTop: 10 }}>
              <div className="seg">
                <button aria-pressed={side === 'bottom'} onClick={() => setSide('bottom')}>{rules.label(first)}</button>
                <button aria-pressed={side === 'top'} onClick={() => setSide('top')}>{rules.label(second)}</button>
                <button aria-pressed={side === 'random'} onClick={() => setSide('random')}>Random</button>
              </div>
            </div>
            <p className="tiny muted" style={{ margin: '8px 0 0' }}>
              {rules.label(first)} moves first.
            </p>
          </div>
          <div className="field-row">
            <button className="btn btn-primary" onClick={startAI}>Start game</button>
            <button className="btn btn-ghost" onClick={() => setStage('modes')}>Back</button>
          </div>
        </div>
      )}

      {stage === 'online' && (
        <div className="stack">
          <div className="card panel stack">
            <div>
              <span className="eyebrow">Your name</span>
              <input className="input" style={{ width: '100%', marginTop: 8 }} value={name} maxLength={24}
                placeholder="Shown to your opponent" onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <span className="eyebrow">Start a game</span>
              <div className="field-row" style={{ marginTop: 10 }}>
                <button className="btn btn-primary" disabled={busy} onClick={() => createOnline(first)}>
                  Play as {rules.label(first)}
                </button>
                <button className="btn" disabled={busy} onClick={() => createOnline(second)}>
                  Play as {rules.label(second)}
                </button>
                <button className="btn btn-ghost" disabled={busy} onClick={() => createOnline('random')}>Random</button>
              </div>
              <p className="tiny muted" style={{ margin: '10px 0 0' }}>
                You get a four-character code and a link to send. The board waits for them.
              </p>
            </div>
          </div>

          <form className="card panel stack" onSubmit={join}>
            <span className="eyebrow">Join with a code</span>
            <div className="field-row">
              <input className="input input-code" value={joinCode} maxLength={4} inputMode="text"
                autoCapitalize="characters" autoCorrect="off" spellCheck="false" placeholder="ABCD"
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
              <button className="btn btn-primary" type="submit">Join game</button>
            </div>
          </form>

          <div className="field-row">
            <button className="btn btn-ghost" onClick={() => setStage('modes')}>Back</button>
          </div>
        </div>
      )}

      <div className="divider" />
      <p className="tiny muted" style={{ textAlign: 'center' }}>
        {type === 'chess'
          ? 'Full rules: castling, en passant, promotion, stalemate, threefold repetition and the fifty-move rule.'
          : 'American checkers: captures are compulsory, jump chains must be played out, and crowning ends the turn.'}
      </p>
    </div>
  );
}
