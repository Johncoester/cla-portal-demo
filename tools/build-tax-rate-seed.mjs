/* Builds the tax rate sheet seed from the vendored fee snapshot.
 * Rates are copied. Nothing is filled in that the snapshot does not already contain.
 * Run: node tools/build-tax-rate-seed.mjs
 */
import { writeFileSync } from 'node:fs';
import { CLA_FEES_SNAPSHOT as S } from '../js/data/vendor/cla-calculator/fee-snapshot.js';

const STATES = ['MD', 'VA', 'DC', 'FL'];
const STATE_NAME = { MD: 'Maryland', VA: 'Virginia', DC: 'District of Columbia', FL: 'Florida' };

const num = (v) => {
  if (v == null) return null;
  const s = String(v).replace(/[$,%\s]/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const jid = (state, county, city = '') => 'j-' + [state.toLowerCase(), slug(county) || 'state', slug(city)].filter(Boolean).join('-');
const paid = (v) => {
  const p = String(v || '').trim().toLowerCase();
  if (p === 'seller') return 'seller';
  if (p === 'split') return 'split';
  return 'buyer';
};
const txOf = (v) => {
  const t = String(v || '').trim().toLowerCase();
  if (t.startsWith('refi')) return 'refi';
  if (t === 'purchase') return 'purchase';
  if (t === 'financed') return 'financed';
  return 'both';
};
const basisOf = (v, kind) => {
  if (kind === 'recording') return 'flat';
  const b = String(v || '').toLowerCase();
  if (b.startsWith('new')) return 'new_money';
  if (b.startsWith('loan')) return 'loan';
  return 'sale';
};
const unitOf = (v, kind) => {
  if (kind === 'recording') return 'flat';
  const u = String(v || '').toLowerCase().replace(/[\s$,]/g, '');
  if (u === 'per100') return 'per100';
  if (u === 'per500') return 'per500';
  if (u === 'per1000') return 'per1000';
  return 'percent';
};
const methodOf = (v) => (String(v || '').toLowerCase().startsWith('marg') ? 'marginal' : 'whole');
const rowsOf = (tab) => {
  const [h, ...r] = S[tab];
  return r.filter((a) => String(a[0]).trim().toUpperCase() === 'Y').map((a) => Object.fromEntries(h.map((k, i) => [k, a[i] ?? ''])));
};
const placesOf = (countyCell) => {
  const c = String(countyCell || '').trim();
  if (c === '' || c === '*' || c.toLowerCase() === 'all') return [''];
  return c.split(',').map((x) => x.trim()).filter(Boolean);
};

const jurisdictions = new Map();
const lines = [];
const exemptions = [];
const allocations = [];
let n = 0;
const lineId = () => 'l' + (++n);

function jurisdiction(state, county, city = '') {
  const id = jid(state, county, city);
  if (!jurisdictions.has(id)) {
    const name = county ? `${county}, ${STATE_NAME[state] || state}` : (STATE_NAME[state] || state);
    jurisdictions.set(id, { id, state, county, city, name, active: true, notes: county ? '' : 'Statewide rows from the fee sheet. A county uses these plus its own rows.' });
  }
  return jurisdictions.get(id);
}

function addLine(j, line) {
  const id = lineId();
  const row = { id, jurisdictionId: j.id, active: true, notes: '', sort: lines.length + 1, whenKey: '', whenValue: '', replacesName: '', roundThird: false, ...line };
  lines.push(row);
  return row;
}

function addExemption(j, line, ex) {
  if (ex.amount == null && ex.alternateRate == null) return;
  exemptions.push({
    id: 'e' + exemptions.length, jurisdictionId: j.id, rateLineId: line.id, active: true, notes: '',
    maxPrice: null, questionKey: ex.questionKey, code: ex.code, name: ex.name, amount: ex.amount, alternateRate: ex.alternateRate, ...ex
  });
}

function addAllocation(j, alloc) {
  const key = [j.id, alloc.taxName, alloc.document || '', alloc.transaction, alloc.whenKey || ''].join('|');
  if (allocations.some((a) => [a.jurisdictionId, a.taxName, a.document, a.transaction, a.whenKey].join('|') === key)) return;
  allocations.push({
    id: 'a' + allocations.length, jurisdictionId: j.id, document: '', whenKey: '', whenValue: 'yes', lawMandated: false, active: true, notes: '', ...alloc
  });
}

for (const state of STATES) jurisdiction(state, '');

for (const r of rowsOf('Transfer_Taxes').filter((x) => STATES.includes(String(x.State).trim()))) {
  const state = String(r.State).trim();
  const transaction = txOf(r.Transaction);
  const name = String(r['Tax Name']).trim();
  for (const county of placesOf(r['County/City'])) {
    const j = jurisdiction(state, county);
    const line = addLine(j, {
      kind: 'tax', name, document: '', transaction, basis: basisOf(r.Basis, 'tax'),
      rate: num(r.Rate), rateUnit: unitOf(r['Rate Unit'], 'tax'), flatFee: null, pagesIncluded: null, perAdditionalPage: null,
      pageTierFrom: null, pageTierTo: null, bracketFrom: num(r['Bracket From ($)']) || 0, bracketTo: num(r['Bracket To ($)']),
      bracketMethod: methodOf(r['Bracket Method']), paidBy: paid(r['Paid By']),
      roundThird: state === 'VA' && /^local\b.*recordation/i.test(name),
      notes: String(r.Notes || '').trim()
    });
    const occ = num(r['Owner-Occ Exempt ($)']);
    if (occ != null) addExemption(j, line, { code: 'owner_occupied', name: 'Owner-occupied exemption', amount: occ, alternateRate: null, questionKey: 'owner_occupied' });
    const fthbRate = num(r['FTHB Rate']);
    const fthbAmt = num(r['FTHB Exempt ($)']);
    const fthbMax = num(r['FTHB Max Price ($)']);
    if (fthbRate != null || fthbAmt != null) {
      addExemption(j, line, {
        code: 'first_time_buyer', name: 'First-time homebuyer exemption', amount: fthbAmt, alternateRate: fthbRate, maxPrice: fthbMax, questionKey: 'first_time_buyer'
      });
    }
    addAllocation(j, { taxName: name, document: '', transaction, paidBy: paid(r['Paid By']), whenKey: '', lawMandated: false });
    const fthbPaid = String(r['FTHB Paid By'] || '').trim();
    if (fthbPaid) {
      addAllocation(j, {
        taxName: name, document: '', transaction, paidBy: paid(fthbPaid), whenKey: 'first_time_buyer', whenValue: 'yes',
        lawMandated: state === 'MD' && name === 'State transfer tax',
        notes: state === 'MD' && name === 'State transfer tax' ? 'Tax-Property 13-203. The seller pays. The contract cannot move this line.' : 'The rate sheet\'s first-time buyer payer. Staff can change it on the file unless the law locks it.'
      });
    }
  }
}

for (const r of rowsOf('Recording_Fees').filter((x) => STATES.includes(String(x.State).trim()))) {
  const state = String(r.State).trim();
  const name = String(r['Fee Name']).trim();
  const document = String(r.Document || '').trim();
  for (const county of placesOf(r['County/City'])) {
    const j = jurisdiction(state, county);
    const line = addLine(j, {
      kind: 'recording', name, document, transaction: txOf(r.Transaction), basis: 'flat',
      rate: null, rateUnit: 'flat', flatFee: num(r['Flat Fee ($)']), pagesIncluded: num(r['Pages Included']),
      perAdditionalPage: num(r["Per Add'l Page ($)"]), pageTierFrom: num(r['Page Tier From']), pageTierTo: num(r['Page Tier To']),
      bracketFrom: 0, bracketTo: null, bracketMethod: 'whole', paidBy: paid(r['Paid By']),
      notes: String(r.Notes || '').trim()
    });
    addAllocation(j, { taxName: name, document, transaction: line.transaction, paidBy: line.paidBy, whenKey: '' });
  }
}

/* $115 is in the calculator (calc-core.js MD_BIG_INSTR), not a separate sheet row. It replaces the $60 deed-of-trust fee. */
const md = jurisdiction('MD', '');
const big = addLine(md, {
  kind: 'recording', name: 'Recording fee (not a principal residence)', document: 'Deed of Trust', transaction: 'both', basis: 'flat',
  rate: null, rateUnit: 'flat', flatFee: 115, pagesIncluded: null, perAdditionalPage: null, pageTierFrom: null, pageTierTo: null,
  bracketFrom: 0, bracketTo: null, bracketMethod: 'whole', paidBy: 'buyer',
  whenKey: 'primary_residence', whenValue: 'no', replacesName: 'Recording fee (incl. $40 surcharge)',
  notes: 'From the calculator, Maryland RP 3-601: a deed of trust that is not a principal residence records for $115 instead of $60.'
});
addAllocation(md, { taxName: big.name, document: 'Deed of Trust', transaction: 'both', paidBy: 'buyer', whenKey: 'primary_residence', whenValue: 'no' });

const questions = [];
let qn = 0;
function addQuestion(j, q) {
  if (questions.some((x) => x.jurisdictionId === j.id && x.key === q.key)) return;
  questions.push({
    id: 'q' + (++qn), jurisdictionId: j.id, active: true, help: '', choices: [], scope: 'file', transaction: 'both', sort: questions.length + 1, ...q
  });
}

const payerChoices = [
  { value: '', label: 'Use the rate sheet' },
  { value: 'buyer', label: 'Buyer pays' },
  { value: 'seller', label: 'Seller pays' },
  { value: 'split', label: '50/50 split' }
];

for (const state of STATES) {
  const j = jurisdiction(state, '');
  addQuestion(j, {
    key: 'contract_payer', label: 'Who pays the transfer and recordation taxes under the contract?',
    help: 'Starts from the rate sheet. You can change it on the file after you calculate, unless the law fixes that line.',
    inputType: 'choice', choices: payerChoices, scope: 'file', transaction: 'purchase', sort: 90
  });
}
addQuestion(jurisdiction('MD', ''), {
  key: 'primary_residence', label: 'Will this be the buyer\'s primary residence?',
  help: 'A Maryland deed of trust that is not a principal residence records at the higher fee.',
  inputType: 'yes_no', scope: 'both_docs', transaction: 'both', sort: 10
});
addQuestion(jurisdiction('MD', ''), {
  key: 'first_time_buyer', label: 'Does the buyer qualify for the first-time homebuyer exemption?',
  help: 'The buyer has to live in the home. Maryland state transfer tax is then paid by the seller, and that line stays locked.',
  inputType: 'yes_no', scope: 'deed', transaction: 'purchase', sort: 20
});
addQuestion(jurisdiction('DC', 'District of Columbia'), {
  key: 'primary_residence', label: 'Will this be the buyer\'s primary residence?',
  help: 'First-time buyer treatment in the District needs the buyer to live in the home.',
  inputType: 'yes_no', scope: 'both_docs', transaction: 'both', sort: 10
});
addQuestion(jurisdiction('DC', 'District of Columbia'), {
  key: 'first_time_buyer', label: 'Does the buyer qualify for the first-time homebuyer exemption?',
  help: 'The lower recordation rate on the sheet applies only up to the price the sheet names, and the buyer must live in the home.',
  inputType: 'yes_no', scope: 'deed', transaction: 'purchase', sort: 20
});
addQuestion(jurisdiction('VA', ''), {
  key: 'assessed', label: 'Assessed value, if it is higher than the price',
  help: 'Virginia deed taxes use the price or the assessed value, whichever is higher.',
  inputType: 'money', scope: 'file', transaction: 'purchase', sort: 30
});

const occPlaces = new Set(exemptions.filter((e) => e.code === 'owner_occupied').map((e) => e.jurisdictionId));
for (const id of occPlaces) {
  const j = jurisdictions.get(id);
  const amounts = [...new Set(exemptions.filter((e) => e.jurisdictionId === id && e.code === 'owner_occupied' && e.amount != null).map((e) => e.amount))];
  const shown = amounts.map((a) => '$' + a.toLocaleString('en-US')).join(' or ');
  addQuestion(j, {
    key: 'owner_occupied', label: 'Does the buyer qualify for the owner-occupied exemption?',
    help: shown ? `The rate sheet takes ${shown} off the brackets that list this exemption, before the tax is split.` : 'This county\'s rate sheet has an owner-occupied exemption.',
    inputType: 'yes_no', scope: 'file', transaction: 'purchase', sort: 15
  });
}

const baltimore = jurisdiction('MD', 'Baltimore City');
addQuestion(baltimore, {
  key: 'mortgage_concurrent', label: 'Is the mortgage being recorded at the same time as the deed?',
  help: 'No separate rate is on the sheet for recording them together. Answering Yes does not change the fee.',
  inputType: 'yes_no', scope: 'file', transaction: 'purchase', sort: 40
});
addQuestion(baltimore, {
  key: 'other_exemption', label: 'Do any other statutory exemptions apply?',
  help: 'No amount is set for other exemptions. Answering Yes does not reduce the tax until an Admin sets the amount.',
  inputType: 'yes_no', scope: 'file', transaction: 'both', sort: 50
});

const unset = [];
const mdCounties = [...jurisdictions.values()].filter((j) => j.state === 'MD' && j.county);
for (const j of mdCounties) {
  const own = lines.filter((l) => l.jurisdictionId === j.id && l.kind === 'tax');
  if (!own.some((l) => l.name === 'County transfer tax')) unset.push({ place: j.name, item: 'County transfer tax', reason: 'No county transfer tax row in the fee sheet. No amount was invented.' });
}
unset.push(
  { place: 'Baltimore City, Maryland', item: 'Mortgage recorded at the same time as the deed', reason: 'The question is shown. The fee sheet has no dollar rate for it.' },
  { place: 'Baltimore City, Maryland', item: 'Other statutory exemption', reason: 'The question is shown. The fee sheet has no dollar amount for it.' }
);

const seed = {
  source: 'Vendored CLA fee snapshot (js/data/vendor/cla-calculator/fee-snapshot.js) plus the $115 Maryland deed-of-trust fee in calc-core.js. No rate was invented.',
  jurisdictions: [...jurisdictions.values()],
  lines, exemptions, questions, allocations, unset
};

const js = `/* Generated by tools/build-tax-rate-seed.mjs from the vendored fee snapshot. Do not edit by hand. */
export const TAX_RATE_SEED = ${JSON.stringify(seed)};
`;
writeFileSync(new URL('../js/data/tax-rate-seed.js', import.meta.url), js);

const sqlStr = (v) => (v == null ? 'null' : "'" + String(v).replace(/'/g, "''") + "'");
const sqlNum = (v) => (v == null || v === '' ? 'null' : String(v));
const sqlBool = (v) => (v ? 'true' : 'false');
const sqlJson = (v) => sqlStr(JSON.stringify(v || []));

let sql = '';
sql += `-- FF-091c (Francis Santos, Nov 17 2026, 3:55 PM ET, message 1a1eb4b8017fcabf).\n`;
sql += `-- Tax rate sheets: one place for each state, county, and city, with its rates, exemptions,\n`;
sql += `-- questions, and the default buyer / seller split. A blank rate stays blank (the screen says Rate Not Set).\n`;
sql += `-- Staff can read. Only an Admin or Super admin can change a row. Row security enforces that.\n`;
sql += `-- NOT APPLIED by this change. Apply by hand on TEST when ready. Never on production.\n`;
sql += `-- Rollback: supabase/rollbacks/20261125170000_tax_rate_sheets.sql\n`;
sql += `begin;\nset local lock_timeout = '3s';\n`;
sql += `do $drift$\nbegin\n`;
sql += `  if to_regclass('public.tax_jurisdictions') is not null then raise exception 'drift: tax_jurisdictions already exists'; end if;\n`;
sql += `  if to_regprocedure('private.is_staffish()') is null then raise exception 'drift: private.is_staffish() is missing'; end if;\n`;
sql += `  if to_regprocedure('private.is_admin()') is null then raise exception 'drift: private.is_admin() is missing'; end if;\n`;
sql += `end $drift$;\n\n`;
sql += `create table public.tax_jurisdictions (\n`;
sql += `  id uuid primary key default gen_random_uuid(),\n`;
sql += `  state text not null,\n`;
sql += `  county text not null default '',\n`;
sql += `  city text not null default '',\n`;
sql += `  name text not null,\n`;
sql += `  active boolean not null default true,\n`;
sql += `  notes text not null default '',\n`;
sql += `  updated_at timestamptz,\n`;
sql += `  constraint tax_jurisdictions_state_chk check (state ~ '^[A-Z]{2}$'),\n`;
sql += `  constraint tax_jurisdictions_place_uniq unique (state, county, city)\n);\n`;
sql += `comment on table public.tax_jurisdictions is 'FF-091c: a state, a county, or a city that has its own tax rate sheet. Empty county and city means the whole state.';\n\n`;
sql += `create table public.tax_rate_lines (\n`;
sql += `  id uuid primary key default gen_random_uuid(),\n`;
sql += `  jurisdiction_id uuid not null references public.tax_jurisdictions (id) on delete cascade,\n`;
sql += `  kind text not null,\n`;
sql += `  name text not null,\n`;
sql += `  document text not null default '',\n`;
sql += `  transaction text not null default 'both',\n`;
sql += `  basis text not null default 'sale',\n`;
sql += `  rate numeric(14,6),\n`;
sql += `  rate_unit text not null default 'percent',\n`;
sql += `  flat_fee numeric(14,2),\n`;
sql += `  pages_included integer,\n`;
sql += `  per_additional_page numeric(14,2),\n`;
sql += `  page_tier_from integer,\n`;
sql += `  page_tier_to integer,\n`;
sql += `  bracket_from numeric(14,2) not null default 0,\n`;
sql += `  bracket_to numeric(14,2),\n`;
sql += `  bracket_method text not null default 'whole',\n`;
sql += `  paid_by text not null default 'buyer',\n`;
sql += `  round_third boolean not null default false,\n`;
sql += `  when_key text not null default '',\n`;
sql += `  when_value text not null default '',\n`;
sql += `  replaces_name text not null default '',\n`;
sql += `  sort_order integer not null default 0,\n`;
sql += `  active boolean not null default true,\n`;
sql += `  notes text not null default '',\n`;
sql += `  updated_at timestamptz,\n`;
sql += `  constraint tax_rate_lines_kind_chk check (kind in ('tax', 'recording')),\n`;
sql += `  constraint tax_rate_lines_paid_chk check (paid_by in ('buyer', 'seller', 'split')),\n`;
sql += `  constraint tax_rate_lines_method_chk check (bracket_method in ('whole', 'marginal')),\n`;
sql += `  constraint tax_rate_lines_tx_chk check (transaction in ('purchase', 'refi', 'both', 'financed')),\n`;
sql += `  constraint tax_rate_lines_basis_chk check (basis in ('sale', 'loan', 'new_money', 'flat')),\n`;
sql += `  constraint tax_rate_lines_rate_chk check (rate is null or rate >= 0),\n`;
sql += `  constraint tax_rate_lines_flat_chk check (flat_fee is null or flat_fee >= 0)\n);\n`;
sql += `comment on column public.tax_rate_lines.rate is 'Blank means Rate Not Set. Do not guess a number.';\n`;
sql += `comment on column public.tax_rate_lines.flat_fee is 'Blank means Rate Not Set for a recording fee. Zero is a real zero.';\n`;
sql += `create index tax_rate_lines_place on public.tax_rate_lines (jurisdiction_id);\n\n`;
sql += `create table public.tax_exemptions (\n`;
sql += `  id uuid primary key default gen_random_uuid(),\n`;
sql += `  jurisdiction_id uuid not null references public.tax_jurisdictions (id) on delete cascade,\n`;
sql += `  rate_line_id uuid references public.tax_rate_lines (id) on delete cascade,\n`;
sql += `  code text not null,\n`;
sql += `  name text not null,\n`;
sql += `  exempt_amount numeric(14,2),\n`;
sql += `  alternate_rate numeric(14,6),\n`;
sql += `  max_price numeric(14,2),\n`;
sql += `  question_key text not null default '',\n`;
sql += `  active boolean not null default true,\n`;
sql += `  notes text not null default '',\n`;
sql += `  updated_at timestamptz,\n`;
sql += `  constraint tax_exemptions_amount_chk check (exempt_amount is null or exempt_amount >= 0),\n`;
sql += `  constraint tax_exemptions_rate_chk check (alternate_rate is null or alternate_rate >= 0)\n);\n`;
sql += `comment on column public.tax_exemptions.exempt_amount is 'Blank means the exemption amount is not set.';\n`;
sql += `create index tax_exemptions_line on public.tax_exemptions (rate_line_id);\n\n`;
sql += `create table public.tax_questions (\n`;
sql += `  id uuid primary key default gen_random_uuid(),\n`;
sql += `  jurisdiction_id uuid not null references public.tax_jurisdictions (id) on delete cascade,\n`;
sql += `  question_key text not null,\n`;
sql += `  label text not null,\n`;
sql += `  help text not null default '',\n`;
sql += `  input_type text not null default 'yes_no',\n`;
sql += `  choices jsonb not null default '[]'::jsonb,\n`;
sql += `  scope text not null default 'file',\n`;
sql += `  transaction text not null default 'both',\n`;
sql += `  sort_order integer not null default 0,\n`;
sql += `  active boolean not null default true,\n`;
sql += `  updated_at timestamptz,\n`;
sql += `  constraint tax_questions_type_chk check (input_type in ('yes_no', 'money', 'number', 'choice')),\n`;
sql += `  constraint tax_questions_scope_chk check (scope in ('file', 'deed', 'deed_of_trust', 'both_docs')),\n`;
sql += `  constraint tax_questions_tx_chk check (transaction in ('purchase', 'refi', 'both')),\n`;
sql += `  constraint tax_questions_key_uniq unique (jurisdiction_id, question_key)\n);\n\n`;
sql += `create table public.tax_allocations (\n`;
sql += `  id uuid primary key default gen_random_uuid(),\n`;
sql += `  jurisdiction_id uuid not null references public.tax_jurisdictions (id) on delete cascade,\n`;
sql += `  tax_name text not null,\n`;
sql += `  document text not null default '',\n`;
sql += `  transaction text not null default 'purchase',\n`;
sql += `  default_paid_by text not null,\n`;
sql += `  law_mandated boolean not null default false,\n`;
sql += `  when_key text not null default '',\n`;
sql += `  when_value text not null default 'yes',\n`;
sql += `  active boolean not null default true,\n`;
sql += `  notes text not null default '',\n`;
sql += `  updated_at timestamptz,\n`;
sql += `  constraint tax_allocations_paid_chk check (default_paid_by in ('buyer', 'seller', 'split')),\n`;
sql += `  constraint tax_allocations_uniq unique (jurisdiction_id, tax_name, document, transaction, when_key)\n);\n`;
sql += `comment on column public.tax_allocations.law_mandated is 'When true, staff cannot move this line off the default payer. The law fixes the split.';\n\n`;

sql += `insert into public.tax_jurisdictions (state, county, city, name, notes) values\n`;
sql += seed.jurisdictions.map((j) => `  (${sqlStr(j.state)}, ${sqlStr(j.county)}, ${sqlStr(j.city)}, ${sqlStr(j.name)}, ${sqlStr(j.notes)})`).join(',\n') + ';\n\n';

const jRef = (id) => {
  const j = jurisdictions.get(id);
  return `(select id from public.tax_jurisdictions where state = ${sqlStr(j.state)} and county = ${sqlStr(j.county)} and city = ${sqlStr(j.city)})`;
};

sql += `insert into public.tax_rate_lines (jurisdiction_id, kind, name, document, transaction, basis, rate, rate_unit, flat_fee, pages_included, per_additional_page, page_tier_from, page_tier_to, bracket_from, bracket_to, bracket_method, paid_by, round_third, when_key, when_value, replaces_name, sort_order, notes) values\n`;
sql += lines.map((l) => `  (${jRef(l.jurisdictionId)}, ${sqlStr(l.kind)}, ${sqlStr(l.name)}, ${sqlStr(l.document)}, ${sqlStr(l.transaction)}, ${sqlStr(l.basis)}, ${sqlNum(l.rate)}, ${sqlStr(l.rateUnit)}, ${sqlNum(l.flatFee)}, ${sqlNum(l.pagesIncluded)}, ${sqlNum(l.perAdditionalPage)}, ${sqlNum(l.pageTierFrom)}, ${sqlNum(l.pageTierTo)}, ${sqlNum(l.bracketFrom)}, ${sqlNum(l.bracketTo)}, ${sqlStr(l.bracketMethod)}, ${sqlStr(l.paidBy)}, ${sqlBool(l.roundThird)}, ${sqlStr(l.whenKey)}, ${sqlStr(l.whenValue)}, ${sqlStr(l.replacesName)}, ${l.sort}, ${sqlStr(l.notes)})`).join(',\n') + ';\n\n';

if (exemptions.length) {
  sql += `insert into public.tax_exemptions (jurisdiction_id, rate_line_id, code, name, exempt_amount, alternate_rate, max_price, question_key, notes)\n`;
  sql += exemptions.map((e) => {
    const line = lines.find((l) => l.id === e.rateLineId);
    const j = jurisdictions.get(e.jurisdictionId);
    const linePick = `(select l.id from public.tax_rate_lines l join public.tax_jurisdictions j on j.id = l.jurisdiction_id where j.state = ${sqlStr(j.state)} and j.county = ${sqlStr(j.county)} and j.city = ${sqlStr(j.city)} and l.kind = ${sqlStr(line.kind)} and l.name = ${sqlStr(line.name)} and l.document = ${sqlStr(line.document)} and l.transaction = ${sqlStr(line.transaction)} and l.basis = ${sqlStr(line.basis)} and l.bracket_from = ${sqlNum(line.bracketFrom)} and l.when_key = ${sqlStr(line.whenKey)} and l.page_tier_from is not distinct from ${sqlNum(line.pageTierFrom)} limit 1)`;
    return `select ${jRef(e.jurisdictionId)}, ${linePick}, ${sqlStr(e.code)}, ${sqlStr(e.name)}, ${sqlNum(e.amount)}::numeric, ${sqlNum(e.alternateRate)}::numeric, ${sqlNum(e.maxPrice)}::numeric, ${sqlStr(e.questionKey)}, ${sqlStr(e.notes)}`;
  }).join('\nunion all\n') + ';\n\n';
}

sql += `insert into public.tax_questions (jurisdiction_id, question_key, label, help, input_type, choices, scope, transaction, sort_order) values\n`;
sql += questions.map((q) => `  (${jRef(q.jurisdictionId)}, ${sqlStr(q.key)}, ${sqlStr(q.label)}, ${sqlStr(q.help)}, ${sqlStr(q.inputType)}, ${sqlJson(q.choices)}::jsonb, ${sqlStr(q.scope)}, ${sqlStr(q.transaction)}, ${q.sort})`).join(',\n') + ';\n\n';

sql += `insert into public.tax_allocations (jurisdiction_id, tax_name, document, transaction, default_paid_by, law_mandated, when_key, when_value, notes) values\n`;
sql += allocations.map((a) => `  (${jRef(a.jurisdictionId)}, ${sqlStr(a.taxName)}, ${sqlStr(a.document)}, ${sqlStr(a.transaction)}, ${sqlStr(a.paidBy)}, ${sqlBool(a.lawMandated)}, ${sqlStr(a.whenKey)}, ${sqlStr(a.whenValue)}, ${sqlStr(a.notes)})`).join(',\n') + ';\n\n';

sql += `alter table public.tax_jurisdictions enable row level security;\n`;
sql += `alter table public.tax_rate_lines enable row level security;\n`;
sql += `alter table public.tax_exemptions enable row level security;\n`;
sql += `alter table public.tax_questions enable row level security;\n`;
sql += `alter table public.tax_allocations enable row level security;\n`;
for (const table of ['tax_jurisdictions', 'tax_rate_lines', 'tax_exemptions', 'tax_questions', 'tax_allocations']) {
  sql += `create policy ${table}_staff_read on public.${table} for select to authenticated using ((select private.is_staffish()));\n`;
  sql += `create policy ${table}_admin_write on public.${table} for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));\n`;
}
sql += `revoke all on public.tax_jurisdictions, public.tax_rate_lines, public.tax_exemptions, public.tax_questions, public.tax_allocations from public, anon, authenticated;\n`;
sql += `grant select, insert, update, delete on public.tax_jurisdictions, public.tax_rate_lines, public.tax_exemptions, public.tax_questions, public.tax_allocations to authenticated;\n\n`;

sql += `do $readback$\ndeclare n int; r numeric; locked boolean;\nbegin\n`;
sql += `  select count(*) into n from public.tax_jurisdictions where state in ('MD', 'VA', 'DC', 'FL');\n`;
sql += `  if n < 4 then raise exception 'readback: expected the four states, found %', n; end if;\n`;
sql += `  select l.rate into r from public.tax_rate_lines l join public.tax_jurisdictions j on j.id = l.jurisdiction_id\n`;
sql += `    where j.state = 'MD' and j.county = 'Baltimore City' and l.name = 'County transfer tax' and l.bracket_from = 0;\n`;
sql += `  if r is distinct from 1.5 then raise exception 'readback: Baltimore City transfer rate is %, expected 1.5', r; end if;\n`;
sql += `  select a.law_mandated into locked from public.tax_allocations a join public.tax_jurisdictions j on j.id = a.jurisdiction_id\n`;
sql += `    where j.state = 'MD' and j.county = '' and a.tax_name = 'State transfer tax' and a.when_key = 'first_time_buyer';\n`;
sql += `  if locked is distinct from true then raise exception 'readback: Maryland state transfer tax for a first-time buyer is not locked'; end if;\n`;
sql += `  if exists (select 1 from public.tax_rate_lines l join public.tax_jurisdictions j on j.id = l.jurisdiction_id where j.county = 'Calvert' and l.name = 'County transfer tax') then\n`;
sql += `    raise exception 'readback: Calvert county transfer tax was invented'; end if;\n`;
sql += `  if not (select relrowsecurity from pg_class where oid = 'public.tax_rate_lines'::regclass) then raise exception 'readback: tax rate RLS is off'; end if;\n`;
sql += `end $readback$;\ncommit;\n`;

writeFileSync(new URL('../supabase/migrations/20261125170000_tax_rate_sheets.sql', import.meta.url), sql);

const rollback = `-- Rolls back 20261125170000_tax_rate_sheets.sql. Drops the tax rate sheet tables. Does not touch orders or fees.\nbegin;\nset local lock_timeout = '3s';\ndrop table if exists public.tax_allocations;\ndrop table if exists public.tax_questions;\ndrop table if exists public.tax_exemptions;\ndrop table if exists public.tax_rate_lines;\ndrop table if exists public.tax_jurisdictions;\ncommit;\n`;
writeFileSync(new URL('../supabase/rollbacks/20261125170000_tax_rate_sheets.sql', import.meta.url), rollback);

console.log('jurisdictions', seed.jurisdictions.length);
console.log('lines', lines.length, 'exemptions', exemptions.length, 'questions', questions.length, 'allocations', allocations.length);
console.log('unset');
for (const u of unset) console.log(' -', u.place + ':', u.item);
