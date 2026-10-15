import { get } from '../api.js';
import { $, esc, pageHead, mocked } from '../ui.js';
import { state } from '../i18n.js';
import { icon } from '../icons.js';
import { renderSimulator } from './sim.js';

// Risk Engine: each scam plays out live on the customer's phone and the other side's device, and the
// real engine scores every payment. Nothing is typed in by hand: device state comes from the Ruko SDK,
// payee and history from the bank's own systems (simulated here).
const TONE = ['ok', 'info', 'warn', 'warn', 'bad', 'bad'];

export async function render(el) {
  const tiers = await get('/switch/tiers');
  const hi = state.lang === 'hi';
  el.innerHTML = `
    ${pageHead({ eyebrow: hi ? 'हर रास्ता' : 'Every rail', title: hi ? 'रिस्क इंजन' : 'Risk Engine', desc: hi ? 'एक कहानी चुनें और ऑटो-प्ले दबाएँ। फ़ोन पर कॉल, वीडियो कॉल, AnyDesk और SIM स्वैप लाइव चलते हैं; Ruko सब अपने-आप पकड़ता है और हर पेमेंट को ग्राहक की पूरी यात्रा से जाँचता है।' : "Pick a story and press Auto-play. Calls, video calls, AnyDesk and SIM swaps run live on the phone; Ruko picks them up by itself and judges every payment on the customer's whole journey." })}
    <div id="mode"></div>
    <div class="card" style="margin-top:var(--s5)"><div class="card-head"><h3>${icon('shield')}${hi ? 'रुकावट की सीढ़ी' : 'The friction ladder'}</h3><span class="tiny muted">${hi ? 'जितना ज़रूरी, उतना ही' : 'Only as much as the risk needs'}</span></div>
      <ol class="ladder">${tiers.map((t) => `<li class="t${t.tier}"><span class="pill ${TONE[t.tier]}">T${t.tier} · ${esc(t.name)}</span><span class="small">${esc(t.action)}</span></li>`).join('')}</ol>
      <p class="tiny muted" style="margin:10px 0 0">${hi ? 'कोड फ़ैसला करता है। Gemini सिर्फ़ यात्रा पढ़कर पैटर्न और सबूत बताता है; हर सबूत और हर डिवाइस वाला दावा कोड जाँचता है।' : 'Code decides. Gemini reads the journey and names the pattern with evidence; code checks every cited transaction and every device claim.'} ${mocked('Device, telecom and registry signals simulated')}</p></div>`;
  return renderSimulator($('#mode', el), hi);
}
