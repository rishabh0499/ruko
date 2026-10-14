import { esc } from '../ui.js';
import { specs, pngOf } from '../evidence-render.js';
import { groundTruth } from '../shared/evidence.js';

export async function render(el) {
  const all = await specs();
  const list = [...all.scenario, ...all.extraction];
  let showBoxes = true;
  const draw = async () => {
    el.innerHTML = `<div class="row between" style="margin-bottom:12px"><div><h2 style="margin:0">Evidence Studio</h2><div class="small muted">No public dataset of Indian UPI screenshots or scam WhatsApp threads exists, so the demo and the extraction test set are generated here. Each image carries its ground truth (value + source box). All synthetic.</div></div>
      <label class="switch"><input type="checkbox" id="bx" ${showBoxes ? 'checked' : ''}> Show ground-truth boxes</label></div>
      <div class="group-h">Scenario evidence</div><div class="ev-grid" id="g1"></div>
      <div class="group-h">Extraction test set (30 · en / hi / ta · 5 hard cases)</div><div class="ev-grid" id="g2"></div>`;
    el.querySelector('#bx').addEventListener('change', (e) => { showBoxes = e.target.checked; draw(); });
    for (const s of list) {
      const tile = document.createElement('div');
      tile.className = 'ev-tile';
      const gt = groundTruth(s);
      tile.innerHTML = `<div style="position:relative"><img alt="${esc(s.title)}">${showBoxes ? gt.map((f) => { const [y1, x1, y2, x2] = f.box2d; return `<div class="box" title="${esc(f.type)}: ${esc(f.value)}" style="top:${y1 / 10}%;left:${x1 / 10}%;width:${(x2 - x1) / 10}%;height:${(y2 - y1) / 10}%"></div>`; }).join('') : ''}</div>
        <div class="cap">${esc(s.id)} · ${esc(s.title)}<div class="tiny muted">${gt.length} facts${s.hard ? ` · <b style="color:var(--warn)">${esc(s.hard)}</b>` : ''}</div></div>`;
      el.querySelector(s.scenario === 'eval' ? '#g2' : '#g1').appendChild(tile);
      pngOf(s).then((u) => { tile.querySelector('img').src = u; });
    }
  };
  draw();
}
