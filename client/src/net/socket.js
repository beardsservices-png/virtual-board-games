import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { playerId } from '../lib/storage.js';

let shared = null;

export function socket() {
  if (!shared) {
    shared = io({
      autoConnect: true,
      transports: ['websocket', 'polling'],
      reconnectionDelay: 700,
      reconnectionDelayMax: 4000,
    });
  }
  return shared;
}

/**
 * Subscribe to one online game. The server is authoritative, so this only ever
 * sends intents and renders whatever comes back — which is also what makes a
 * refresh, a dropped signal or a redeploy recoverable.
 */
export function useOnlineGame(code, name) {
  const [game, setGame] = useState(null);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  const me = useRef(playerId()).current;

  useEffect(() => {
    if (!code) return undefined;
    const s = socket();

    const join = () => {
      setConnected(true);
      s.emit('game:join', { code, playerId: me, name });
    };
    const onState = (payload) => { setError(null); setGame(payload); };
    const onError = (payload) => setError(payload?.message || 'Something went wrong');
    const onDisconnect = () => setConnected(false);

    s.on('connect', join);
    s.on('game:state', onState);
    s.on('game:error', onError);
    s.on('disconnect', onDisconnect);
    if (s.connected) join();

    return () => {
      s.off('connect', join);
      s.off('game:state', onState);
      s.off('game:error', onError);
      s.off('disconnect', onDisconnect);
    };
  }, [code, me, name]);

  const send = (event, payload = {}) => socket().emit(event, { code, playerId: me, ...payload });

  return { game, error, connected, send, clearError: () => setError(null) };
}
