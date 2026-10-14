// Renders synthetic evidence specs to PNG in the browser (the same specs give the server its ground truth).
import { renderSVG } from './shared/evidence.js';
import { get } from './api.js';

let specsP;
export const specs = () => (specsP ||= get('/specs'));
export async function specById(id) { const s = await specs(); return [...s.scenario, ...s.extraction].find((x) => x.id === id); }

const cache = new Map();
export function svgUrl(spec) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(renderSVG(spec)); }
export async function pngOf(spec) {
  if (cache.has(spec.id)) return cache.get(spec.id);
  const p = new Promise((ok, bad) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = 600; cv.height = 1000;
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 600, 1000); ctx.drawImage(img, 0, 0);
      ok(cv.toDataURL('image/png'));
    };
    img.onerror = bad;
    img.src = svgUrl(spec);
  });
  cache.set(spec.id, p);
  return p;
}
export async function evidencePayload(id) {
  const spec = await specById(id);
  return { specId: id, dataUrl: await pngOf(spec), fileName: `${id}.png`, title: spec.title, kind: spec.kind };
}
