/* WHERE EACH BUYER / SELLER WILL BE AT CLOSING (John, Nov 4 2026): "sometimes sellers are selling a property, but they're living in a different
 * country. Well, we need to know that, cause then we need to either set up a RON closing for a seller, a buyer needs to go to the embassy."
 * Each Client-Buyer / Client-Seller answers "Will you be in <property state> at the time of closing?"; No -> another US state or a country outside
 * the US. CLA staff see a flag and set a per-party signing method (staff only). Mirrored by public.closing_party_locations (migration 58).
 * Pure rules shared by the mock adapter, the Supabase adapter and the pages. FAKE data only. */
import { US_STATE_NAMES, runsOrders } from './constants.js?v=202611042154';
export const SIGNING_METHODS = [['in_person_office', 'In person at office'], ['mobile_notary', 'Mobile/in-state notary'], ['out_of_state_notary', 'Out-of-state notary'],
  ['ron', 'RON (remote online notarization)'], ['embassy', 'Embassy/consulate'], ['undecided', 'Undecided']];
export const SIGNING_CODES = SIGNING_METHODS.map(([c]) => c);
export const signingLabel = (c) => (SIGNING_METHODS.find(([k]) => k === c) || [, 'Undecided'])[1];
export const CLIENT_PARTY_ROLES = ['Client-Buyer', 'Client-Seller'];
// ISO 3166-1 alpha-2 (officially assigned codes), US left out: "outside the US" means another country
export const COUNTRY_CODES = ('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ '
  + 'DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR '
  + 'KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA '
  + 'RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' ');
let dn = null; try { dn = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { dn = null; }
export const countryName = (c) => { if (!c) return ''; try { return (dn && dn.of(c)) || c; } catch { return c; } };
export const COUNTRIES = COUNTRY_CODES.map((c) => [c, countryName(c)]).sort((a, b) => a[1].localeCompare(b[1]));
export const stateName = (c) => (US_STATE_NAMES.find(([k]) => k === c) || [, c || ''])[1];
export const sideWord = (role) => (role === 'Client-Seller' ? 'Seller' : 'Buyer');
// staff who EDIT every party's answer and set the signing method: Processor, Transaction Coordinator, Admin, Super admin (John, Nov 4). Other CLA staff read.
export const canManageClosingLocations = (u) => !!u && !u.accountRole && (runsOrders(u) || u.role === 'Transaction Coordinator');
// John, Nov 4: who may use "Schedule the closing" (pick time / place and confirm): Processor, TC, Admins, and the Buyer Agent / Listing Agent on the file
export const SCHEDULER_AGENT_ROLES = ['Buyer Agent', 'Listing Agent'];
export const canScheduleClosing = (u) => !!u && ((!u.accountRole && (runsOrders(u) || u.role === 'Transaction Coordinator')) || (u.roles || [u.role]).some((r) => SCHEDULER_AGENT_ROLES.includes(r)));
// reminder text (bell + queued outbox email; nothing is sent)
export const reminderTitle = (deal) => `Please tell us where you will be at closing for ${deal.street || 'your order'}`;

// clean an answer: { inState: 'yes'|'no'|true|false, where: 'state'|'country', state, country } -> typed columns. Throws with a plain message.
export function cleanLocationAnswer(input = {}, propertyState = '') {
  const yn = input.inState === true || input.inState === 'yes' ? true : input.inState === false || input.inState === 'no' ? false : null;
  if (yn === null) throw new Error(`Answer Yes or No: will you be in ${stateName(propertyState) || 'the property\'s state'} at the time of closing?`);
  if (yn) return { inStateAtClosing: true, closingLocationState: null, closingLocationCountry: null };
  const st = String(input.state || '').trim().toUpperCase(); const co = String(input.country || '').trim().toUpperCase();
  const where = input.where || (co && !st ? 'country' : 'state');
  if (where === 'country') {
    if (!COUNTRY_CODES.includes(co)) throw new Error('Pick the country you will be in (outside the US).');
    return { inStateAtClosing: false, closingLocationState: null, closingLocationCountry: co }; }
  if (!US_STATE_NAMES.some(([k]) => k === st)) throw new Error('Pick the US state you will be in.');
  if (st === propertyState) throw new Error(`${stateName(st)} is the property's state: answer Yes instead.`);
  return { inStateAtClosing: false, closingLocationState: st, closingLocationCountry: null };
}
export const whereText = (r, propertyState) => (r.inStateAtClosing == null ? 'Not answered yet' : r.inStateAtClosing ? `In ${stateName(propertyState)} (the property's state)`
  : r.closingLocationCountry ? `Outside the US: ${countryName(r.closingLocationCountry)}` : `Another state: ${stateName(r.closingLocationState)}`);
// the staff flag for a party who will not be in the property's state at closing (null when no flag)
export function locationFlag(r) {
  if (r.inStateAtClosing !== false) return null; const who = `${sideWord(r.partyRole)}${r.name ? ` ${r.name}` : ''}`;
  if (r.closingLocationCountry) return { level: 'abroad', text: `${who} will be in ${countryName(r.closingLocationCountry)} at closing - may need RON or embassy signing` };
  return { level: 'out_of_state', text: `${who} will be in ${stateName(r.closingLocationState)} at closing - may need an out-of-state notary or RON` };
}
