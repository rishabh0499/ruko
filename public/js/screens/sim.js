import { get, post } from '../api.js';
import { $, esc, inr } from '../ui.js';
import { state, t as tr } from '../i18n.js';
import { icon } from '../icons.js';
import { say, stopAll, ring, sound, prefetch } from '../voice.js';

// Live simulator: each scam told end to end, as it happens, on the customer's phone and on the other
// side's device: the approach, the payments, Ruko stepping in, the family or the bank calling, the
// case opening, the 1930 report and the outcome. Calls have a ringtone and real voices (Gemini TTS,
// browser speech as fallback). Every payment is scored by the real risk engine.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAMES = { scammer: 'Caller', meena: 'Meena', vikram: 'Vikram', ramesh: 'Ramesh', kamala: 'Kamala', pooja: 'Pooja', son: 'Karthik (son)', bank: 'Bharat Bank', teller: 'Teller', ruko: 'Ruko' };
const ACK = (n) => `3101${String(26100000000 + n).slice(-9)}`; // mock NCRP acknowledgement format

// ---------- the stories ----------
// Beat fields: t (timeline label) · phone (screen) · device (switch the other device) · group (lines
// on the group device) · call {type, who} | 'end' | 'switch' · anydesk / sim / apk · ring · say
// [[speaker, text]] · pay (stream step) · resolve 'continue' | 'cancel' · end (summary).
const SCRIPTS = {
  D: {
    device: { kind: 'caller', label: 'The caller', who: 'TRAI "officer"', ic: 'badge' },
    beats: [
      { t: 'An unknown number calls', ring: true, phone: { app: 'ringing', who: '+91 98110 41230', sub: 'TRAI Helpdesk' } },
      { t: 'The "TRAI officer" threatens her', call: { type: 'phone', who: 'TRAI Helpdesk' }, phone: { app: 'oncall', who: 'TRAI Helpdesk' }, say: [['scammer', 'Madam, this is TRAI. Your SIM is linked to illegal activity and will be blocked in two hours.'], ['meena', 'Blocked? But I have done nothing wrong!']] },
      { t: 'Told to pay in small parts', phone: { app: 'whatsapp', who: 'TRAI Verification', msgs: [['in', 'To stop the block, pay the verification fee in 5 parts of ₹9,999 to UPI ravi.k22@ybl.'], ['in', 'Do not tell family. Confidential case.']] }, say: [['scammer', 'Pay in five small parts of nine thousand nine hundred ninety nine. Then the bank will not stop it. Stay on the line.']] },
      { t: 'Part 1 on a UPI app', pay: 0 },
      { t: '"Ignore the warning"', say: [['scammer', 'That warning is automatic, madam. Press continue.']], resolve: 'continue' },
      { t: 'Part 2', pay: 1 },
      { t: 'She sends it anyway', say: [['scammer', 'Good. Do not wait. Three more parts, quickly.']], resolve: 'continue' },
      { t: 'Part 3, to a new account: held', pay: 2, say: [['scammer', 'Why has it stopped? Try again now!']] },
      { t: 'Ruko tells her son', device: { kind: 'family', label: "Karthik's phone (her son)", who: 'Karthik' }, sms: 'Bharat Bank: A payment of ₹9,999 from your mother Meena to a new account is on hold. She may be on a call with a scammer. Please call her.' },
      { t: 'Her son calls', ring: true, call: 'switch', phone: { app: 'ringing', who: 'Karthik (son)', sub: 'mobile' } },
      { t: 'He breaks the spell', phone: { app: 'oncall', who: 'Karthik (son)' }, familyCall: true, say: [['son', 'Amma, the bank says you are sending money to someone. Who is on the phone?'], ['meena', 'TRAI people. They said my SIM will be blocked and not to tell anyone.'], ['son', 'Amma, TRAI never asks for money. This is a scam. Cut that call and send nothing more.'], ['meena', 'Okay Karthik. I am cutting it.']] },
      { t: 'She cancels the held payment', call: 'end', resolve: 'cancel', phone: { app: 'cancelled', amount: 9999 } },
      { t: 'Ruko opens her case', phone: { app: 'case', title: 'Case opened: SIM-block scam', rows: [['Lost', '₹19,998 in 2 payments to Ravi Kumar (ravi.k22@ybl)'], ['Stopped', '₹9,999 held and cancelled'], ['Golden hour', '18 minutes since the first payment'], ['Next', 'Fill in ReturnPath to file the complaint']] }, say: [['ruko', 'Two payments already left. Let us get them back. I will help you file the complaint from this phone, it takes a few minutes.']] },
      { t: 'ReturnPath 1 · What happened', phone: { app: 'rp', step: 1, story: 'A man from "TRAI" called and said my SIM will be blocked. He made me pay ₹9,999 two times to ravi.k22@ybl and told me not to tell my family.', added: 'He also sent the UPI ID on WhatsApp.' }, say: [['ruko', 'You do not need to retell anything. I kept what happened from the call. Add anything you remember.'], ['meena', 'He also sent the UPI ID on WhatsApp.']] },
      { t: 'ReturnPath 2 · Her evidence', phone: { app: 'rp', step: 2, files: [['message', 'WhatsApp chat · TRAI Verification'], ['file', 'Bank SMS · ₹9,999 debited (1)'], ['file', 'Bank SMS · ₹9,999 debited (2)'], ['phone', 'Call log · +91 98110 41230']] }, say: [['ruko', 'I have added your WhatsApp chat, the two bank SMS and the call log. You can remove anything you do not want to share.']] },
      { t: 'ReturnPath 3 · Gemini reads each file', phone: { app: 'rp', step: 3, facts: [['₹9,999', 'Bank SMS (1)'], ['UTR 4521 8873 0019', 'Bank SMS (1)'], ['₹9,999', 'Bank SMS (2)'], ['UTR 4521 8873 0647', 'Bank SMS (2)'], ['ravi.k22@ybl', 'WhatsApp chat'], ['+91 98110 41230', 'Call log']] } },
      { t: 'ReturnPath 4 · She confirms the facts', phone: { app: 'rp', step: 4, facts: [['Amount 1', '₹9,999', 'ok'], ['UTR 1', '4521 8873 0019', 'ok'], ['Amount 2', '₹9,999', 'ok'], ['UTR 2', '4521 8873 0647', 'fixed'], ['Receiver', 'ravi.k22@ybl', 'ok'], ['Caller', '+91 98110 41230', 'ok']] }, say: [['ruko', 'Please check each fact. One UTR was blurry, so I marked it for you to check.'], ['meena', 'The last digits are zero six four seven. Yes, now it is right.']] },
      { t: 'ReturnPath 5 · Where her money went', phone: { app: 'rp', step: 5, legs: [['₹9,999', 'ravi.k22@ybl · Ravi Kumar', 'UTR …0019 · 2:02 pm'], ['₹9,999', 'ravi.k22@ybl · Ravi Kumar', 'UTR …0647 · 2:09 pm']], total: '₹19,998', note: 'Same receiving account twice: one lien request covers both' } },
      { t: 'ReturnPath 6 · Her case file', phone: { app: 'rp', step: 6, docs: ['1930 / NCRP complaint', 'Bank dispute letter (RBI 2017 circular)', 'Cyber-cell evidence annexure', 'Plain-language summary'] }, say: [['ruko', 'Your documents are ready. Every amount and number comes from a fact you confirmed. Nothing is made up. Shall I file the complaint?'], ['meena', 'Yes, please file it.']] },
      { t: 'Complaint filed; freeze requested', phone: { app: 'ack', no: ACK(1), next: ['Lien requested on ravi.k22@ybl through 1930 / CFCFRMS', 'Money still in that account can come back via the Money Restoration Module', 'Bank dispute sent; track everything in ReturnPath'] }, end: 'Ruko held the 3rd part from the running total, her son broke the call, and Meena filed the complaint herself on ReturnPath: story kept, evidence read, facts confirmed, documents built only from them, inside the golden hour.' },
    ],
  },
  E: {
    device: { kind: 'group', label: 'Telegram "VIP trading" group', who: 'Stock Gurus VIP 💹', ic: 'users' },
    beats: [
      { t: 'A "stock tips" group with fake profits', group: ['Today\'s call: +38% in 2 days 🚀', 'Members are withdrawing lakhs. Start with ₹10,000 on our Alpha Trade app.'], phone: { app: 'home' } },
      { t: 'First deposit in the bank app', pay: 0 },
      { t: 'He waits out the pause and sends', resolve: 'continue', say: [['vikram', 'Thirty minutes is fine. It is just ten thousand.']] },
      { t: '4 days later: a small "return"', skip: '4 days later', phone: { app: 'notif', title: 'Money received', body: '₹1,500 from Alpha Trade Desk ("profit withdrawal")' }, group: ['Withdrawal successful for @vikram ✅ Upgrade for bigger returns.'] },
      { t: 'Second deposit: looks ordinary', skip: '4 days later', pay: 1 },
      { t: '1 week later: "move to Zenith, 2×"', skip: '1 week later', group: ['VIP members are moving to Zenith Capital: guaranteed 2× in 30 days. Last 20 seats.'] },
      { t: 'Third deposit, to a new account: held', pay: 2 },
      { t: 'Ruko asks one question', phone: { app: 'chat', msgs: [['ruko', 'Before this goes: is anyone promising you guaranteed returns, and have you been able to withdraw more than they paid you?'], ['me', 'They pay small profits. Zenith promised 2× in 30 days.']] }, say: [['ruko', 'Is anyone promising you guaranteed returns, and have you been able to withdraw more than they paid you?'], ['vikram', 'They paid small profits. Zenith promised double in thirty days.']] },
      { t: 'He checks SEBI: not registered', phone: { app: 'sebi' }, say: [['ruko', 'Guaranteed returns are illegal. Zenith Capital is not registered with SEBI. Real brokers never take money into personal accounts.']] },
      { t: 'He cancels the ₹60,000', resolve: 'cancel', phone: { app: 'cancelled', amount: 60000 } },
      { t: 'Ruko opens his case', phone: { app: 'case', title: 'Case opened: investment scam', rows: [['Lost', '₹35,000 in 2 deposits to Alpha Trade Desk'], ['Stopped', '₹60,000 to Zenith, and the ₹4.5 lakh planned next'], ['Next', 'Fill in ReturnPath to file the complaint']] }, say: [['ruko', 'Thirty five thousand already went to Alpha Trade Desk. Let us report it with your evidence.']] },
      { t: 'ReturnPath 1 · What happened', phone: { app: 'rp', step: 1, story: 'I joined a Telegram stock-tips group. Their Alpha Trade app showed profits. I deposited ₹10,000 and ₹25,000 and got ₹1,500 back once.', added: 'They then asked me to move to Zenith Capital for double returns.' }, say: [['vikram', 'They then asked me to move to Zenith Capital for double returns.']] },
      { t: 'ReturnPath 2 · His evidence', phone: { app: 'rp', step: 2, files: [['users', 'Telegram group · Stock Gurus VIP'], ['file', 'Alpha Trade app · fake profit screen'], ['file', 'Bank statement · 2 deposits'], ['file', 'Credit SMS · ₹1,500']] } },
      { t: 'ReturnPath 3 · Gemini reads each file', phone: { app: 'rp', step: 3, facts: [['₹10,000', 'Bank statement'], ['₹25,000', 'Bank statement'], ['Alpha Trade Desk · ALPHA-01', 'Bank statement'], ['₹1,500 credit', 'Credit SMS'], ['"Guaranteed 2×"', 'Telegram group']] } },
      { t: 'ReturnPath 4 · He confirms the facts', phone: { app: 'rp', step: 4, facts: [['Deposit 1', '₹10,000', 'ok'], ['Deposit 2', '₹25,000', 'ok'], ['Receiver', 'Alpha Trade Desk', 'ok'], ['Money back', '₹1,500', 'ok']] } },
      { t: 'ReturnPath 5 · Where his money went', phone: { app: 'rp', step: 5, legs: [['₹10,000', 'Alpha Trade Desk', '2 Sep · NEFT'], ['₹25,000', 'Alpha Trade Desk', '10 Sep · NEFT']], total: '₹35,000 (₹33,500 net of the ₹1,500 "return")', note: 'Receiving account flagged to the Suspect Registry' } },
      { t: 'ReturnPath 6 · His case file', phone: { app: 'rp', step: 6, docs: ['1930 / NCRP complaint', 'Bank dispute letter', 'Cyber-cell evidence annexure (Telegram, app screenshots)', 'Plain-language summary'] }, say: [['ruko', 'Your documents are ready, built only from facts you confirmed. Filing the complaint now.']] },
      { t: 'Complaint filed', phone: { app: 'ack', no: ACK(2), next: ['Lien requested on Alpha Trade Desk\'s account', 'Telegram group reported through Sahyog for takedown', 'Track the case in ReturnPath'] }, end: 'No single deposit proved anything; the journey did. Ruko held the 3rd, a SEBI check ended it, and Vikram filed the complaint for the ₹35,000 on ReturnPath with every fact tied to his evidence.' },
    ],
  },
  F: {
    device: { kind: 'laptop', label: "Fraudster's device (another city)", who: 'Net banking · new device', ic: 'monitor' },
    beats: [
      { t: 'A "traffic challan" with an app', phone: { app: 'whatsapp', who: 'RTO Traffic Police', msgs: [['in', 'Your vehicle MH31 has a pending challan of ₹500. Pay using the RTO app below.'], ['file', 'RTO_Challan.apk · 2.1 MB']] } },
      { t: 'He installs it from outside the Play Store', phone: { app: 'apk' }, apk: true },
      { t: 'The app takes control of the phone', phone: { app: 'access' } },
      { t: '2 am: his SIM moves to another phone', sim: 'none', phone: { app: 'lock', notes: [['SIM', 'No service · SIM activated on another device']] } },
      { t: 'Someone logs in to his net banking', screen: 'nb' },
      { t: '₹1,90,000 to a 4-day-old account: stopped', pay: 0 },
      { t: 'The bank calls him (no questions to the fraudster)', device: { kind: 'desk', label: 'Bharat Bank fraud desk', who: 'Fraud desk · Pune' }, ring: true, phone: { app: 'ringing', who: 'Bharat Bank Fraud Desk', sub: '✓ verified bank number', bank: true } },
      { t: '"Did you send ₹1,90,000?" "No!"', phone: { app: 'oncall', who: 'Bharat Bank Fraud Desk', bank: true }, say: [['bank', 'Mister Patil, this is Bharat Bank. Did you just try to send one lakh ninety thousand rupees to Kiran Enterprises?'], ['ramesh', 'No! I was asleep. My phone has had no signal since two o clock.'], ['bank', 'Then someone else has your account. We stopped the payment and blocked the new device. Please uninstall the RTO app. Do not share any OTP.']] },
      { t: 'Case: takeover, SIM swap reported', call: 'end', phone: { app: 'case', title: 'Case opened: account takeover', rows: [['Stopped', '₹1,90,000 never left'], ['Secured', 'Net banking reset, new device blocked'], ['SIM', 'SIM-swap reported to the operator and Sanchar Saathi (Chakshu)'], ['Malware', 'RTO_Challan.apk flagged; uninstall guided']] } },
      { t: '1930 complaint for the attempt', phone: { app: 'ack', no: ACK(3), next: ['Kiran Enterprises account flagged to the Suspect Registry', 'SIM restored at the operator store with ID', 'Track the case in ReturnPath'] }, end: 'The person paying was not Ramesh. Ruko held it without asking the fraudster anything, the bank called Ramesh on his number, and the takeover was reported.' },
    ],
  },
  G: {
    device: { kind: 'teller', label: 'Branch teller terminal', who: 'Bharat Bank · Kochi branch', ic: 'users' },
    beats: [
      { t: 'Two days on a "digital arrest" video call', call: { type: 'video', who: 'CBI Officer Mishra' }, phone: { app: 'lock', notes: [] }, say: [['scammer', 'Mrs Menon, your Aadhaar is linked to money laundering. You are under digital arrest. Do not disconnect this call.']] },
      { t: 'Told to break her FD', say: [['scammer', 'Close your fixed deposit and transfer it to the National Supervision Account. It will be returned after verification.'], ['kamala', 'Yes sir. I will go to the bank in the morning.']] },
      { t: 'FD closed', skip: 'Next morning', phone: { app: 'notif', title: 'Bharat Bank', body: 'FD of ₹30,00,000 closed before maturity.' } },
      { t: 'At the counter: RTGS ₹28 lakh', screen: 'rtgs' },
      { t: 'Teller submits: Ruko holds it', pay: 0 },
      { t: 'The teller asks the three questions', say: [['teller', 'Ma\'am, before this goes, is anyone on a call with you right now, telling you what to do?'], ['kamala', 'Yes, a CBI officer. He said not to tell anyone or I will be arrested.'], ['teller', 'Ma\'am, no police officer ever does this. This is a scam. Let us call your son and 1930 together.']] },
      { t: 'The "officer" hangs up', call: 'end', phone: { app: 'notif', title: 'Call ended', body: 'CBI Officer Mishra · video call · 48 h 12 m' } },
      { t: 'Case: attempted digital arrest', phone: { app: 'case', title: 'Case opened: digital arrest attempt', rows: [['Stopped', '₹28,00,000 stayed in her account'], ['Caller', 'Video-call number and WhatsApp ID recorded'], ['Payee', 'National Supervision Account: already a reported mule'], ['Family', 'Son informed by the branch']] } },
      { t: '1930 complaint filed from the branch', phone: { app: 'ack', no: ACK(4), next: ['Caller number reported to Chakshu and the Suspect Registry', 'Branch staff note added to her profile', 'Track the case in ReturnPath'] }, end: 'Branch payments never touch an app. Ruko alerted the teller with reasons and three questions; Kamala told the truth, and ₹28 lakh stayed.' },
    ],
  },
  H: {
    device: { kind: 'caller', label: 'The "customer care" caller', who: 'Food app customer care', ic: 'phone' },
    beats: [
      { t: 'She searches for a refund helpline', phone: { app: 'search' } },
      { t: 'Calls the first number', call: { type: 'phone', who: '1800-xxx (customer care)' }, phone: { app: 'oncall', who: 'Customer care' }, say: [['scammer', 'Ma\'am, your refund needs verification. Please install AnyDesk, I will guide you.'], ['pooja', 'Okay, installing it now.']] },
      { t: 'AnyDesk: someone else controls her screen', anydesk: true, phone: { app: 'anydesk' }, say: [['scammer', 'Give me the nine digit code. Good, I can see your screen now.']] },
      { t: 'A card payment opens on her phone', phone: { app: 'checkout' }, say: [['scammer', 'Enter the OTP that comes now. That is your refund code.']] },
      { t: '₹45,000 to a crypto wallet: held', pay: 0, say: [['scammer', 'Approve it quickly ma\'am!']] },
      { t: 'Ruko: someone can see your screen', phone: { app: 'push' }, say: [['ruko', 'Someone else can see and control your screen. Real customer care never asks you to install apps. End the AnyDesk session.']] },
      { t: 'She ends the session; the caller hangs up', anydesk: false, call: 'end', phone: { app: 'cancelled', amount: 45000, card: true } },
      { t: 'Case: fake helpline reported', phone: { app: 'case', title: 'Case opened: fake customer care', rows: [['Stopped', '₹45,000 card payment never captured'], ['Card', 'Blocked and reissued; OTP never used'], ['Device', 'AnyDesk removed; remote session logged'], ['Caller', 'Fake helpline number reported to Chakshu']] } },
      { t: '1930 complaint filed', phone: { app: 'ack', no: ACK(5), next: ['Search ad reported to the platform through Sahyog', 'CryptoX merchant flagged to the card network', 'Track the case in ReturnPath'] }, end: 'Someone could see and control her screen: Ruko held the card payment and asked her through her bank app; she ended the session and the fake number was reported.' },
    ],
  },
  N: {
    device: null,
    beats: [
      { t: 'Rent to his landlord', pay: 0 }, { t: 'Groceries on UPI', pay: 1 }, { t: 'Electricity bill', pay: 2 },
      { t: 'A friend, first time, ₹3,000', pay: 3 }, { t: 'A new plumber, ₹18,500', pay: 4 }, { t: 'Online groceries by card', pay: 5 },
      { t: 'Second instalment to his builder, ₹5 lakh', pay: 6 },
      { t: 'A whole month: nothing asked', phone: { app: 'outcome', big: '7 payments · 0 questions', lines: ['Trusted payees and a purpose already checked keep honest customers at zero friction.'] }, end: 'Trusted payees and a purpose already checked keep honest customers at zero friction.' },
    ],
  },
};

export async function renderSimulator(box, hi) {
  const streams = await get('/switch/streams');
  let sid = 'D', S, script, i = -1, playing = false, results = {}, gen = 0;
  let caseId = null, ack = null;
  let ov = {}, phone = {}, dev = null, devScreen = null, lines = [], sms = [], clock = null, decision = null, lastPayStep = null, speaking = null;

  box.innerHTML = `
    <div class="sim-bar">
      <div class="sim-chips" role="tablist" aria-label="Scenario">${streams.map((s) => `<button type="button" role="tab" class="sim-chip" data-s="${s.id}"><span class="dot ${s.id === 'N' ? 'ok' : 'bad'}"></span>${esc(hi ? s.tagHi : s.tag)}</button>`).join('')}</div>
      <div class="row" style="gap:6px"><button class="btn primary" id="sPlay" type="button"></button><button class="btn" id="sNext" type="button">${hi ? 'अगला कदम' : 'Next step'}${icon('chevronRight', { size: 15 })}</button><button class="btn ghost" id="sRestart" type="button" aria-label="Restart">${icon('refresh', { size: 14 })}</button><button class="btn ghost" id="sSound" type="button"></button></div>
    </div>
    <div class="sim-story card" id="sStory"></div>
    <div class="sim-stage">
      <div class="phone-wrap"><div class="phone-label" id="pLabel"></div><div class="phone"><div class="phone-notch"></div><div class="phone-screen sim-screen" id="pScreen"></div></div></div>
      <div class="phone-wrap" id="oWrap"><div class="phone-label" id="oLabel"></div><div class="phone dark"><div class="phone-notch"></div><div class="phone-screen sim-screen" id="oScreen"></div></div></div>
      <div class="card sim-reason" id="sReason"></div>
    </div>`;

  const nowLabel = () => (clock ? new Date(clock).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '10:00');
  const showsCall = (other) => ov.call && (!other || dev?.kind === 'caller' || dev?.kind === 'desk' || (dev?.kind === 'family' && ov.call.family));
  const statusbar = (other) => `<div class="sim-sb ${other ? 'dark' : ''}"><span>${nowLabel()}</span><span class="sb-mid">${showsCall(other) ? `<span class="sb-pill call">${icon('phone', { size: 11 })}${ov.call.type === 'video' ? 'Video ' : ''}<span class="call-t" data-start="${ov.call.at}" data-base="${ov.call.base || 0}">00:00</span></span>` : ''}${(!other || dev?.kind === 'caller') && ov.anydesk ? '<span class="sb-pill rec">● AnyDesk</span>' : ''}</span><span>${!other && ov.sim === 'none' ? 'No service' : '●●● 5G'} ▮</span></div>`;

  // ---------- customer phone ----------
  const drawPhone = () => {
    const p = phone, c = S.customer;
    let body = '';
    if (p.app === 'ringing') body = `<div class="sim-call ringing ${p.bank ? 'bankcall' : ''}"><div class="avatar">${icon(p.bank ? 'shieldCheck' : 'user', { size: 40 })}</div><div class="nm">${esc(p.who)}</div><div class="sub">${esc(p.sub || '')} · ${hi ? 'कॉल आ रही है' : 'incoming call'}</div><div class="call-acts"><span class="dec">${icon('phone', { size: 22 })}</span><span class="acc">${icon('phone', { size: 22 })}</span></div></div>`;
    else if (p.app === 'oncall') body = `<div class="sim-call ${p.bank ? 'bankcall' : 'active'}"><div class="avatar">${icon(p.bank ? 'shieldCheck' : 'user', { size: 40 })}</div><div class="nm">${esc(p.who)}</div><div class="sub"><span class="call-t" data-start="${ov.call?.at || Date.now()}" data-base="${ov.call?.base || 0}">00:00</span></div><div class="call-grid"><span>${icon('volumeOff', { size: 18 })}mute</span><span>${icon('command', { size: 18 })}keypad</span><span>${icon('volume', { size: 18 })}speaker</span></div><div class="call-acts single"><span class="dec">${icon('phone', { size: 22 })}</span></div></div>`;
    else if (p.app === 'whatsapp') body = `<div class="wa"><div class="wa-head">${icon('arrowLeft', { size: 16 })}<div class="av">${icon('user', { size: 16 })}</div><div><b>${esc(p.who)}</b><div class="tiny">online</div></div></div><div class="wa-body">${(p.msgs || []).map(([k, m]) => k === 'file' ? `<div class="wa-msg in file">${icon('file', { size: 18 })}<span>${esc(m)}</span></div>` : `<div class="wa-msg ${k}">${esc(m)}</div>`).join('')}</div></div>`;
    else if (p.app === 'apk') body = `<div class="sys-sheet"><div class="sys-card"><div class="sys-ic">${icon('download', { size: 22 })}</div><b>${hi ? 'अनजान ऐप इंस्टॉल करें?' : 'Install unknown app?'}</b><p class="small">RTO_Challan.apk ${hi ? 'Play Store से नहीं है।' : 'is not from the Play Store.'}</p><div class="sys-btns"><span>Cancel</span><span class="on">Install</span></div></div></div>`;
    else if (p.app === 'access') body = `<div class="sys-sheet"><div class="sys-card warn"><div class="sys-ic">${icon('alert', { size: 22 })}</div><b>${hi ? 'RTO Challan को पूरा नियंत्रण दें?' : 'Allow RTO Challan full control?'}</b><p class="small">${hi ? 'यह आपकी स्क्रीन देख सकता है, SMS पढ़ सकता है और टैप कर सकता है।' : 'It can view your screen, read SMS (OTPs) and tap for you.'}</p><div class="sys-btns"><span>Deny</span><span class="on">Allow</span></div></div></div>`;
    else if (p.app === 'lock' || p.app === 'notif') body = `<div class="sim-lock"><div class="clk">${nowLabel()}</div><div class="dt">${clock ? new Date(clock).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}</div>${(p.app === 'notif' ? [[p.title, p.body]] : p.notes || []).map(([a, b]) => `<div class="lk-note"><b>${esc(a)}</b><span>${esc(b)}</span></div>`).join('')}</div>`;
    else if (p.app === 'search') body = `<div class="br"><div class="br-bar">${icon('search', { size: 14 })} food app refund helpline number</div><div class="br-res"><div class="ad">Ad · 1800-xxx-xxxx</div><b>Food App Customer Care 24×7 – Refund Help</b><p class="small">Call now for instant refund. Official helpline.</p></div><div class="br-res"><b>Help centre – Food App</b><p class="small">Refunds are in the app under Orders. We never ask you to install apps.</p></div></div>`;
    else if (p.app === 'anydesk') body = `<div class="ad-app"><div class="ad-top">AnyDesk</div><div class="ad-code"><span class="tiny">${hi ? 'आपका पता' : 'Your address'}</span><b>482 913 776</b></div><div class="ad-ask">${hi ? '"Support" आपकी स्क्रीन नियंत्रित करना चाहता है' : '"Support" wants to control this device'}<div class="sys-btns"><span>Dismiss</span><span class="on">Accept</span></div></div></div>`;
    else if (p.app === 'checkout') body = `<div class="br"><div class="br-bar">🔒 pay.cryptox-wallet.example</div><div class="co"><b>CryptoX · ${hi ? 'वॉलेट टॉप-अप' : 'Wallet top-up'}</b><div class="co-amt">₹45,000</div><div class="small">Card •••• 4021</div><div class="otp">OTP ${hi ? 'भेजा गया' : 'sent'}: <b>••••••</b></div><span class="co-btn">${hi ? 'भुगतान करें' : 'Pay now'}</span></div></div>`;
    else if (p.app === 'push') body = `<div class="sim-lock dim"><div class="push-card">${icon('shieldCheck', { size: 18 })}<div><b>Bharat Bank · Ruko</b><span>${hi ? 'कोई और आपकी स्क्रीन देख और चला रहा है। ₹45,000 का कार्ड पेमेंट रोका गया।' : 'Someone else can see and control your screen. A ₹45,000 card payment is on hold.'}</span><div class="rk-btns" style="margin-top:8px"><span class="on">${hi ? 'AnyDesk बंद करें' : 'End AnyDesk session'}</span><span>${hi ? 'यह मैं हूँ' : "It's me"}</span></div></div></div></div>`;
    else if (p.app === 'chat') body = `<div class="rk-chat"><div class="rk-chat-h">${icon('shieldCheck', { size: 16 })} Ruko · Bharat Bank</div>${(p.msgs || []).map(([w, m]) => `<div class="rk-msg ${w}">${esc(m)}</div>`).join('')}</div>`;
    else if (p.app === 'sebi') body = `<div class="br"><div class="br-bar">🔒 sebi.gov.in · intermediaries</div><div class="co"><b>${hi ? 'खोज' : 'Search'}: "Zenith Capital Services"</b><div class="sebi-no">${icon('alert', { size: 18 })} ${hi ? 'कोई पंजीकृत ब्रोकर या सलाहकार नहीं मिला' : 'No registered broker or adviser found'}</div><div class="small muted">${hi ? 'SEBI गारंटीड रिटर्न की अनुमति नहीं देता।' : 'SEBI does not allow guaranteed returns.'}</div></div></div>`;
    else if (p.app === 'cancelled') body = `<div class="sim-done ok">${icon('shieldCheck', { size: 44 })}<b>${p.card ? (hi ? 'कार्ड पेमेंट रोका, कार्ड ब्लॉक' : 'Card payment stopped, card blocked') : hi ? 'पेमेंट रद्द' : 'Payment cancelled'}</b><span>${inr(p.amount)} ${hi ? 'आपके खाते में ही है' : 'stays in your account'}</span></div>`;
    else if (p.app === 'case') body = `<div class="case-scr"><div class="case-h">${icon('file', { size: 16 })} ReturnPath · ${esc(p.title)}</div><div class="case-id mono">${esc(caseId || '…')}</div>${(p.rows || []).map(([k, v]) => `<div class="case-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}<div class="case-st">${icon('check', { size: 13 })} ${hi ? 'हर तथ्य सबूत से जुड़ा, कुछ दोबारा नहीं बताना' : 'Every fact tied to its evidence; nothing to retell'}</div></div>`;
    else if (p.app === 'report') body = `<div class="case-scr"><div class="case-h">${icon('send', { size: 16 })} ${hi ? '1930 / cybercrime.gov.in शिकायत' : '1930 / cybercrime.gov.in complaint'}</div>${[[hi ? 'राशि' : 'Amount', inr(p.amount)], [hi ? 'किसे' : 'To', p.to], [hi ? 'क्या हुआ' : 'What happened', p.what], [hi ? 'सबूत' : 'Evidence', hi ? '3 फ़ाइलें, अपने-आप जुड़ीं' : '3 files, attached automatically']].map(([k, v]) => `<div class="case-row"><span>${k}</span><b>${esc(v)}</b></div>`).join('')}<span class="co-btn">${hi ? 'शिकायत भेजें' : 'File complaint'}</span></div>`;
    else if (p.app === 'ack') body = `<div class="sim-done"><div class="ack-ic">${icon('check', { size: 34 })}</div><b>${hi ? 'शिकायत दर्ज' : 'Complaint filed'}</b><span class="mono">${hi ? 'पावती' : 'Acknowledgement'} ${esc(ack || p.no)}</span><ul>${(p.next || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul><span class="tiny muted">${hi ? 'डेमो: शिकायत ड्राफ़्ट होती है, असल में भेजी नहीं जाती' : 'Demo: drafted, not actually submitted'}</span></div>`;
    else if (p.app === 'outcome') body = `<div class="sim-done ok">${icon('shieldCheck', { size: 44 })}<b>${esc(p.big)}</b>${(p.lines || []).map((l) => `<span>${esc(l)}</span>`).join('')}</div>`;
    else if (p.app === 'rp') body = rpScreen(p);
    else if (p.app === 'pay' || p.app === 'ruko') body = payScreen(p);
    else if (p.app === 'skip') body = `<div class="sim-skip">${icon('clock', { size: 30 })}<b>${esc(p.text)}</b></div>`;
    else body = `<div class="sim-home">${[['bank', 'Bharat Bank'], ['send', 'UPI'], ['message', 'WhatsApp'], ['search', 'Browser'], ['phone', 'Phone'], ['users', 'Telegram']].map(([ic, l]) => `<div class="app-ic"><span>${icon(ic, { size: 22 })}</span>${l}</div>`).join('')}</div>`;
    const scr = $('#pScreen', box);
    scr.classList.toggle('has-banner', !!ov.anydesk);
    const capOnPhone = speaking && speaking.who !== 'ruko' && (ov.call || ['kamala', 'teller'].includes(speaking.who));
    scr.innerHTML = statusbar(false) + `<div class="sim-body">${body}</div>`
      + (ov.call?.type === 'video' ? `<div class="pip">${icon('badge', { size: 26 })}<span>${esc(ov.call.who)}</span><i class="live">● LIVE</i></div>` : '')
      + (ov.anydesk ? `<div class="ad-banner">${icon('monitor', { size: 13 })} ${hi ? 'AnyDesk: कोई और आपका फ़ोन चला रहा है' : 'AnyDesk: someone else is controlling this phone'}</div><div class="r-cursor"><svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3l7 17 2.5-7L21 10z" fill="#d92d20" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg><span>${hi ? 'रिमोट' : 'Remote'}</span></div>` : '')
      + (capOnPhone ? `<div class="live-cap">${icon('volume', { size: 12 })}<b>${esc(NAMES[speaking.who] || speaking.who)}</b><span>${esc(speaking.text)}</span></div>` : '')
      + (speaking?.who === 'ruko' && p.app !== 'ruko' ? `<div class="live-cap ruko">${icon('shieldCheck', { size: 12 })}<b>Ruko</b><span>${esc(speaking.text)}</span></div>` : '');
    $('#pLabel', box).textContent = `${c.name}'s phone`;
  };
  // ReturnPath on the customer's phone: the same six steps as the ReturnPath screen in the app.
  const rpScreen = (p) => {
    const labels = [tr('rp_s1'), tr('rp_s2'), tr('rp_s3'), tr('rp_s4'), tr('rp_s5'), tr('rp_s6')];
    const head = `<div class="rpm-head"><div class="rpm-top">${icon('undo', { size: 15 })} ReturnPath</div><div class="rpm-dots">${labels.map((l, k) => `<i class="${k + 1 < p.step ? 'done' : k + 1 === p.step ? 'now' : ''}"></i>`).join('')}</div><div class="rpm-step">${p.step}/6 · ${esc(labels[p.step - 1])}</div></div>`;
    let inner = '';
    if (p.step === 1) inner = `<div class="rpm-note">${icon('check', { size: 13 })} ${esc(tr('rp_prefilled'))}</div><div class="rpm-box">${esc(p.story)}${p.added ? `<span class="rpm-add">${esc(p.added)}</span>` : ''}</div><div class="rpm-mic">${icon('mic', { size: 14 })} ${hi ? 'बोलकर जोड़ा, Gemini ने लिखा' : 'Added by voice; Gemini wrote it down'}</div><span class="co-btn">${esc(tr('save_next') || 'Save and continue')}</span>`;
    else if (p.step === 2) inner = `<label class="rpm-consent">☑ ${hi ? 'मैं इस केस के लिए ये फ़ाइलें साझा करने की सहमति देती/देता हूँ (DPDP Act 2023)। कभी भी हटा सकते हैं।' : 'I consent to share these files for this case (DPDP Act 2023). I can remove them any time.'}</label>${(p.files || []).map(([ic, f]) => `<div class="rpm-file">${icon(ic, { size: 16 })}<span>${esc(f)}</span><b>✓</b></div>`).join('')}`;
    else if (p.step === 3) inner = `<div class="rpm-note">${icon('sparkles', { size: 13 })} ${hi ? 'Gemini हर फ़ाइल पढ़ रहा है; हर तथ्य अपनी जगह से जुड़ा' : 'Gemini reads each file; every fact is tied to where it came from'}</div>${(p.facts || []).map(([v, src], k) => `<div class="rpm-fact" style="animation-delay:${k * 0.35}s"><b>${esc(v)}</b><span class="tiny">${icon('link', { size: 11 })} ${esc(src)}</span></div>`).join('')}`;
    else if (p.step === 4) inner = `<div class="rpm-note">${icon('info', { size: 13 })} ${esc(tr('rp_s4d'))}</div>${(p.facts || []).map(([k2, v, st]) => `<div class="rpm-check"><span class="tiny">${esc(k2)}</span><b>${esc(v)}</b><span class="pill ${st === 'fixed' ? 'warn' : 'ok'}">${st === 'fixed' ? (hi ? 'ठीक किया' : 'fixed by you') : (hi ? 'पक्का' : 'confirmed')}</span></div>`).join('')}`;
    else if (p.step === 5) inner = `${(p.legs || []).map(([a, to, meta]) => `<div class="rpm-leg"><b>${esc(a)}</b>${icon('arrowRight', { size: 14 })}<span>${esc(to)}<span class="tiny">${esc(meta)}</span></span></div>`).join('')}<div class="rpm-total">${hi ? 'कुल' : 'Total'}: <b>${esc(p.total)}</b></div><div class="rpm-note">${icon('flag', { size: 13 })} ${esc(p.note)}</div>`;
    else if (p.step === 6) inner = `${(p.docs || []).map((d) => `<div class="rpm-file">${icon('file', { size: 16 })}<span>${esc(d)}</span><b>✓</b></div>`).join('')}<div class="rpm-valid">${icon('shieldCheck', { size: 14 })} ${hi ? 'जाँच: 0 मान बिना सबूत के। हर रकम और नंबर एक पक्के तथ्य से।' : 'Validator: 0 untraced values. Every amount and number comes from a confirmed fact.'}</div><span class="co-btn">${hi ? 'शिकायत दर्ज करें' : 'File the complaint'}</span>`;
    return `<div class="rpm-scr">${head}<div class="rpm-body">${inner}</div></div>`;
  };
  const payScreen = (p) => {
    const st = S.steps[p.step], d = results[p.step], ch = st.channel;
    const brand = ch === 'upi_app' ? (hi ? 'UPI ऐप' : 'UPI app') : ch === 'card' ? (hi ? 'कार्ड पेमेंट' : 'Card payment') : 'Bharat Bank';
    const form = `<div class="pay-app ch-${ch}"><div class="pa-head">${icon(ch === 'upi_app' ? 'send' : 'bank', { size: 15 })} ${brand}</div><div class="pa-body"><div class="tiny">${hi ? 'किसे' : 'To'}</div><b>${esc(st.payee)}</b><div class="pa-amt">${inr(st.amountINR)}</div><div class="tiny muted">${esc(st.channelLabel)}</div>${p.app === 'pay' ? `<span class="pa-btn ${p.pressing ? 'press' : ''}">${hi ? 'भेजें' : 'Pay'} ${inr(st.amountINR)}</span>` : ''}</div></div>`;
    if (p.app === 'pay') return form;
    if (!d) return form + `<div class="rk-sheet"><div class="rk-h">${icon('shieldCheck', { size: 16 })} Ruko</div><p class="small row" style="gap:8px"><span class="spinner"></span>${hi ? 'पूरी यात्रा देख रहा है…' : 'Reading the whole journey…'}</p></div>`;
    const r = d.result, w = d.action?.warning;
    if (r.tier === 5 && (r.takeover || ch === 'netbanking')) return `<div class="sim-lock"><div class="clk">${nowLabel()}</div><div class="lk-note"><b>Bharat Bank</b><span>${hi ? 'आपके खाते से ₹1,90,000 का पेमेंट रोका गया। बैंक आपको कॉल करेगा।' : 'A ₹1,90,000 payment from your account was stopped. The bank will call you.'}</span></div></div>`;
    const sheet = {
      0: `<div class="rk-ok">${icon('check', { size: 34 })}<b>${hi ? 'पेमेंट हो गया' : 'Payment sent'}</b><span class="small">${hi ? 'कुछ नहीं पूछा गया' : 'Nothing asked'}</span></div>`,
      1: `<div class="rk-sheet t1"><div class="rk-h">${icon('alert', { size: 16 })} ${hi ? 'रुकिए, एक बात' : 'Before you pay'}</div><p class="small">${esc(w || '')}</p><div class="rk-btns"><span>${hi ? 'रद्द करें' : 'Cancel'}</span><span class="on ${p.resolved ? 'press' : ''}">${hi ? 'समझ गया, भेजें' : 'I understand, send'}</span></div></div>`,
      2: `<div class="rk-sheet t2"><div class="rk-h">${icon('clock', { size: 16 })} ${hi ? '30 मिनट के लिए रुका' : 'Paused for 30 minutes'}</div><p class="small">${esc(w || '')}</p><div class="rk-timer">${p.resolved ? '00:00' : '29:59'}</div><div class="rk-btns"><span>${hi ? 'रद्द करें' : 'Cancel'}</span><span class="on ${p.resolved ? 'press' : ''}">${hi ? 'अब भी भेजें' : 'Still send'}</span></div></div>`,
      3: `<div class="rk-sheet t3"><div class="rk-h">${icon('shieldCheck', { size: 16 })} Ruko</div><div class="rk-bubble">${esc(d.action?.question || (hi ? 'यह पेमेंट किस लिए है, और क्या कोई अभी आपको बता रहा है क्या करना है?' : 'What is this payment for, and is anyone telling you what to do right now?'))}</div><div class="tiny muted">${hi ? 'जवाब के बाद ही पैसा जाएगा' : 'The money moves only after this'}</div></div>`,
      4: `<div class="rk-sheet t4"><div class="rk-h">${icon('stop', { size: 16 })} ${hi ? '24 घंटे के लिए रोका गया' : 'Held for 24 hours'}</div><p class="small">${esc(w || '')}</p><div class="tiny">${hi ? 'आपके भरोसेमंद व्यक्ति को बताया गया है।' : 'Your trusted contact has been told and can call you.'}</div><div class="rk-btns" style="margin-top:8px"><span class="on ${p.resolved === 'cancel' ? 'press' : ''}">${hi ? 'पेमेंट रद्द करें' : 'Cancel payment'}</span><span>${hi ? 'बैंक से बात करें' : 'Talk to the bank'}</span></div></div>`,
      5: `<div class="rk-sheet t4"><div class="rk-h">${icon('stop', { size: 16 })} ${hi ? 'पेमेंट रोका, बैंक बात करेगा' : 'Held: the bank will talk to you'}</div><p class="small">${esc(w || '')}</p></div>`,
    }[r.tier];
    return form + sheet;
  };

  // ---------- the other device ----------
  const drawOther = () => {
    $('#oWrap', box).hidden = !dev;
    if (!dev) return;
    $('#oLabel', box).textContent = dev.label;
    let body = '';
    const capList = () => `<div class="cap-list">${lines.slice(-4).map((l, k, a) => `<div class="cap ${k === a.length - 1 && speaking ? 'now' : ''}"><b>${esc(NAMES[l.who] || l.who)}</b> ${esc(l.text)}</div>`).join('')}</div>`;
    if (dev.kind === 'caller') body = `<div class="caller ${ov.call ? '' : 'ended'}"><div class="avatar">${icon(dev.ic, { size: 38 })}</div><div class="nm">${esc(dev.who)}</div><div class="sub">${ov.call ? (hi ? 'कॉल पर' : 'On the call') : (hi ? 'कॉल ख़त्म' : 'Call ended')}</div>${capList()}</div>`;
    else if (dev.kind === 'group') body = `<div class="tg"><div class="tg-head">${icon('users', { size: 16 })}<b>${esc(dev.who)}</b><span class="tiny">12,408 members</span></div><div class="tg-body">${(dev.group || []).map((l) => `<div class="tg-msg">${esc(l)}</div>`).join('')}<div class="tg-chart"><i style="height:30%"></i><i style="height:45%"></i><i style="height:40%"></i><i style="height:70%"></i><i style="height:95%"></i></div></div></div>`;
    else if (dev.kind === 'family') body = ov.call?.family ? `<div class="caller fam"><div class="avatar">${icon('user', { size: 38 })}</div><div class="nm">${hi ? 'अम्मा को कॉल' : 'Calling Amma'}</div><div class="sub">${hi ? 'कॉल पर' : 'On the call'}</div>${capList()}</div>` : `<div class="sim-lock"><div class="clk">${nowLabel()}</div>${sms.map((m) => `<div class="lk-note"><b>Bharat Bank · SMS</b><span>${esc(m)}</span></div>`).join('')}</div>`;
    else if (dev.kind === 'desk') body = `<div class="nb"><div class="nb-head">Fraud desk · ${esc(S.steps[0]?.id || '')}</div><div class="nb-body"><div><b>T5 · ${hi ? 'खाता टेकओवर' : 'Account takeover'}</b></div><div class="tiny">${hi ? 'नया डिवाइस · SIM 6 घं. पहले बदला · APK' : 'New device · SIM changed 6 h ago · sideloaded APK'}</div><div class="nb-form"><div>${hi ? 'रोका' : 'Held'}: <b>₹1,90,000 → Kiran Enterprises</b></div><div>${hi ? 'कार्रवाई' : 'Action'}: <b>${hi ? 'रजिस्टर्ड नंबर पर कॉल' : 'Call registered number'}</b></div></div>${capList()}</div></div>`;
    else if (dev.kind === 'laptop') {
      const d = results[0];
      body = devScreen ? `<div class="nb"><div class="nb-head">Bharat Bank · Net banking</div><div class="nb-body"><div class="tiny">${hi ? 'लॉग इन' : 'Logged in as'}: <b>Ramesh Patil</b></div><div class="tiny" style="color:#b42318">${hi ? 'नया डिवाइस · OTP अपने-आप पढ़ा गया' : 'New device · OTP read automatically'}</div><div class="nb-form"><div>${hi ? 'किसे' : 'To'}: <b>Kiran Enterprises</b></div><div>${hi ? 'राशि' : 'Amount'}: <b>₹1,90,000</b></div></div>${d ? `<div class="nb-res ${d.result.tier >= 4 ? 'bad' : ''}">${d.result.tier >= 4 ? (hi ? 'लेनदेन बैंक ने रोका' : 'Transaction held by the bank') : 'Sent'}</div>` : `<span class="nb-btn">${hi ? 'ट्रांसफ़र' : 'Transfer'}</span>`}</div></div>` : `<div class="nb idle">${icon('monitor', { size: 40 })}<span class="small">${hi ? 'इंतज़ार…' : 'Waiting…'}</span></div>`;
    } else if (dev.kind === 'teller') {
      const d = results[0];
      body = devScreen ? `<div class="tl"><div class="tl-head">RTGS · Teller 3</div><div class="tl-body"><div>${hi ? 'ग्राहक' : 'Customer'}: <b>Kamala Menon, 71</b></div><div>${hi ? 'किसे' : 'To'}: <b>National Supervision Account</b></div><div>${hi ? 'राशि' : 'Amount'}: <b>₹28,00,000</b></div>${d ? `<div class="tl-alert">${icon('alert', { size: 15 })} <b>Ruko: ${hi ? 'RTGS रोका गया' : 'RTGS held'} (T${d.result.tier})</b><ol>${(hi ? ['क्या कोई कॉल पर बता रहा है?', 'क्या किसी को न बताने को कहा गया?', 'क्या यह "सुपरविज़न" खाता बताया गया?'] : ['Is anyone guiding you on a call?', 'Were you told to keep it secret?', 'Were you told this is a "supervision" account?']).map((q) => `<li>${q}</li>`).join('')}</ol></div>${capList()}` : `<span class="nb-btn">${hi ? 'सबमिट' : 'Submit'}</span>`}</div></div>` : `<div class="nb idle">${icon('users', { size: 40 })}<span class="small">${hi ? 'काउंटर खाली' : 'Counter free'}</span></div>`;
    }
    $('#oScreen', box).innerHTML = statusbar(true) + `<div class="sim-body">${body}</div>`;
  };

  // ---------- Ruko's live reasoning ----------
  const drawReason = () => {
    const sig = [['call', hi ? 'कॉल चालू' : 'Call active', ov.call && ov.call.type !== 'video' && !ov.call.family && !ov.call.bank], ['video', hi ? 'वीडियो कॉल' : 'Video call', ov.call?.type === 'video'], ['anydesk', 'AnyDesk / remote control', ov.anydesk], ['sim', hi ? 'SIM बदला' : 'SIM changed', ov.sim === 'none'], ['apk', hi ? 'बाहर से ऐप' : 'Sideloaded app', ov.apk]];
    const d = decision, r = d?.result, ag = r?.aggregates;
    $('#sReason', box).innerHTML = `
      <div class="card-head"><h3>${icon('cpu')}${hi ? 'Ruko क्या देख रहा है' : 'What Ruko is seeing'}</h3><span class="pill ${d?.journey?.ok ? 'ok' : ''}">${d?.journey?.ok ? `${icon('sparkles', { size: 12 })}Gemini` : hi ? 'नियम' : 'Rules'}</span></div>
      <div class="tiny muted" style="margin:-6px 0 6px">${hi ? 'अपने-आप: Ruko SDK, बैंक लेजर, प्राप्तकर्ता डायरेक्टरी' : 'Automatic: Ruko SDK, bank ledger, payee directory'}</div>
      <div class="sig-live">${sig.map(([k, l, on]) => `<span class="sl ${on ? 'on' : ''}">${on ? '●' : '○'} ${l}</span>`).join('')}</div>
      <div class="tier-bar">${[0, 1, 2, 3, 4, 5].map((t) => `<span class="${r && r.tier === t ? `on t${t}` : ''}">T${t}</span>`).join('')}</div>
      ${r ? `<div class="rs-head"><b>${esc(d.txn.id)} · T${r.tier} ${esc(r.name)}</b><span class="score-big"><span>${r.score}</span><small>${hi ? 'स्कोर' : 'score'}</small></span></div>
        <div class="agg">${[[hi ? 'नए payees 24 घं.' : 'New payees 24 h', inr(ag.newPayee24h)], [hi ? 'नए payees 7 दिन' : 'New payees 7 d', inr(ag.newPayee7d)], [hi ? 'मिलती रकम' : 'Similar amounts', ag.similarCount24h], [hi ? 'बचत तोड़ी' : 'Savings broken', ag.liquidation72h ? inr(ag.liquidation72h) : '—']].map(([k, v]) => `<div><span class="tiny muted">${k}</span><b>${v}</b></div>`).join('')}</div>
        <div class="rs-list">${r.reasons.slice(0, 5).map((x) => `<div class="rs-row"><span>${esc(x.label)}</span><b style="color:${x.points > 0 ? 'var(--bad)' : 'var(--ok)'}">${x.points > 0 ? '+' : ''}${x.points}</b></div>`).join('')}</div>
        ${d.patterns.length ? `<div class="group-h">${hi ? 'यात्रा में पैटर्न' : 'Journey patterns'}</div>${d.patterns.map((p) => `<div class="rs-pat"><b>${esc(p.name)}</b> <span class="tiny muted">${Math.round(p.confidence * 100)}% · ${esc(p.source)}</span><div class="ev-chips">${(p.evidence || []).map((x) => `<span class="mono tiny">${esc(x)}</span>`).join('')}</div></div>`).join('')}` : ''}
        ${d.journey?.ok ? `<div class="ai-story"><div class="tiny muted">${icon('sparkles', { size: 12 })} Gemini · ${hi ? 'सबूत जाँचे गए' : 'evidence checked'}</div><p class="small" style="margin:4px 0 0">${esc(d.journey.story)}</p></div>` : ''}`
        : `<p class="small muted" style="margin:12px 0 0">${hi ? 'अभी कोई पेमेंट नहीं। Ruko चुपचाप देख रहा है; ज़्यादातर लोगों से कभी कुछ नहीं पूछा जाता।' : 'No payment yet. Ruko watches silently; most people are never asked anything.'}</p>`}
      ${S.done ? `<div class="callout ok" style="margin-top:12px">${icon('shieldCheck')}<span><b>${hi ? 'अंत' : 'Outcome'}:</b> ${esc(S.done)}</span></div>` : ''}
      ${caseId ? `<div class="row" style="margin-top:10px;gap:6px"><span class="pill info">${icon('file', { size: 12 })}${esc(caseId)}${ack ? ` · ack ${esc(ack)}` : ''}</span><a class="btn sm" href="#/desk/${caseId}">${icon('desk', { size: 14 })}Fraud Desk</a><a class="btn sm" href="#/officer/${caseId}">${icon('badge', { size: 14 })}Officer View</a></div>` : ''}`;
  };
  const drawStory = () => {
    const st = streams.find((s) => s.id === sid), n = script.beats.length;
    $('#sStory', box).innerHTML = `<div class="row between" style="align-items:flex-start"><div><b>${esc(st.customer.name)}, ${st.customer.age} · ${esc(st.customer.city)}</b><p class="small muted" style="margin:4px 0 0;max-width:80ch">${esc(hi ? st.storyHi : st.story)}</p></div><span class="pill">${hi ? 'कदम' : 'Step'} ${Math.max(0, i + 1)}/${n}</span></div>
      <ol class="beats">${script.beats.map((b, k) => `<li class="${k < i ? 'done' : k === i ? 'now' : ''}">${esc(b.t)}</li>`).join('')}</ol>`;
  };
  const drawAll = () => { drawPhone(); drawOther(); drawReason(); drawStory(); box.querySelectorAll('.sim-chip').forEach((b) => b.classList.toggle('on', b.dataset.s === sid)); };

  // ---------- voices ----------
  // Speak a line with a live caption; resolves when it is done, or after a reading pause when muted.
  const speak = async (who, text, myGen) => {
    speaking = { who, text }; lines.push({ who, text }); drawAll();
    const t0 = Date.now();
    if (sound.on) await say(text, { speaker: who, lang: 'en' });
    const left = 1200 + text.length * 38 - (Date.now() - t0);
    if (left > 0) await sleep(left);
    if (myGen !== gen) return;
    speaking = null; drawAll();
    await sleep(350);
  };

  // ---------- running the beats ----------
  const reset = (id) => {
    gen++; stopAll(); playing = false; sid = id; S = { ...streams.find((s) => s.id === id), done: null }; script = SCRIPTS[id];
    i = -1; results = {}; caseId = null; ack = null; ov = {}; phone = { app: 'home' }; dev = script.device ? { ...script.device } : null; devScreen = null; lines = []; sms = []; decision = null; lastPayStep = null; speaking = null;
    clock = S.steps[0]?.at || null; updPlay(); drawAll();
    for (const b of script.beats) for (const [w, t] of b.say || []) prefetch(w, t); // warm the voices
  };
  const step = async (myGen) => {
    if (i >= script.beats.length - 1) return false;
    const b = script.beats[++i];
    drawStory();
    if (b.skip) { phone = { app: 'skip', text: b.skip }; drawAll(); await sleep(2200); if (myGen !== gen) return false; }
    if (b.device) { dev = { ...b.device }; devScreen = null; lines = []; }
    if (b.group && dev) dev.group = [...(dev.group || []), ...b.group];
    if (b.screen) devScreen = b.screen;
    if (b.sms) sms.push(b.sms);
    if (b.call === 'end' || b.call === 'switch') ov.call = null;
    else if (b.call) ov.call = { ...b.call, at: Date.now(), base: b.call.type === 'video' ? 48 * 3600 : 0 };
    if (b.familyCall) ov.call = { type: 'phone', who: 'Karthik (son)', at: Date.now(), family: true };
    if (b.phone?.app === 'oncall' && !ov.call) ov.call = { type: 'phone', who: b.phone.who, at: Date.now(), bank: b.phone.bank };
    if (b.anydesk != null) ov.anydesk = b.anydesk;
    if (b.sim) ov.sim = b.sim;
    if (b.apk) ov.apk = true;
    if (b.phone) phone = { ...b.phone };
    if (b.resolve && lastPayStep != null && !b.phone) phone = { app: 'ruko', step: lastPayStep, resolved: b.resolve };
    if (b.end) S.done = b.end;
    // The case is real: opened on the server when Ruko opens it, so it shows up in the Fraud Desk and
    // Officer View; filing the complaint adds the acknowledgement there too.
    if (b.phone?.app === 'case' && !caseId) { try { caseId = (await post('/switch/case', { streamId: sid, lang: state.lang })).id; } catch {} if (myGen !== gen) return false; }
    if (b.phone?.app === 'ack' && caseId) { try { ack = (await post(`/switch/case/${caseId}/file`, {})).complaint?.ack || null; } catch {} if (myGen !== gen) return false; }
    drawAll();
    if (b.ring) { ring(2); await sleep(sound.on ? 4200 : 2400); if (myGen !== gen) return false; }
    if (b.pay != null) {
      const k = b.pay, st = S.steps[k];
      clock = st.at; lastPayStep = k;
      const elsewhere = st.channel === 'netbanking' || st.channel === 'branch'; // paid on another device
      if (!elsewhere) {
        phone = { app: 'pay', step: k }; drawAll(); await sleep(1800); if (myGen !== gen) return false;
        phone = { app: 'pay', step: k, pressing: true }; drawAll(); await sleep(600); if (myGen !== gen) return false;
        phone = { app: 'ruko', step: k };
      }
      drawAll();
      results[k] = await post('/switch/evaluate', { streamId: sid, step: k, lang: state.lang });
      if (myGen !== gen) return false;
      decision = results[k];
      if (st.channel === 'branch') phone = { app: 'notif', title: 'Bharat Bank', body: hi ? `आपका ${inr(st.amountINR)} का RTGS रोका गया है। टेलर आपसे बात करेंगे।` : `Your RTGS of ${inr(st.amountINR)} is on hold. The teller will speak with you.` };
      drawAll();
      // Ruko speaks when it interrupts the customer; an ordinary payment just goes through.
      if (decision.result.tier >= 1 && !elsewhere && decision.action?.warning) await speak('ruko', decision.action.warning, myGen);
      else await sleep(decision.result.tier === 0 ? 1600 : 3000);
      if (myGen !== gen) return false;
    }
    for (const [who, text] of b.say || []) { await speak(who, text, myGen); if (myGen !== gen) return false; }
    if (!(b.say || []).length && b.pay == null) await sleep(b.end ? 6000 : 4000); // time to read what changed
    return true;
  };
  const updPlay = () => {
    const done = i >= script.beats.length - 1 && i >= 0;
    $('#sPlay', box).innerHTML = playing ? `${icon('pause', { size: 15 })}${hi ? 'रोकें' : 'Pause'}` : `${icon('play', { size: 15 })}${done ? (hi ? 'फिर से चलाएँ' : 'Play again') : hi ? 'ऑटो-प्ले' : 'Auto-play'}`;
    $('#sSound', box).innerHTML = icon(sound.on ? 'volume' : 'volumeOff', { size: 16 });
    $('#sSound', box).setAttribute('aria-label', sound.on ? 'Sound on: click to mute' : 'Sound off: click to turn on');
  };
  const play = async () => {
    if (playing) { playing = false; gen++; stopAll(); updPlay(); return; }
    if (i >= script.beats.length - 1) reset(sid);
    playing = true; updPlay(); const my = gen;
    box.querySelector('.sim-stage')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    while (playing && my === gen) {
      const more = await step(my);
      if (!more || my !== gen) break;
      await sleep(800); // a breath between beats
    }
    if (my === gen) { playing = false; updPlay(); }
  };
  const tick = setInterval(() => {
    box.querySelectorAll('.call-t').forEach((el) => { const s = Math.floor((Date.now() - Number(el.dataset.start)) / 1000) + Number(el.dataset.base || 0); el.textContent = s >= 3600 ? `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m` : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; });
  }, 1000);

  box.querySelectorAll('.sim-chip').forEach((b) => b.addEventListener('click', () => reset(b.dataset.s)));
  $('#sPlay', box).addEventListener('click', play);
  $('#sNext', box).addEventListener('click', async () => { if (playing) { playing = false; gen++; stopAll(); } updPlay(); const my = gen; await step(my); updPlay(); });
  $('#sRestart', box).addEventListener('click', () => reset(sid));
  $('#sSound', box).addEventListener('click', () => { sound.on = !sound.on; updPlay(); });
  reset('D');
  return () => { gen++; playing = false; stopAll(); clearInterval(tick); };
}
