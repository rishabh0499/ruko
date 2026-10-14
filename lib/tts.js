// Gemini text-to-speech with a disk cache. Returns WAV bytes, or null so the
// browser can fall back to its own speech synthesis.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { settings, aiMode, usage } from './gemini.js';

const DIR = new URL('../store/tts/', import.meta.url);
mkdirSync(DIR, { recursive: true });

export const TTS_CHAIN = (process.env.GEMINI_MODEL_TTS || 'gemini-3.8-flash-tts,gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts,gemini-3.8-flash-lite-tts').split(',').map((s) => s.trim()).filter(Boolean);

// Prebuilt Gemini voices per speaker. The style note is documentation only; it is not sent.
export const VOICES = {
  ruko: { voice: 'Kore', style: 'Speak as a calm, warm, respectful bank safety assistant. Unhurried, reassuring.' },
  sunita: { voice: 'Gacrux', style: 'Speak as a frightened 66-year-old Indian woman, hesitant, slightly breathless.' },
  amit: { voice: 'Orus', style: 'Speak as a worried but firm Indian son in his thirties, urgent and caring.' },
  rakesh: { voice: 'Charon', style: 'Speak as a relaxed, confident 41-year-old Indian man.' },
  imran: { voice: 'Iapetus', style: 'Speak as a stressed young Indian shopkeeper.' },
};

const cooldown = new Map();
const inflight = new Map();

function wavFromPcm(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export const ttsKey = (speaker, text) => createHash('sha1').update(`${speaker}|${text}`).digest('hex').slice(0, 20);
export const cached = (speaker, text) => existsSync(new URL(`${ttsKey(speaker, text)}.wav`, DIR));

export async function synth(speaker, text) {
  text = String(text || '').trim().slice(0, 600);
  if (!text) return null;
  const key = ttsKey(speaker, text);
  const file = new URL(`${key}.wav`, DIR);
  if (existsSync(file)) return readFileSync(file);
  if (aiMode() !== 'gemini' || settings.simulateFailure) return null;
  if (inflight.has(key)) return inflight.get(key);
  const v = VOICES[speaker] || VOICES.ruko;
  const job = (async () => {
    for (const model of TTS_CHAIN) {
      if (cooldown.get(model) > Date.now()) continue;
      const t0 = Date.now();
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 25000);
      try {
        usage.calls++;
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST', signal: ctl.signal,
          headers: { 'content-type': 'application/json', 'x-goog-api-key': settings.key },
          body: JSON.stringify({
            // Only the line itself: some TTS models read any instruction text aloud.
            contents: [{ parts: [{ text }] }],
            generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: v.voice } } } },
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
        const part = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
        if (!part) throw new Error('no audio in response');
        const raw = Buffer.from(part.inlineData.data, 'base64');
        const mime = part.inlineData.mimeType || '';
        const rate = Number((/rate=(\d+)/.exec(mime) || [])[1] || 24000);
        const wav = /wav/i.test(mime) || raw.subarray(0, 4).toString() === 'RIFF' ? raw : wavFromPcm(raw, rate);
        writeFileSync(file, wav);
        usage.log.unshift({ name: `tts:${speaker}`, model, ok: true, ms: Date.now() - t0, at: new Date().toISOString() });
        return wav;
      } catch (e) {
        usage.failures++;
        const reason = e.name === 'AbortError' ? 'timeout' : String(e.message).split('\n')[0].slice(0, 140);
        usage.log.unshift({ name: `tts:${speaker}`, model, ok: false, ms: Date.now() - t0, reason, at: new Date().toISOString() });
        if (/quota|exhausted|high demand|overloaded|rate/i.test(reason)) cooldown.set(model, Date.now() + 60000);
      } finally { clearTimeout(timer); }
    }
    return null;
  })();
  inflight.set(key, job);
  try { return await job; } finally { inflight.delete(key); }
}

// Background warm-up with low concurrency so live calls still get through.
const queue = [];
let running = 0;
export function prewarm(lines) {
  for (const l of lines) if (l?.text && !cached(l.speaker, l.text)) queue.push(l);
  pump();
  return queue.length;
}
function pump() {
  while (running < 2 && queue.length) {
    const l = queue.shift();
    running++;
    synth(l.speaker, l.text).catch(() => null).then((wav) => {
      // Free-tier TTS quotas are per minute: retry later instead of giving up.
      if (!wav && (l.tries || 0) < 3) setTimeout(() => { queue.push({ ...l, tries: (l.tries || 0) + 1 }); pump(); }, 20000);
    }).finally(() => { running--; pump(); });
  }
}
