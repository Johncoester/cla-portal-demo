/* FF-063 #3 (Janine's video, Nov 12 "CLA Portal Test - Processor and Seller Screens"; Francis confirm-back Nov 12 6:14 PM ET):
   when Mobile notary is chosen, the processor can type the complete signing address (street, city, state, ZIP). */
import { readFileSync } from 'node:fs';
import { scheduledPlace, MOBILE_NOTARY, TYPED_ADDRESS, cleanManualAddress } from '../js/data/closing-side.js';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const deal = { closingManualStreet: '6231 Yellowstone Drive', closingManualCity: 'Alexandria', closingManualState: 'VA', closingManualZip: '22312' };
ok(scheduledPlace({ location: MOBILE_NOTARY }, deal) === 'Mobile notary at 6231 Yellowstone Drive, Alexandria, VA 22312', 'a mobile notary closing shows the typed signing address');
ok(scheduledPlace({ location: MOBILE_NOTARY }, {}) === '', 'a mobile notary closing with no address falls back to the plain "Mobile notary" text');
ok(scheduledPlace({ location: TYPED_ADDRESS }, deal) === '6231 Yellowstone Drive, Alexandria, VA 22312', 'a typed office address still shows as before');
ok(scheduledPlace({ location: 'CLA Title office' }, deal) === '', 'an office closing is unchanged');
let err = ''; try { cleanManualAddress({ street: '1 Main St', city: '', state: 'VA', zip: '22312' }, { required: true }); } catch (e) { err = e.message; }
ok(err === 'Enter the street, city, state, and ZIP.', 'a partial notary address is refused with the FF-025 message');
const page = readFileSync(new URL('../js/pages/dealclosing.js', import.meta.url), 'utf8');
ok(page.includes('async function whenModal(title, save, { notaryAddress = false } = {}) {') && page.includes("toast('Closing scheduled. Everyone on the file can see it.'); }, { notaryAddress: true })"), 'only the processor\'s Schedule / Change the scheduled closing screen asks for the notary address');
ok(page.includes('data-notary-place hidden') && page.includes('if (notary) notary.hidden = f.location.value !== MOBILE_NOTARY;'), 'the address fields appear only when Mobile notary is picked');
ok(page.includes("if (notary && v.location === MOBILE_NOTARY) { const addr = cleanManualAddress({ street: v.nstreet, city: v.ncity, state: v.nstate, zip: v.nzip }, { required: true });"), 'the address is required and checked before saving');
const ad = readFileSync(new URL('../js/data/supabase-adapter.js', import.meta.url), 'utf8');
ok(ad.includes("const typed = (location === 'Typed address' || location === 'Mobile notary') && closingManualStreet;"), 'the address is saved on the file the same way as a typed address');
console.log(fail ? `FAIL ${fail}` : 'all mobile notary address checks passed');
process.exit(fail ? 1 : 0);
