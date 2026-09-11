import { useCallback, useEffect, useState } from 'react';
import Home from './ui/Home.jsx';
import GameScreen from './ui/GameScreen.jsx';
import { prefs as prefsStore } from './lib/storage.js';
import { setSoundEnabled, unlockAudio } from './lib/sound.js';

/**
 * Routing is a handful of paths, so it is a handful of lines rather than a
 * dependency: `/` for the lobby, `/play/:type/:mode` for a game on this device,
 * `/g/:CODE` for an online one. Real URLs mean a refresh, a bookmark and a
 * shared link all land where you expect.
 */
function parse(pathname) {
  const parts = pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (parts[0] === 'g' && parts[1]) return { screen: 'online', code: parts[1].toUpperCase() };
  if (parts[0] === 'play' && parts[1] && parts[2]) return { screen: 'play', type: parts[1], mode: parts[2] };
  return { screen: 'home' };
}

export default function App() {
  const [route, setRoute] = useState(() => parse(window.location.pathname));
  const [prefs, setPrefsState] = useState(() => ({ board: 'walnut', sound: true, coords: true, ...prefsStore.get() }));
  const [session, setSession] = useState(null);
  const [toastText, setToastText] = useState(null);

  const setPrefs = useCallback((patch) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      prefsStore.set(patch);
      return next;
    });
  }, []);

  const toast = useCallback((text) => {
    setToastText(text);
    window.clearTimeout(toast._timer);
    toast._timer = window.setTimeout(() => setToastText(null), 2600);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-board', prefs.board || 'walnut');
  }, [prefs.board]);

  useEffect(() => { setSoundEnabled(prefs.sound !== false); }, [prefs.sound]);

  useEffect(() => {
    const onPop = () => { setRoute(parse(window.location.pathname)); };
    window.addEventListener('popstate', onPop);
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('pointerdown', unlock);
    };
  }, []);

  const go = useCallback((path, nextSession = null) => {
    window.history.pushState({}, '', path);
    setSession(nextSession);
    setRoute(parse(path));
  }, []);

  const startLocal = useCallback((config) => {
    go(`/play/${config.type}/${config.mode}`, config);
  }, [go]);

  const joinOnline = useCallback((code) => {
    go(`/g/${code}`, null);
  }, [go]);

  const goHome = useCallback(() => go('/'), [go]);

  let content;
  if (route.screen === 'online') {
    content = (
      <GameScreen
        key={route.code}
        session={{ mode: 'online', code: route.code, name: prefs.name }}
        prefs={prefs} setPrefs={setPrefs} toast={toast}
        onExit={goHome} onNewGame={goHome}
      />
    );
  } else if (route.screen === 'play') {
    // A refresh lands here with no in-memory session; rebuild it from prefs and
    // the saved game so reloading mid-game is not a reset.
    const config = session || {
      mode: route.mode,
      type: route.type,
      level: prefs.level || 2,
      myColor: route.type === 'chess' ? 'w' : 'r',
    };
    content = (
      <GameScreen
        key={`${config.type}-${config.mode}-${config.myColor}-${config.level}`}
        session={config}
        prefs={prefs} setPrefs={setPrefs} toast={toast}
        onExit={goHome} onNewGame={goHome}
      />
    );
  } else {
    content = <Home prefs={prefs} setPrefs={setPrefs} onStart={startLocal} onJoin={joinOnline} toast={toast} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={goHome}>
          <span className="brand-mark"><i /><i /><i /><i /></span>
          Board Room
        </button>
        <div className="topbar-spacer" />
        {route.screen !== 'home' && (
          <button className="btn btn-sm btn-ghost" onClick={goHome}>Lobby</button>
        )}
      </header>
      {content}
      {toastText && <div className="toast" role="status">{toastText}</div>}
    </div>
  );
}
