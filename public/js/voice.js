import { postBlob } from './api.js';
// Sound for the demo: Gemini TTS voices (server, cached), browser speech as fallback,
// an Indian ringback tone, and one queue so voices never talk over each other.

const KEY = 'ruko_sound';
export const sound = {
  get on() { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } },
  set on(v) { try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch {} if (!v) stopAll(); listeners.forEach((f) => f(v)); },
};
const listeners = new Set();
export const onSoundChange = (f) => { listeners.add(f); return () => listeners.delete(f); };

let ctx;
const audioCtx = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());
// Browsers allow audio only after a user gesture; resume the context on the first one.
['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => { try { audioCtx().resume(); } catch {} }, { capture: true }));

let current = null;        // playing HTMLAudioElement
let chain = Promise.resolve();
let epoch = 0;             // bumps on stopAll so queued lines are dropped
const blobCache = new Map();

async function fetchVoice(speaker, text) {
  const k = `${speaker}|${text}`;
  if (blobCache.has(k)) return blobCache.get(k);
  const p = postBlob('/tts', { speaker, text }).catch(() => null);
  blobCache.set(k, p);
  const b = await p;
  if (!b) blobCache.delete(k);
  return b;
}
// Start generating early (e.g. while the previous line is still playing).
export const prefetch = (speaker, text) => { if (sound.on && text) fetchVoice(speaker, text); };

// Never let a voice line block the demo: if playback does not start (hidden tab, autoplay
// policy) or never fires 'ended', a safety timer moves things on.
function playBlob(blob, myEpoch, onStart) {
  return new Promise((resolve) => {
    if (myEpoch !== epoch || document.visibilityState === 'hidden') return resolve();
    const a = new Audio(URL.createObjectURL(blob));
    current = a;
    let safety = setTimeout(() => done(), 6000);
    const done = () => { clearTimeout(safety); try { a.pause(); } catch {} URL.revokeObjectURL(a.src); if (current === a) current = null; resolve(); };
    a.onplaying = () => { clearTimeout(safety); safety = setTimeout(done, ((a.duration || 20) * 1000) + 1500); };
    a.onended = done; a.onerror = done;
    onStart?.();
    a.play().catch(() => { blocked(); done(); });
  });
}

// Browser fallback voices, chosen per character. Never the novelty macOS voices
// (Albert, Bubbles, Zarvox…), and no pitch tricks: those made the call sound robotic.
const NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|junior|organ|superstar|trinoids|whisper|wobble|zarvox|ralph|fred|kathy|grandma|grandpa|rocko|eddy|flo|reed|sandy|shelley/i;
const PREFS = {
  en: {
    ruko: ['Google UK English Female', 'Samantha', 'Moira', 'Karen', 'Tessa'],
    sunita: ['Veena', 'Isha', 'Moira', 'Samantha', 'Tessa', 'Karen'],
    amit: ['Rishi', 'Google UK English Male', 'Daniel'],
    rakesh: ['Daniel', 'Google UK English Male', 'Rishi'],
    imran: ['Rishi', 'Google UK English Male', 'Daniel'],
    scammer: ['Daniel', 'Google UK English Male', 'Rishi'],
    meena: ['Veena', 'Isha', 'Samantha'],
    vikram: ['Rishi', 'Google UK English Male', 'Daniel'],
    ramesh: ['Google UK English Male', 'Daniel', 'Rishi'],
    kamala: ['Moira', 'Veena', 'Tessa'],
    pooja: ['Isha', 'Samantha', 'Veena'],
    son: ['Rishi', 'Google UK English Male', 'Daniel'],
    bank: ['Karen', 'Google UK English Female', 'Samantha'],
    teller: ['Tessa', 'Moira', 'Samantha'],
  },
  hi: {
    ruko: ['Google हिन्दी', 'Lekha'],
    sunita: ['Lekha', 'Google हिन्दी'],
    amit: ['Google हिन्दी', 'Lekha'],
    rakesh: ['Google हिन्दी', 'Lekha'],
    imran: ['Google हिन्दी', 'Lekha'],
    scammer: ['Google हिन्दी', 'Lekha'], meena: ['Lekha', 'Google हिन्दी'], vikram: ['Google हिन्दी', 'Lekha'], ramesh: ['Google हिन्दी', 'Lekha'], kamala: ['Lekha', 'Google हिन्दी'], pooja: ['Lekha', 'Google हिन्दी'], son: ['Google हिन्दी', 'Lekha'], bank: ['Lekha', 'Google हिन्दी'], teller: ['Lekha', 'Google हिन्दी'],
  },
};
export function pickVoice(lang, speaker) {
  const all = (window.speechSynthesis?.getVoices() || []).filter((v) => !NOVELTY.test(v.name));
  const want = PREFS[lang]?.[speaker] || PREFS[lang]?.ruko || [];
  for (const name of want) { const v = all.find((x) => x.name === name || x.name.startsWith(name + ' ')); if (v) return v; }
  const code = lang === 'hi' ? 'hi' : 'en';
  return all.find((v) => v.lang?.toLowerCase().startsWith(code + '-in')) || all.find((v) => v.lang?.toLowerCase().startsWith(code)) || null;
}
// Voices load asynchronously in Chrome; touch the list early so the first line has them.
try { speechSynthesis.getVoices(); speechSynthesis.addEventListener?.('voiceschanged', () => speechSynthesis.getVoices()); } catch {}

function speakBrowser(text, lang, speaker, myEpoch, onStart) {
  return new Promise((resolve) => {
    if (myEpoch !== epoch || !window.speechSynthesis || document.visibilityState === 'hidden') return resolve();
    // Speak in the language of the text itself (a Hindi line in English mode, or vice versa).
    const l = /[\u0900-\u097F]/.test(text) ? 'hi' : lang === 'hi' && !/[\u0900-\u097F]/.test(text) ? 'en' : lang;
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(l, speaker);
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = l === 'hi' ? 'hi-IN' : 'en-IN';
    u.rate = { sunita: 0.95, kamala: 0.9, meena: 0.95, scammer: 1.08, bank: 0.98 }[speaker] || 1;
    u.pitch = 1;
    const safety = setTimeout(resolve, 2500 + text.length * 110); // speechSynthesis sometimes never fires onend
    u.onend = () => { clearTimeout(safety); resolve(); };
    u.onerror = u.onend;
    onStart?.();
    speechSynthesis.speak(u);
  });
}

let warned = false;
function blocked() {
  if (warned) return; warned = true;
  import('./ui.js').then(({ toast }) => toast('Click anywhere once to allow sound'));
}

// Queue a line. Resolves when it has finished playing (or was skipped).
export function say(text, { speaker = 'ruko', lang = 'hi', onStart } = {}) {
  if (!sound.on || !text) return Promise.resolve();
  const myEpoch = epoch;
  const blobP = fetchVoice(speaker, text); // start fetching now, play in order
  chain = chain.then(async () => {
    if (myEpoch !== epoch || !sound.on) return;
    const blob = await blobP;
    if (myEpoch !== epoch || !sound.on) return;
    if (blob) await playBlob(blob, myEpoch, onStart);
    else await speakBrowser(text, lang, speaker, myEpoch, onStart);
  }).catch(() => {});
  return chain;
}
export const idle = () => chain;

export function stopAll() {
  epoch++;
  chain = Promise.resolve();
  try { current?.pause(); } catch {}
  current = null;
  try { speechSynthesis.cancel(); } catch {}
  stopRing();
}

// Indian ringback: 400 + 450 Hz, 0.4 s on, 0.2 s off, 0.4 s on, 2 s off.
let ringNodes = [];
export function ring(cycles = 2) {
  if (!sound.on) return Promise.resolve();
  const ac = audioCtx();
  const t0 = ac.currentTime + 0.05;
  const gain = ac.createGain(); gain.gain.value = 0; gain.connect(ac.destination);
  const oscs = [400, 450].map((f) => { const o = ac.createOscillator(); o.frequency.value = f; o.connect(gain); o.start(t0); return o; });
  const cycle = 3;
  for (let i = 0; i < cycles; i++) {
    const s = t0 + i * cycle;
    for (const [on, off] of [[0, 0.4], [0.6, 1.0]]) {
      gain.gain.setValueAtTime(0, s + on); gain.gain.linearRampToValueAtTime(0.12, s + on + 0.02);
      gain.gain.setValueAtTime(0.12, s + off - 0.02); gain.gain.linearRampToValueAtTime(0, s + off);
    }
  }
  const end = t0 + cycles * cycle - 1.6;
  oscs.forEach((o) => o.stop(end));
  ringNodes = [...oscs, gain];
  return new Promise((r) => setTimeout(r, (end - ac.currentTime) * 1000 + 100));
}
function stopRing() { ringNodes.forEach((n) => { try { n.stop?.(); n.disconnect?.(); } catch {} }); ringNodes = []; }

// Short UI cue (notification ping).
export function ping() {
  if (!sound.on) return;
  try {
    const ac = audioCtx(), o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(880, ac.currentTime); o.frequency.exponentialRampToValueAtTime(1320, ac.currentTime + 0.12);
    g.gain.setValueAtTime(0.0001, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.15, ac.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.35);
    o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.4);
  } catch {}
}
