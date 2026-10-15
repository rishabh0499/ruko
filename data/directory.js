// MOCKED beneficiary-bank directory: when each payee account was opened. In production this comes
// from the beneficiary bank / NPCI lookups and I4C Suspect Registry or MuleHunter.AI feeds, never
// from the customer. Unknown accounts return null (the engine then adds no points for account age).
export default {
  '50200081234567': { openedDaysAgo: 9, bank: 'HDFC Bank' },
  '917020045566112': { openedDaysAgo: 2100, bank: 'Axis Bank' },
  '39880100022211': { openedDaysAgo: 15, bank: 'Federal Bank' },
  '50200077665544': { openedDaysAgo: 12, bank: 'HDFC Bank' },
  '77001234009876': { openedDaysAgo: 21, bank: 'Kotak Mahindra Bank' },
};
