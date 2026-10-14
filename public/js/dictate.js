// Voice input for customer screens. With Gemini live, the customer's speech is recorded,
// turned into a small 16 kHz WAV in the browser and transcribed by Gemini (any browser, Hindi
// in Devanagari, no translation). Without Gemini, the browser's own speech recognition is used.
// The transcript is only placed in the text box: the customer reads it and sends it themselves.
import { post } from './api.js';
import { app } from './main.js';

const MAX_MS = 45000;
let active = null; // one recording at a time
let geminiBusyUntil = 0; // after a quota error, use browser speech for a minute

export const dictating = () => !!active;

export async function dictate({ lang = 'en', button, onText, onError = () => {}, onState = () => {} }) {
  if (active) { active.stop(); return; } // second click stops and transcribes
  const live = app.config?.aiMode === 'gemini' && Date.now() > geminiBusyUntil && navigator.mediaDevices?.getUserMedia && window.MediaRecorder;
  if (!live) return browserSpeech({ lang, button, onText, onError, onState });
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }); }
  catch (e) { onError(e.name === 'NotAllowedError' ? 'Microphone permission was refused' : `Microphone: ${e.message}`); return; }
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const timer = setTimeout(() => rec.state === 'recording' && rec.stop(), MAX_MS);
  active = { stop: () => rec.state === 'recording' && rec.stop() };
  button?.classList.add('rec'); onState('recording');
  rec.onstop = async () => {
    clearTimeout(timer); stream.getTracks().forEach((t) => t.stop());
    active = null; button?.classList.remove('rec');
    if (!chunks.length) { onState('idle'); return; }
    onState('transcribing'); button?.classList.add('busy');
    try {
      const wav = await toWav16k(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
      const r = await post('/transcribe', { dataUrl: await dataUrl(wav), lang });
      if (r.text) onText(r.text, r.engine); else onError('No speech heard. Try again, a little closer to the mic.');
    } catch (e) {
      const busy = /quota|exhausted|rate|high demand|overloaded|unavailable|timeout/i.test(e.message || '');
      if (busy) geminiBusyUntil = Date.now() + 60000;
      onError(busy ? (lang === 'hi' ? 'Gemini अभी व्यस्त है। जवाब टाइप करें, या माइक फिर से दबाएँ (ब्राउज़र की आवाज़-पहचान चलेगी)।' : 'Gemini is busy right now. Type your answer, or tap the mic again to use the browser\'s speech recognition.') : (e.message || String(e)));
    }
    finally { button?.classList.remove('busy'); onState('idle'); }
  };
  rec.start();
}

function browserSpeech({ lang, button, onText, onError, onState }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { onError('Voice input needs Gemini live or Chrome'); return; }
  const r = new SR(); r.lang = lang === 'hi' ? 'hi-IN' : 'en-IN'; r.interimResults = false;
  active = { stop: () => r.stop() };
  button?.classList.add('rec'); onState('recording');
  r.onresult = (e) => onText([...e.results].map((x) => x[0].transcript).join(' '), 'browser speech');
  r.onend = () => { active = null; button?.classList.remove('rec'); onState('idle'); };
  r.onerror = (e) => { if (e.error !== 'no-speech' && e.error !== 'aborted') onError('Mic: ' + e.error); };
  r.start();
}

// Decode whatever the recorder produced and re-encode as 16 kHz mono 16-bit WAV, which every
// Gemini model accepts and keeps a 45 s clip under 1.5 MB.
async function toWav16k(blob) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const src = await ctx.decodeAudioData(await blob.arrayBuffer());
  ctx.close();
  const rate = 16000;
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(src.duration * rate)), rate);
  const node = off.createBufferSource(); node.buffer = src; node.connect(off.destination); node.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  const buf = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const w = (o, s) => [...s].forEach((c, i) => buf.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); buf.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); buf.setUint32(16, 16, true); buf.setUint16(20, 1, true); buf.setUint16(22, 1, true);
  buf.setUint32(24, rate, true); buf.setUint32(28, rate * 2, true); buf.setUint16(32, 2, true); buf.setUint16(34, 16, true); w(36, 'data'); buf.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) buf.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  return new Blob([buf.buffer], { type: 'audio/wav' });
}
const dataUrl = (b) => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(b); });
