// Payment streams for the Risk Engine demo: one customer's ledger each, across every rail.
// Entries with `check: true` are payment attempts the engine scores in order; the rest are context
// (earlier payments, credits, FDs broken). All people, accounts and amounts are synthetic.
const d = (date, time = '10:00') => `${date}T${time}:00+05:30`;
const normalHistory = (prefix, trusted) => [
  { id: `${prefix}-h1`, at: d('2026-09-02', '09:10'), kind: 'debit', amountINR: 2450, channel: 'upi_app', payeeName: 'Fresh Mart', payeeAccount: 'FM-001', payeeFirstSeenDays: 300 },
  { id: `${prefix}-h2`, at: d('2026-09-05', '19:40'), kind: 'debit', amountINR: 1830, channel: 'app', payeeName: 'State Electricity Board', payeeAccount: 'SEB-77', payeeFirstSeenDays: 900 },
  { id: `${prefix}-h3`, at: d('2026-09-12', '13:05'), kind: 'debit', amountINR: trusted.amountINR, channel: 'app', payeeName: trusted.name, payeeAccount: trusted.account, payeeFirstSeenDays: 400 },
  { id: `${prefix}-h4`, at: d('2026-09-30', '10:00'), kind: 'credit', amountINR: 48200, channel: 'app', fromName: 'Salary / pension' },
];

export const STREAMS = [
  {
    id: 'D', tag: 'Splitting on a UPI app', tagHi: 'UPI ऐप पर टुकड़ों में',
    title: '₹10,000 × 5 on PhonePe', titleHi: 'PhonePe पर ₹10,000 × 5',
    story: 'A caller says Meena\'s SIM will be blocked unless she pays "verification fees" in small parts, so no single payment looks large.',
    storyHi: 'कॉलर कहता है कि मीना का SIM बंद हो जाएगा, जब तक वह छोटे-छोटे हिस्सों में "वेरिफिकेशन फ़ीस" न भरे।',
    expect: 'Parts 1–2 get a warning; the 3rd is held once the running total and the repeat amounts show the split.',
    customer: { name: 'Meena Iyer', age: 58, city: 'Chennai', balanceINR: 320000 },
    memory: { trustedPayees: ['RENT-MI'] },
    events: [
      ...normalHistory('D', { name: 'Landlord (rent)', account: 'RENT-MI', amountINR: 18000 }),
      { id: 'D-1', check: true, at: d('2026-10-15', '14:02'), amountINR: 9999, channel: 'upi_app', payee: { name: 'Ravi Kumar', account: 'UPI-RK22', upi: 'ravi.k22@ybl', isNew: true, firstSeenDays: 0, accountAgeDays: 40 }, session: { activeCall: true } },
      { id: 'D-2', check: true, at: d('2026-10-15', '14:09'), amountINR: 9999, channel: 'upi_app', payee: { name: 'Ravi Kumar', account: 'UPI-RK22', upi: 'ravi.k22@ybl', isNew: true, firstSeenDays: 0, accountAgeDays: 40 }, session: { activeCall: true } },
      { id: 'D-3', check: true, at: d('2026-10-15', '14:15'), amountINR: 9999, channel: 'upi_app', payee: { name: 'Suresh Traders', account: 'UPI-ST09', upi: 'suresh.t09@okaxis', isNew: true, firstSeenDays: 0, accountAgeDays: 22 }, session: { activeCall: true } },
      { id: 'D-4', check: true, at: d('2026-10-15', '14:22'), amountINR: 9999, channel: 'upi_app', payee: { name: 'Suresh Traders', account: 'UPI-ST09', upi: 'suresh.t09@okaxis', isNew: true, firstSeenDays: 0, accountAgeDays: 22 }, session: { activeCall: true } },
      { id: 'D-5', check: true, at: d('2026-10-15', '14:30'), amountINR: 9999, channel: 'upi_app', payee: { name: 'Ravi Kumar', account: 'UPI-RK22', upi: 'ravi.k22@ybl', isNew: true, firstSeenDays: 0, accountAgeDays: 40 }, session: { activeCall: true } },
    ],
  },
  {
    id: 'E', tag: 'Investment scam over weeks', tagHi: 'हफ़्तों चला इन्वेस्टमेंट स्कैम',
    title: 'A "trading app" that keeps asking for more', titleHi: 'एक "ट्रेडिंग ऐप" जो और पैसे माँगता रहा',
    story: 'Vikram joined a WhatsApp "stock tips" group. A trading app shows big profits; small "returns" arrive to build trust, then each deposit is bigger, to a new account each time.',
    storyHi: 'विक्रम एक WhatsApp "स्टॉक टिप्स" ग्रुप में जुड़े। ऐप बड़ा मुनाफ़ा दिखाता है, भरोसे के लिए छोटे "रिटर्न" आते हैं, फिर हर बार बड़ी रकम नए खाते में।',
    expect: 'No single payment proves anything: the 1st gets a short cooling-off, the 2nd looks normal. The journey gives it away: rising deposits to rotating new accounts with small "returns" back. Ruko holds the 3rd, before the ₹1.5 lakh and ₹3 lakh ones.',
    customer: { name: 'Vikram Desai', age: 45, city: 'Pune', balanceINR: 900000 },
    memory: {},
    events: [
      ...normalHistory('E', { name: 'Society maintenance', account: 'SOC-VD', amountINR: 4500 }),
      { id: 'E-1', check: true, at: d('2026-09-02', '21:15'), amountINR: 10000, channel: 'app', payee: { name: 'Alpha Trade Desk', account: 'ALPHA-01', isNew: true, firstSeenDays: 0, accountAgeDays: 20 }, session: {} },
      { id: 'E-c1', at: d('2026-09-06', '11:00'), kind: 'credit', amountINR: 1500, channel: 'app', fromName: 'Alpha Trade Desk', fromAccount: 'ALPHA-01', note: '"profit withdrawal"' },
      { id: 'E-2', check: true, at: d('2026-09-10', '20:40'), amountINR: 25000, channel: 'app', payee: { name: 'Alpha Trade Desk', account: 'ALPHA-01', isNew: false, firstSeenDays: 8, accountAgeDays: 28 }, session: {} },
      { id: 'E-3', check: true, at: d('2026-09-17', '22:05'), amountINR: 60000, channel: 'app', payee: { name: 'Zenith Capital Services', account: 'ZENITH-7', isNew: true, firstSeenDays: 0, accountAgeDays: 15 }, session: {} },
      { id: 'E-c2', at: d('2026-09-18', '10:30'), kind: 'credit', amountINR: 3000, channel: 'app', fromName: 'Zenith Capital Services', fromAccount: 'ZENITH-7', note: '"profit withdrawal"' },
      { id: 'E-4', check: true, at: d('2026-09-26', '21:50'), amountINR: 150000, channel: 'app', payee: { name: 'Zenith Capital Services', account: 'ZENITH-7', isNew: false, firstSeenDays: 9, accountAgeDays: 24 }, session: {} },
      { id: 'E-5', check: true, at: d('2026-10-08', '22:20'), amountINR: 300000, channel: 'app', payee: { name: 'Nova Wealth LLP', account: 'NOVA-33', isNew: true, firstSeenDays: 0, accountAgeDays: 12 }, session: {} },
    ],
  },
  {
    id: 'F', tag: 'APK malware + SIM swap', tagHi: 'APK मैलवेयर + SIM स्वैप',
    title: 'Not him at the controls', titleHi: 'पैसे भेजने वाला वह नहीं है',
    story: 'Ramesh opened "RTO_Challan.apk" from a WhatsApp message. Hours later his SIM moved to a new phone and someone logged in to net banking at 2 am.',
    storyHi: 'रमेश ने WhatsApp पर आई "RTO_Challan.apk" खोली। कुछ घंटे बाद उनका SIM नए फ़ोन में चला गया और रात 2 बजे किसी ने नेट बैंकिंग खोली।',
    expect: 'Asking questions is pointless: the person paying is not Ramesh. Ruko stops it and the bank calls him on his registered number.',
    customer: { name: 'Ramesh Patil', age: 52, city: 'Nagpur', balanceINR: 410000 },
    memory: {},
    events: [
      ...normalHistory('F', { name: 'Home loan EMI', account: 'EMI-RP', amountINR: 21000 }),
      { id: 'F-1', check: true, at: d('2026-10-15', '02:10'), amountINR: 190000, channel: 'netbanking', payee: { name: 'Kiran Enterprises', account: 'KIRAN-4', isNew: true, firstSeenDays: 0, accountAgeDays: 4 }, session: { newDevice: true, simChangeHours: 6, sideloadedApp: 'RTO_Challan.apk', hour: 2, pastedAccount: true } },
    ],
  },
  {
    id: 'G', tag: 'FD broken, then branch RTGS', tagHi: 'FD तोड़ी, फिर ब्रांच से RTGS',
    title: 'At the counter, not the app', titleHi: 'ऐप नहीं, बैंक काउंटर पर',
    story: 'After two days on a "digital arrest" video call, Kamala broke her ₹30 lakh FD and walks into the branch to RTGS ₹28 lakh to a "National Supervision Account".',
    storyHi: 'दो दिन "डिजिटल अरेस्ट" वीडियो कॉल के बाद कमला जी ने ₹30 लाख की FD तोड़ी और ब्रांच में ₹28 लाख का RTGS करने आईं।',
    expect: 'Branch payments never reach an app. Ruko alerts the teller with the reasons and three questions to ask, and holds the RTGS.',
    customer: { name: 'Kamala Menon', age: 71, city: 'Kochi', balanceINR: 3120000 },
    memory: {},
    events: [
      ...normalHistory('G', { name: 'Pharmacy', account: 'PH-KM', amountINR: 3200 }),
      { id: 'G-fd', at: d('2026-10-14', '11:20'), kind: 'fd_break', amountINR: 3000000, channel: 'branch', note: 'FD closed before maturity' },
      { id: 'G-1', check: true, at: d('2026-10-15', '11:05'), amountINR: 2800000, channel: 'branch', payee: { name: 'National Supervision Account', account: '39880100022211', isNew: true, firstSeenDays: 0, accountAgeDays: 15 }, session: {} },
    ],
  },
  {
    id: 'H', tag: 'Card + remote access', tagHi: 'कार्ड + रिमोट ऐक्सेस',
    title: 'Fake customer care, AnyDesk, card payment', titleHi: 'नकली कस्टमर केयर, AnyDesk, कार्ड पेमेंट',
    story: 'Pooja searched for a delivery app\'s helpline, called the first number, and installed AnyDesk "to get a refund". Now her card is being charged at a crypto wallet.',
    storyHi: 'पूजा ने हेल्पलाइन सर्च की, पहले नंबर पर कॉल किया और "रिफ़ंड" के लिए AnyDesk डाल लिया। अब उनके कार्ड से क्रिप्टो वॉलेट में पेमेंट हो रहा है।',
    expect: 'Someone else can see her screen: Ruko holds the card payment and sends a push to her app to confirm, with the reason.',
    customer: { name: 'Pooja Rao', age: 34, city: 'Bengaluru', balanceINR: 260000 },
    memory: {},
    events: [
      ...normalHistory('H', { name: 'Gym membership', account: 'GYM-PR', amountINR: 2500 }),
      { id: 'H-1', check: true, at: d('2026-10-15', '16:40'), amountINR: 45000, channel: 'card', merchant: 'CryptoX wallet top-up', payee: { name: 'CryptoX', account: 'MCC-CRYPTOX', isNew: true, firstSeenDays: 0 }, session: { activeCall: true, remoteAccessApp: 'AnyDesk' } },
    ],
  },
  {
    id: 'N', tag: 'An ordinary month', tagHi: 'एक आम महीना',
    title: 'Honest customer, almost no friction', titleHi: 'ईमानदार ग्राहक, लगभग कोई रोक-टोक नहीं',
    story: 'Arjun pays rent, bills, a friend, a plumber and a second instalment to his builder. This is what most customers do.',
    storyHi: 'अर्जुन किराया, बिल, एक दोस्त, प्लंबर और बिल्डर की दूसरी किस्त भरते हैं। ज़्यादातर ग्राहक यही करते हैं।',
    expect: 'Nothing is asked. Trusted payees and a purpose already checked keep friction at zero.',
    customer: { name: 'Arjun Mehta', age: 39, city: 'Mumbai', balanceINR: 1850000 },
    memory: { trustedPayees: ['RENT-AM', 'BUILD-KB', 'SEB-77', 'FM-001'], cleared: [{ payee: 'BUILD-KB', purpose: 'Flat down payment, Baner Heights', amountINR: 500000 }] },
    events: [
      ...normalHistory('N', { name: 'Landlord (rent)', account: 'RENT-AM', amountINR: 32000 }),
      { id: 'N-0', at: d('2026-08-20', '12:00'), kind: 'debit', amountINR: 500000, channel: 'app', payeeName: 'Kumar Builders Pvt Ltd', payeeAccount: 'BUILD-KB', payeeFirstSeenDays: 60 },
      { id: 'N-1', check: true, at: d('2026-10-01', '09:30'), amountINR: 32000, channel: 'app', payee: { name: 'Landlord (rent)', account: 'RENT-AM', isNew: false, firstSeenDays: 400 }, session: {} },
      { id: 'N-2', check: true, at: d('2026-10-03', '18:10'), amountINR: 2780, channel: 'upi_app', payee: { name: 'Fresh Mart', account: 'FM-001', isNew: false, firstSeenDays: 300 }, session: {} },
      { id: 'N-3', check: true, at: d('2026-10-06', '20:00'), amountINR: 1990, channel: 'app', payee: { name: 'State Electricity Board', account: 'SEB-77', isNew: false, firstSeenDays: 900 }, session: {} },
      { id: 'N-4', check: true, at: d('2026-10-08', '21:30'), amountINR: 3000, channel: 'upi_app', payee: { name: 'Rohan (friend)', account: 'UPI-RH', isNew: true, firstSeenDays: 0, accountAgeDays: 2000 }, session: {} },
      { id: 'N-5', check: true, at: d('2026-10-10', '11:15'), amountINR: 18500, channel: 'upi_app', payee: { name: 'Sai Plumbing Works', account: 'UPI-SAI', isNew: true, firstSeenDays: 0, accountAgeDays: 900 }, session: {} },
      { id: 'N-6', check: true, at: d('2026-10-12', '15:00'), amountINR: 2499, channel: 'card', merchant: 'Online grocery', payee: { name: 'BigBasket', account: 'MCC-BB', isNew: false, firstSeenDays: 500 }, session: {} },
      { id: 'N-7', check: true, at: d('2026-10-14', '12:20'), amountINR: 500000, channel: 'app', payee: { name: 'Kumar Builders Pvt Ltd', account: 'BUILD-KB', isNew: false, firstSeenDays: 55 }, session: {} },
    ],
  },
];

// Expected tier ranges per checked payment (for tests and the evaluation's friction metrics).
export const EXPECT = { 'D-1': [1, 1], 'D-2': [1, 2], 'D-3': [3, 5], 'D-4': [4, 5], 'D-5': [4, 5], 'E-1': [0, 2], 'E-2': [0, 2], 'E-3': [3, 5], 'E-4': [3, 5], 'E-5': [4, 5], 'F-1': [5, 5], 'G-1': [4, 5], 'H-1': [4, 5], 'N-1': [0, 0], 'N-2': [0, 0], 'N-3': [0, 0], 'N-4': [0, 0], 'N-5': [0, 1], 'N-6': [0, 0], 'N-7': [0, 0] };

// What each story's case looks like once Ruko opens it (built server-side, shown in the Fraud Desk
// and Officer View). held = the stopped payment step; lost = steps whose money had already left.
export const SIM_CASES = {
  D: { claims: [['upi_id', 'ravi.k22@ybl'], ['caller_phone', '+91 98110 41230'], ['impersonated_agency', 'TRAI']], held: 2, lost: [0, 1], outcome: 'cancelled', title: 'SIM-block "verification fee" scam (split payments)',
    trusted: { by: 'Karthik Iyer', relation: 'son', verdict: 'scam' },
    story: 'A caller posing as TRAI said my SIM would be blocked and made me pay ₹9,999 in parts to ravi.k22@ybl on PhonePe, telling me not to inform my family. Ruko held the third part; my son called and I cut the call.',
    timeline: [['customer', 'call_started', 'Incoming call from +91 98110 41230 claiming to be TRAI'], ['risk_engine', 'nudge_shown', 'Part 1 ₹9,999: warning shown, customer continued'], ['risk_engine', 'cooling_off', 'Part 2 ₹9,999: 30-minute pause, customer sent anyway'], ['risk_engine', 'hold_placed', 'Part 3: held 24 h (split payments + running total + call)'], ['system', 'trusted_contact_notified', 'SMS to Karthik (son)'], ['trusted_contact', 'advice', 'Karthik called: "It is a scam"'], ['customer', 'payment_cancelled', 'Held part cancelled; scam call ended']] },
  E: { claims: [['payee_account', 'ALPHA-01 (Alpha Trade Desk)'], ['telegram_group', 'Stock Gurus VIP'], ['claimed_entity', 'Zenith Capital Services']], held: 2, lost: [0, 1], outcome: 'cancelled', title: 'Investment / trading app scam',
    story: 'I joined a Telegram stock-tips group, deposited ₹10,000 and ₹25,000 into their Alpha Trade app and got ₹1,500 back once. They asked me to move to Zenith Capital for double returns; Ruko held that payment and a SEBI check showed Zenith is not registered.',
    timeline: [['risk_engine', 'cooling_off', 'Deposit 1 ₹10,000: 30-minute pause'], ['customer', 'credit_received', '₹1,500 "profit withdrawal" from Alpha Trade Desk'], ['risk_engine', 'allowed', 'Deposit 2 ₹25,000: no friction'], ['risk_engine', 'hold_placed', 'Deposit 3 ₹60,000 to Zenith: investment pattern (rules + Gemini)'], ['customer', 'verified', 'SEBI register: Zenith not registered'], ['customer', 'payment_cancelled', '₹60,000 cancelled']] },
  F: { claims: [['payee_account', 'KIRAN-4 (Kiran Enterprises)'], ['malware', 'RTO_Challan.apk']], held: 0, lost: [], outcome: 'stopped', title: 'Account takeover (APK malware + SIM swap)',
    story: 'I installed an "RTO challan" app from WhatsApp. At 2 am my SIM moved to another phone and someone used my net banking to send ₹1,90,000. The bank stopped it and called me.',
    timeline: [['customer', 'apk_installed', 'RTO_Challan.apk installed outside the Play Store, accessibility granted'], ['system', 'sim_change', 'SIM activated on another device (02:04)'], ['risk_engine', 'takeover_hold', 'Net banking ₹1,90,000 from a new device: stopped, no interview'], ['desk', 'call', 'Fraud desk called the registered number; customer denied the payment'], ['desk', 'secured', 'New device blocked, net banking reset']] },
  G: { claims: [['payee_account', '39880100022211 (National Supervision Account)'], ['impersonated_agency', 'CBI']], held: 0, lost: [], outcome: 'stopped', title: 'Digital arrest attempt (branch RTGS)',
    story: 'A "CBI officer" kept me on a video call for two days and told me to break my FD and RTGS ₹28 lakh to a National Supervision Account. At the branch the teller asked me questions and I told her the truth.',
    timeline: [['customer', 'video_call', 'Video call with "CBI Officer Mishra" (48 h)'], ['customer', 'fd_closed', 'FD ₹30,00,000 closed before maturity'], ['risk_engine', 'teller_alert', 'Branch RTGS ₹28,00,000 held: reported mule payee, savings just broken'], ['teller', 'questions', 'Teller asked the three questions; customer confirmed a caller was guiding her'], ['customer', 'call_ended', 'Scam call ended; son informed']] },
  H: { claims: [['helpline_number', '1800-xxx-xxxx (fake food-app care)'], ['merchant', 'CryptoX wallet top-up']], held: 0, lost: [], outcome: 'stopped', title: 'Fake customer care + AnyDesk (card payment)',
    story: 'I called a refund helpline from a search ad. They made me install AnyDesk and a ₹45,000 card payment to a crypto wallet opened on my phone. Ruko held it and told me someone could see my screen.',
    timeline: [['customer', 'call_started', 'Called a fake helpline from a search ad'], ['customer', 'remote_access', 'AnyDesk session accepted'], ['risk_engine', 'hold_placed', 'Card ₹45,000 to CryptoX: remote access + crypto merchant'], ['customer', 'session_ended', 'AnyDesk ended from the Ruko notification; card blocked']] },
};
