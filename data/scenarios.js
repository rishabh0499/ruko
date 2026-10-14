// Three seeded demo scenarios. All people, accounts and documents are synthetic.
export const SCENARIOS = {
  A: {
    id: 'A',
    label: 'Scam: retired teacher, ₹18 lakh',
    labelHi: 'स्कैम: रिटायर्ड टीचर, ₹18 लाख',
    door: 'victim',
    language: 'hi',
    customer: { name: 'Sunita Sharma', age: 66, city: 'Lucknow', phoneMasked: '+91 9XXXX X2210', accountMasked: 'XX4402', balanceINR: 2460000 },
    trustedContacts: [{ name: 'Amit Sharma', relation: 'son', relationHi: 'बेटे', phoneMasked: '+91 9XXXX X8812', channel: 'sms' }],
    payment: {
      amountINR: 1800000, payeeName: 'RBI Verification Cell', payeeAccount: '50200081234567', payeeIFSC: 'HDFC0001234',
      payeeIsNew: true, payeeAccountAgeDays: 9, rail: 'RTGS', amountVs90DayMax: 7.5,
      sessionSignals: { activeVideoCall: true, activeScreenShare: false, remoteAccessApp: false },
    },
    // Auto-play replies, in order. {evidence:[...]} attaches synthetic evidence with that turn.
    replies: [
      { text: 'बेटे के लिए प्रॉपर्टी ले रही हूँ।', delay: 1800 },
      { text: 'वो... बेटा ही सब देख रहा है। मुझे बस पैसे भेजने हैं, आज ही।', delay: 2200 },
      { text: 'हाँ, एक अधिकारी वीडियो कॉल पर हैं। उन्होंने कहा है कि यह RBI वेरिफिकेशन है, पैसा 2 घंटे में वापस आ जाएगा।', delay: 2600 },
      { text: 'उन्होंने कहा किसी को मत बताना, वरना मुझे गिरफ्तार कर लेंगे। मेरे नाम पर ड्रग्स वाला पार्सल पकड़ा गया है।', delay: 2600 },
      { text: 'यह देखिए, CBI वालों ने वारंट भेजा है।', delay: 2000, evidence: ['A-wa', 'A-warrant'] },
    ],
    returnEvidence: ['A-sms'],
    speaker: 'sunita',
    // The same story in the other language, so auto-play and the call follow the UI language.
    repliesAlt: {
      en: [
        { text: 'I am buying property for my son.', delay: 1800 },
        { text: 'Er... my son is handling all of that. I just need to send the money today.', delay: 2200 },
        { text: 'Yes, an officer is on a video call. He said this is RBI verification and the money will come back in 2 hours.', delay: 2600 },
        { text: 'He said not to tell anyone or they will arrest me. A parcel with drugs was seized in my name.', delay: 2600 },
        { text: 'See, the CBI people sent me a warrant.', delay: 2000, evidence: ['A-wa', 'A-warrant'] },
      ],
    },
    callScriptAlt: {
      en: [
        { speaker: 'amit', text: 'Ma, are you okay? The bank just messaged me that you are sending eighteen lakh rupees to a new account.' },
        { speaker: 'sunita', text: 'Beta, the CBI people are on a video call. They say a parcel with drugs was caught in my name. I am not allowed to tell anyone.' },
        { speaker: 'amit', text: 'Ma, cut that call right now. This is a scam. No police or CBI ever asks for money on a video call.' },
        { speaker: 'sunita', text: 'But they said they will arrest me...' },
        { speaker: 'amit', text: 'Nobody is arresting you, Ma. I will be there in ten minutes. Until then, do not send a single rupee.' },
        { speaker: 'sunita', text: 'Okay beta... I am cutting the call.' },
      ],
    },
    // The second-channel call: the trusted contact breaks the isolation.
    callScript: [
      { speaker: 'amit', text: 'माँ, आप ठीक हो? बैंक से मैसेज आया है कि आप अठारह लाख रुपये किसी नए खाते में भेज रही हो।' },
      { speaker: 'sunita', text: 'बेटा, CBI वाले वीडियो कॉल पर हैं। कह रहे हैं मेरे नाम पर ड्रग्स का पार्सल पकड़ा गया है। किसी को बताना मना है।' },
      { speaker: 'amit', text: 'माँ, अभी वो कॉल काट दो। यह स्कैम है। कोई भी पुलिस या CBI वीडियो कॉल पर पैसे नहीं माँगती।' },
      { speaker: 'sunita', text: 'पर वो कह रहे थे कि मुझे गिरफ़्तार कर लेंगे…' },
      { speaker: 'amit', text: 'कोई गिरफ़्तारी नहीं होगी, माँ। मैं दस मिनट में आ रहा हूँ। तब तक किसी को एक रुपया भी मत भेजना।' },
      { speaker: 'sunita', text: 'ठीक है बेटा… मैं कॉल काट रही हूँ।' },
    ],
  },
  B: {
    id: 'B',
    label: 'Legit: property down payment, ₹15 lakh',
    labelHi: 'असली: फ्लैट का डाउन पेमेंट, ₹15 लाख',
    door: 'victim',
    language: 'en',
    customer: { name: 'Rakesh Iyer', age: 41, city: 'Pune', phoneMasked: '+91 9XXXX X4471', accountMasked: 'XX9120', balanceINR: 2210000 },
    trustedContacts: [{ name: 'Priya Iyer', relation: 'wife', relationHi: 'पत्नी', phoneMasked: '+91 9XXXX X3302', channel: 'sms' }],
    payment: {
      amountINR: 1500000, payeeName: 'Kumar Builders Pvt Ltd', payeeAccount: '917020045566112', payeeIFSC: 'UTIB0000421',
      payeeIsNew: true, payeeAccountAgeDays: 2100, rail: 'NEFT', amountVs90DayMax: 6.2,
      sessionSignals: { activeVideoCall: false, activeScreenShare: false, remoteAccessApp: false },
    },
    replies: [
      { text: 'Down payment for a 2BHK flat at Kumar Builders, their Baner Heights project.', delay: 1800 },
      { text: 'From the builder\'s demand letter. I visited the site office last Saturday with my wife.', delay: 2200 },
      { text: 'No, nothing like that. The home loan disbursement comes next month.', delay: 2000 },
      { text: 'Here is the demand letter with the agreement registration number.', delay: 1800, evidence: ['B-agreement'] },
    ],
    returnEvidence: [],
    speaker: 'rakesh',
    repliesAlt: {
      hi: [
        { text: 'कुमार बिल्डर्स के बानेर हाइट्स प्रोजेक्ट में 2BHK फ्लैट का डाउन पेमेंट है।', delay: 1800 },
        { text: 'बिल्डर के डिमांड लेटर से। पिछले शनिवार मैं पत्नी के साथ साइट ऑफ़िस गया था।', delay: 2200 },
        { text: 'नहीं, ऐसा कुछ नहीं। होम लोन अगले महीने आएगा।', delay: 2000 },
        { text: 'यह रहा डिमांड लेटर, एग्रीमेंट नंबर के साथ।', delay: 1800, evidence: ['B-agreement'] },
      ],
    },
  },
  C: {
    id: 'C',
    label: 'Frozen account: garment trader, ₹9,000 credit',
    labelHi: 'फ़्रीज़ खाता: कपड़ा व्यापारी, ₹9,000 क्रेडिट',
    door: 'frozen_holder',
    language: 'hi',
    customer: { name: 'Imran Qureshi', age: 34, city: 'Surat', phoneMasked: '+91 9XXXX X6630', accountMasked: 'XX7781', balanceINR: 640000 },
    trustedContacts: [],
    payment: null,
    story: 'मेरा करंट अकाउंट 6 दिन पहले अचानक फ़्रीज़ हो गया। बैंक ने बस साइबर सेल का नाम लिया। मुझे लगता है एक ग्राहक से आए ₹9,000 के UPI पेमेंट की वजह से हुआ। पूरा ₹6.4 लाख अटका है, सप्लायर्स को पेमेंट नहीं कर पा रहा।',
    returnEvidence: ['C-notice', 'C-statement'],
    speaker: 'imran',
  },
};

// Replies and call script in the requested language (falls back to the scenario default).
export const repliesFor = (scn, lang) => (lang && lang !== scn.language && scn.repliesAlt?.[lang]) || scn.replies || [];
export const callScriptFor = (scn, lang) => (lang && lang !== scn.language && scn.callScriptAlt?.[lang]) || scn.callScript || [];
