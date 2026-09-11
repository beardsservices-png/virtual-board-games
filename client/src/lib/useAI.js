import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Drives the search worker. The worker is what keeps the board responsive
 * while "Brutal" spends four seconds thinking, and a floor on the reply delay
 * stops the easy levels from answering so fast it reads as a glitch.
 */
export default function useAI() {
  const workerRef = useRef(null);
  const pending = useRef(new Map());
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    const worker = new Worker(new URL('../engine/ai.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      const { id, move, error } = event.data || {};
      const entry = pending.current.get(id);
      if (!entry) return;
      pending.current.delete(id);
      if (pending.current.size === 0) setThinking(false);
      if (error) entry.reject(new Error(error));
      else entry.resolve(move);
    };
    workerRef.current = worker;
    return () => { worker.terminate(); workerRef.current = null; pending.current.clear(); };
  }, []);

  const think = useCallback((type, state, level, { minMs = 380 } = {}) => {
    const worker = workerRef.current;
    if (!worker) return Promise.resolve(null);
    const id = `${Date.now()}-${Math.random()}`;
    setThinking(true);
    const started = Date.now();
    return new Promise((resolve, reject) => {
      pending.current.set(id, {
        resolve: (move) => {
          const wait = Math.max(0, minMs - (Date.now() - started));
          setTimeout(() => resolve(move), wait);
        },
        reject,
      });
      worker.postMessage({ id, type, state, level });
    });
  }, []);

  const cancel = useCallback(() => { pending.current.clear(); setThinking(false); }, []);

  return { think, thinking, cancel };
}
