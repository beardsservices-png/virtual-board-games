/**
 * Synthesised move sounds. No audio files to ship, load or licence, and the
 * whole thing stays silent until the first real user gesture unlocks audio.
 */
let ctx = null;
let enabled = true;

function context() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function setSoundEnabled(on) { enabled = on; }
export function unlockAudio() { context(); }

function blip({ freq = 440, type = 'sine', duration = 0.09, gain = 0.13, sweep = 0, delay = 0 }) {
  const ac = context();
  if (!ac || !enabled) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t0 + duration);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function noise({ duration = 0.08, gain = 0.16, delay = 0 }) {
  const ac = context();
  if (!ac || !enabled) return;
  const frames = Math.floor(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
  const src = ac.createBufferSource();
  const amp = ac.createGain();
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1400;
  src.buffer = buffer;
  amp.gain.value = gain;
  src.connect(filter).connect(amp).connect(ac.destination);
  src.start(ac.currentTime + delay);
}

export const sounds = {
  move: () => blip({ freq: 330, type: 'triangle', duration: 0.06, gain: 0.1, sweep: -60 }),
  capture: () => { noise({ duration: 0.1, gain: 0.2 }); blip({ freq: 150, type: 'square', duration: 0.07, gain: 0.08, sweep: -50 }); },
  check: () => { blip({ freq: 660, type: 'sine', duration: 0.09, gain: 0.12 }); blip({ freq: 880, duration: 0.11, gain: 0.11, delay: 0.08 }); },
  castle: () => { blip({ freq: 300, type: 'triangle', duration: 0.05, gain: 0.09 }); blip({ freq: 380, type: 'triangle', duration: 0.06, gain: 0.09, delay: 0.06 }); },
  crown: () => [0, 0.07, 0.14].forEach((d, i) => blip({ freq: 520 + i * 170, duration: 0.11, gain: 0.1, delay: d })),
  win: () => [523, 659, 784, 1047].forEach((f, i) => blip({ freq: f, type: 'triangle', duration: 0.2, gain: 0.11, delay: i * 0.1 })),
  lose: () => [392, 349, 294].forEach((f, i) => blip({ freq: f, type: 'sine', duration: 0.24, gain: 0.1, delay: i * 0.13 })),
  illegal: () => blip({ freq: 150, type: 'sawtooth', duration: 0.1, gain: 0.06, sweep: -40 }),
  join: () => { blip({ freq: 620, duration: 0.08, gain: 0.09 }); blip({ freq: 830, duration: 0.1, gain: 0.09, delay: 0.07 }); },
};

/** Pick the right sound from a move record without the caller knowing the game. */
export function playForMove(record, { myTurnNext } = {}) {
  if (!record) return;
  if (record.mate) { sounds.win(); return; }
  if (record.crowned) { sounds.crown(); return; }
  if (record.check) { sounds.check(); return; }
  if (record.castle) { sounds.castle(); return; }
  if (record.captured !== null && record.captured !== undefined) { sounds.capture(); return; }
  sounds.move();
}
