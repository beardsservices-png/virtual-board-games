/**
 * localStorage with a seatbelt. Private windows and blocked site data both throw
 * on access, and none of this is important enough to take the page down with it.
 */
function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* not important enough to fail on */ }
}

const PLAYER_KEY = 'vbg.playerId';

/** Stable per-browser identity, so refreshing mid-game returns you to your seat. */
export function playerId() {
  let id = read(PLAYER_KEY, null);
  if (!id) {
    id = (crypto.randomUUID?.() || `p${Date.now()}${Math.random().toString(36).slice(2)}`);
    write(PLAYER_KEY, id);
  }
  return id;
}

export const prefs = {
  get: () => read('vbg.prefs', {}),
  set(patch) {
    const next = { ...this.get(), ...patch };
    write('vbg.prefs', next);
    return next;
  },
};

export const localGame = {
  key: (type) => `vbg.local.${type}`,
  load(type) { return read(this.key(type), null); },
  save(type, data) { write(this.key(type), data); },
  clear(type) { try { localStorage.removeItem(this.key(type)); } catch { /* ignore */ } },
};
