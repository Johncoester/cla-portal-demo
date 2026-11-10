/* Matt: a closing-date request defaults to the closest CLA Title office, and the processor sees each side's location and date/time.
 * Offices are the public list on https://clatitle.com/locations/ . Distance uses a latitude/longitude, else the Census ZIP center.
 * The SQL migration is present and unapplied. */
import { readFileSync } from 'node:fs';
import { nearestOffice, SAMPLE_OFFICES, geoPoint, cleanOffice, milesBetween } from '../js/data/offices.js';
import { zipCentroid, zipCentroidCount, SOURCE } from '../js/data/zip-centroids.js';
import { createMockAdapter, STORAGE_KEY } from '../js/data/mock-adapter.js';
import { toText } from '../js/ui.js';
import { render as closingRender } from '../js/pages/dealclosing.js';
import { render as scheduleRender } from '../js/pages/schedule.js';

globalThis.location = { origin: 'https://test.example', pathname: '/portal/', reload() {} };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const bare = SAMPLE_OFFICES.map((o) => ({ ...o, latitude: null, longitude: null, zip: '' }));

const rock = zipCentroid('20850');
ok(SOURCE.includes('Census') && zipCentroidCount() > 30000 && rock && Math.abs(rock.latitude - 39.0892) < 0.001, 'ZIP centers come from the Census gazetteer');
ok(geoPoint({ zip: '20850-1234' }).source === 'zip' && geoPoint({ latitude: 1, longitude: 2, zip: '20850' }).source === 'latlong', 'an explicit point wins over the ZIP center');

const md = nearestOffice({ state: 'MD', county: 'Anne Arundel', zip: '20850' }, SAMPLE_OFFICES);
ok(md.officeId === 'off-rockville' && md.reason === 'distance', 'an MD property (ZIP 20850) matches Rockville');
const va = nearestOffice({ state: 'VA', zip: '22201' }, SAMPLE_OFFICES);
ok(va.officeId === 'off-arlington-courthouse' && va.reason === 'distance', 'a VA property (ZIP 22201) matches Arlington Courthouse');
const dc = nearestOffice({ state: 'DC', zip: '20036' }, SAMPLE_OFFICES);
ok(dc.officeId === 'off-dc-closing' && dc.reason === 'distance', 'a DC property (ZIP 20036) matches DC Closing');
const flProp = nearestOffice({ state: 'FL', zip: '33131' }, SAMPLE_OFFICES);
ok(flProp.officeId === 'off-miami' && flProp.reason === 'distance', 'an FL property (ZIP 33131) matches Miami');
const byPoint = nearestOffice({ state: 'MD', county: 'Montgomery', zip: '20850', latitude: 26.138072, longitude: -80.113710 }, SAMPLE_OFFICES);
ok(byPoint.officeId === 'off-fort-lauderdale' && byPoint.reason === 'distance' && byPoint.miles < 1, 'a latitude/longitude at Fort Lauderdale beats the Rockville ZIP');
const byState = nearestOffice({ state: 'VA' }, bare);
ok(byState.officeId === 'off-arlington-courthouse' && byState.reason === 'state', 'with no point, an office in the same state is the default');
const byMain = nearestOffice({ state: 'TX' }, bare);
ok(byMain.officeId === 'off-rockville' && byMain.reason === 'main', 'with no point and no office in that state, the main office is the default');
const retired = nearestOffice({ latitude: 26.138072, longitude: -80.113710 }, SAMPLE_OFFICES.map((o) => ({ ...o, active: o.id !== 'off-fort-lauderdale' })));
ok(retired.officeId !== 'off-fort-lauderdale' && retired.reason === 'distance', 'a retired office is not the default even when it is the closest');
const ann = geoPoint(SAMPLE_OFFICES.find((o) => o.id === 'off-annapolis'));
const fl = geoPoint(SAMPLE_OFFICES.find((o) => o.id === 'off-fort-lauderdale'));
ok(milesBetween(ann, fl) > 500, 'straight-line miles separate Annapolis from Fort Lauderdale');
ok(SAMPLE_OFFICES.every((o) => !/\(sample\)/i.test(o.name)) && SAMPLE_OFFICES.filter((o) => o.coordSource === 'zip').map((o) => o.id).sort().join() === 'off-hagerstown,off-venture-x-fairfax', 'verified offices are not marked sample; only the two unmatched addresses use a ZIP center');
let coordErr = '';
try { cleanOffice({ ...SAMPLE_OFFICES[0], counties: SAMPLE_OFFICES[0].counties, latitude: 10, longitude: '' }); } catch (e) { coordErr = e.message; }
ok(/both blank/.test(coordErr), 'an office needs both coordinates or neither');

const storage = mem();
const api = createMockAdapter({ storage, sessionStorage: mem() });
await api.signInDev('u-proc');
const moved = JSON.parse(storage.getItem(STORAGE_KEY));
const deal2 = moved.deals.find((d) => d.id === 'deal-2');
deal2.county = 'Anne Arundel';
deal2.latitude = 26.138072;
deal2.longitude = -80.113710;
storage.setItem(STORAGE_KEY, JSON.stringify(moved));
const api2 = createMockAdapter({ storage, sessionStorage: mem() });
await api2.signInDev('u-proc');
const def = await api2.getClosingOfficeDefault('deal-2');
ok(def.officeId === 'off-fort-lauderdale' && def.reason === 'distance' && def.offices.some((o) => o.id === 'off-annapolis'), 'the file default follows the property point, and staff still get every active office');

const slots = ['2027-06-15T10:00', '2027-06-16T14:30'];
const created = await api2.createSettlementRequest('deal-2', { slots });
ok(created.location === 'CLA Title office' && created.officeId === 'off-fort-lauderdale', 'a request with no location uses the closest office');
const overridden = await api2.createSettlementRequest('deal-4', { slots, location: 'CLA Title office', officeId: 'off-annapolis' });
ok(overridden.officeId === 'off-annapolis', 'staff can change the default office');
let badOffice = '';
try { await api2.createSettlementRequest('deal-5', { slots, location: 'CLA Title office', officeId: 'missing' }); } catch (e) { badOffice = e.message; }
ok(/active CLA Title office/.test(badOffice), 'an unknown office is refused');

const buyerTok = created.tokens.buyer;
const sellerTok = created.tokens.seller;
await api2.respondSettlement(buyerTok, { picks: [0], name: 'Ben Buyer', location: 'CLA Title office', officeId: 'off-rockville' });
await api2.respondSettlement(sellerTok, { picks: [1], name: 'Sally Seller', location: 'Mobile notary', officeId: '' });
const staffRows = await api2.listSettlements('deal-2');
const buyerAns = staffRows[0].responses.find((r) => r.side === 'buyer');
const sellerAns = staffRows[0].responses.find((r) => r.side === 'seller');
ok(buyerAns.officeId === 'off-rockville' && buyerAns.picks[0] === 0 && buyerAns.officeName.includes('Rockville'), 'the buyer answer keeps the office and the time');
ok(sellerAns.location === 'Mobile notary' && sellerAns.officeId == null && sellerAns.picks[0] === 1, 'the seller answer keeps a different location and time');

const session = await api2.getSession();
const deal = await api2.getDeal('deal-2');
const page = await closingRender({ api: api2, user: session, deal, refresh() {} });
const html = toText(page.body);
ok(html.includes('data-side-choice="buyer"') && html.includes('Rockville') && html.includes('data-choice-slot="2027-06-15T10:00"'), 'the processor sees the buyer location and date/time');
ok(html.includes('data-side-choice="seller"') && html.includes('Mobile notary') && html.includes('data-choice-slot="2027-06-16T14:30"'), 'the processor sees the seller location and date/time');
ok(html.includes('data-request-place') && html.includes('Fort Lauderdale'), 'the request itself shows the closest office the processor started from');

await api2.signInDev('u-buyer');
const buyerRows = await api2.listSettlements('deal-2');
ok(buyerRows[0].responses.length === 1 && buyerRows[0].responses[0].side === 'buyer', 'the buyer does not receive the seller answer');
const buyerPage = await closingRender({ api: api2, user: { ...session, role: 'Client-Buyer', isAdmin: false }, deal, refresh() {} });
const buyerHtml = toText(buyerPage.body);
ok(buyerHtml.includes('data-side-choice="buyer"') && !buyerHtml.includes('data-side-choice="seller"') && !buyerHtml.includes('Mobile notary'), 'the buyer page does not show the seller choice');

const link = await scheduleRender({ api: api2, params: { token: sellerTok } });
const linkHtml = toText(link.body);
ok(linkHtml.includes('name="location"') && linkHtml.includes('name="officeId"') && linkHtml.includes('Mobile notary') && linkHtml.includes('data-slot="2027-06-16T14:30"'), 'the scheduling link offers a location and the chosen date and time');

const sql = readFileSync('supabase/migrations/20261110083000_closing_nearest_office.sql', 'utf8');
const back = readFileSync('supabase/rollbacks/20261110083000_closing_nearest_office.sql', 'utf8');
ok(/NOT APPLIED/.test(sql) && /haversine_miles/.test(sql) && /zip_centroids/.test(sql) && /clatitle.com\/locations/.test(sql) && /off-miami/.test(sql), 'the migration is unapplied SQL and seeds the public offices');
ok(/drop table if exists public.zip_centroids/.test(back) && /nearest_cla_office/.test(back) && /drop column if exists latitude/.test(back) && /off-miami/.test(back), 'the rollback restores the old default and drops the offices this migration added');

console.log(fail ? fail + ' failed' : 'closing nearest office passed');
if (fail) process.exit(1);
