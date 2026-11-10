/* The Closing tab shows a typed side address. composeAddress has to be imported or that line throws. */
import { toText } from '../js/ui.js';
import { render } from '../js/pages/dealclosing.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const api = {
  listSettlements: async () => [],
  getClosingOfficeDefault: async () => ({ offices: [] }),
  listClosingProposals: async () => [],
  listClosingLocations: async () => [],
};
const user = { id: 'u-sp', role: 'Sales Person', firstName: 'Sam', lastName: 'Sales' };
const deal = {
  id: 'deal-typed', fileNumber: 'FL-26-00001', closingDate: '2026-12-01',
  buyerPlaceKind: 'manual', buyerManualStreet: '9 Fake Pier', buyerManualCity: 'Miami', buyerManualState: 'FL', buyerManualZip: '33131',
};
const page = await render({ api, user, deal, refresh() {} });
const html = toText(page.body);
ok(html.includes('data-side-read="buyer"') && html.includes('9 Fake Pier, Miami, FL 33131'), 'a typed buyer address is shown on the Closing tab');
ok(!html.includes('data-side-form="buyer"'), 'a staff member who cannot edit signing still sees the address as text');

console.log(fail ? fail + ' failed' : 'closing typed address passed');
if (fail) process.exit(1);
