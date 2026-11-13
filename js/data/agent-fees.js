/* AGENT FEES (AF-2; John, Nov 12 2026 decisions; spec docs/specs/agent-fees-flow.md). Shared by the mock and Supabase adapters and the
 * Agent fees box on a file's overview. For each agent side (listing agent, buyer's agent): a commission entered as % or $ (always in step
 * with the sales price), an admin fee with who pays it (default buyer on the buyer's agent side, seller on the listing side) and up to 5
 * other fees (description, amount, paid to). The database (save_agent_fees, migration 20261117100000) checks the same rules again. */

export const AGENT_FEE_SIDES = [['listing', 'Listing agent'], ['buyer', "Buyer's agent"]];
export const SIDE_LABEL = Object.fromEntries(AGENT_FEE_SIDES);
export const AGENT_ROLE_SIDE = { 'Listing Agent': 'listing', 'Buyer Agent': 'buyer' };
export const PAYERS = [['buyer', 'Buyer'], ['seller', 'Seller']];
export const PAYER_LABEL = Object.fromEntries(PAYERS);
export const MAX_OTHER_FEES = 5;
export const defaultPayer = (side) => (side === 'buyer' ? 'buyer' : 'seller');

const blank = (v) => v == null || String(v).trim() === '';
const r2 = (n) => Math.round(n * 100) / 100;
const r8 = (n) => Math.round(n * 1e8) / 1e8;

/* A typed number ("1,250.50", "$395", "3%"), or a plain message. */
export function feeNumber(v, label) {
  if (blank(v)) return null;
  const t = String(v).trim().replace(/[$,%\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error(`${label} must be a number.`);
  return Number(t);
}

/* % and $ from the sales price: percent basis -> $ = price x % to the cent; amount basis -> % to 8 places (gives back the same cent). */
export function syncCommission(price, basis, value) {
  const p = Number(price);
  if (!(p > 0)) throw new Error('Add the sales price before entering a commission, so the % and $ stay in step.');
  if (basis === 'percent') {
    const pct = feeNumber(value, 'Commission %');
    if (pct == null || pct > 100) throw new Error('Commission % must be a number from 0 to 100.');
    return { basis, percent: r8(pct), amount: r2((p * r8(pct)) / 100) };
  }
  if (basis === 'amount') {
    const amt = feeNumber(value, 'Commission $');
    if (amt == null) throw new Error('Commission $ must be a dollar amount of 0 or more.');
    if (amt > p) throw new Error("The commission $ can't be more than the sales price.");
    return { basis, percent: r8((r2(amt) * 100) / p), amount: r2(amt) };
  }
  throw new Error('Enter the commission as a % or a $ amount.');
}

const money = (v, label, max = 1000000) => {
  const n = feeNumber(v, label);
  if (n == null || n > max) throw new Error(`${label} must be a dollar amount of 0 or more.`);
  return r2(n);
};
const payerOf = (v, side) => {
  const p = blank(v) ? defaultPayer(side) : String(v).trim().toLowerCase();
  if (!PAYER_LABEL[p]) throw new Error('Paid by must be Buyer or Seller.');
  return p;
};

/* One side's form -> the save payload {commission, admin, other}. Blank commission / admin = none. Throws a plain message. */
export function readAgentFees(input = {}, { side, price } = {}) {
  if (!SIDE_LABEL[side]) throw new Error("Pick the listing agent or buyer's agent side.");
  const out = { commission: null, admin: null, other: [] };
  const basis = input.commissionBasis === 'amount' ? 'amount' : 'percent';
  const typed = basis === 'amount' ? input.commissionAmount : input.commissionPercent;
  if (!blank(typed)) out.commission = { ...syncCommission(price, basis, typed), payer: payerOf(input.commissionPayer, side) };
  if (!blank(input.adminAmount)) out.admin = { amount: money(input.adminAmount, 'Admin fee'), payer: payerOf(input.adminPayer, side) };
  const others = Array.isArray(input.other) ? input.other : [];
  const filled = others.filter((o) => o && !(blank(o.description) && blank(o.amount) && blank(o.paidTo)));
  if (filled.length > MAX_OTHER_FEES) throw new Error('Up to 5 other fees per agent.');
  filled.forEach((o, i) => {
    const n = i + 1; const description = String(o.description || '').trim(); const paidTo = String(o.paidTo || '').trim();
    if (!description) throw new Error(`Other fee ${n}: enter a description.`);
    if (!paidTo) throw new Error(`Other fee ${n}: enter who it is paid to.`);
    if (description.length > 120 || paidTo.length > 120) throw new Error(`Other fee ${n}: keep the description and paid to under 120 characters.`);
    out.other.push({ description, amount: money(o.amount, `Other fee ${n} amount`), paidTo, payer: payerOf(o.payer, side) });
  });
  return out;
}

/* Rows from agent_fees() -> { listing: {commission, admin, other[], canEdit, confirmed}, buyer: {...} } (only the sides the viewer may see). */
export function groupAgentFees(rows = []) {
  const out = {};
  for (const r of rows) {
    const s = out[r.side] || (out[r.side] = { side: r.side, commission: null, admin: null, other: [], canEdit: false, confirmed: null, rows: 0 });
    s.rows += 1; s.canEdit = s.canEdit || !!r.canEdit;
    const fee = { ...r };
    if (r.kind === 'commission') s.commission = fee; else if (r.kind === 'admin') s.admin = fee; else s.other.push(fee);
    if (r.confirmedAt && (!s.confirmed || r.confirmedAt > s.confirmed.at)) s.confirmed = { role: r.confirmedRole, by: r.confirmedByName || '', at: r.confirmedAt };
  }
  Object.values(out).forEach((s) => s.other.sort((a, b) => a.slot - b.slot));
  return out;
}

/* Plain status for one side: who set the figures and who confirmed them. */
export function sideStatus(s) {
  if (!s || !s.rows) return { text: 'Not entered yet', cls: '' };
  const lastBy = [s.commission, s.admin, ...s.other].filter(Boolean).map((f) => f.source);
  const staffAfter = s.confirmed && lastBy.includes('staff');
  if (s.confirmed) {
    const who = s.confirmed.role === 'tc' ? 'Confirmed by TC' : 'Agent confirmed';
    return { text: staffAfter ? `${who}, then changed by CLA staff` : who, cls: staffAfter ? 'warn' : 'ok', by: s.confirmed.by, at: s.confirmed.at };
  }
  return { text: 'Not confirmed by the agent yet', cls: 'warn' };
}

/* What a save will change, for the "You're changing X from $A to $B" check (AF-3). before = one side from groupAgentFees, after = readAgentFees output. */
const money2 = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctText = (n) => `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 4 })}%`;
const paidBy = (p) => (p ? ` (paid by ${PAYER_LABEL[p] || p})` : '');
export function feeText(kind, f) {
  if (!f) return 'none';
  if (kind === 'commission') return `${pctText(f.percent)} / ${money2(f.amount)}${paidBy(f.payer)}`;
  if (kind === 'other') return `${f.description} ${money2(f.amount)} to ${f.paidTo}${paidBy(f.payer)}`;
  return `${money2(f.amount)}${paidBy(f.payer)}`;
}
export function feeChanges(before, after) {
  const b = before || {}; const out = [];
  const same = (kind, x, y) => feeText(kind, x) === feeText(kind, y);
  const add = (label, kind, x, y) => { if (!same(kind, x, y)) out.push({ label, from: feeText(kind, x), to: feeText(kind, y) }); };
  add('Commission', 'commission', b.commission, after.commission);
  add('Admin fee', 'admin', b.admin, after.admin);
  const n = Math.max((b.other || []).length, (after.other || []).length);
  for (let i = 0; i < n; i += 1) add(`Other fee ${i + 1}`, 'other', (b.other || [])[i], (after.other || [])[i]);
  return out;
}

/* Map database / network errors to something a person can act on (AGENTS.md rule 12). Our own messages pass through. */
export function agentFeeError(e) {
  const m = String((e && e.message) || e || '');
  if (/permission denied|not allowed|42501|row-level security/i.test(m)) return "You can't change agent fees on this file.";
  if (/function .* does not exist|could not find the function|PGRST20/i.test(m)) return 'Agent fees are not switched on for this portal yet. Nothing was saved.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Could not reach the portal. Check your connection and try again. Nothing was lost.';
  if (/^[A-Z][^{}<>]{3,200}$/.test(m) && !/sql|syntax|relation|column|constraint|violates|null value|uuid/i.test(m)) return m;
  return 'Agent fees could not be saved. Try again, or ask CLA Title for help.';
}

// AF-5: the fee-ledger line an agent fee posts to (same rules as private.agent_fee_ledger_sync on Supabase):
// ALTA "Commission", CD section H, paid by the fee's payer, payee = the agent's company (or the other fee's "paid to").
export const ledgerKey = (side, kind, slot) => `agent_fee:${side}:${kind}:${slot || 0}`;
export function agentFeeLedgerInput(f, { company = '' } = {}) {
  const sideWord = f.side === 'buyer' ? "buyer's agent" : 'listing agent';
  const payer = f.payer || defaultPayer(f.side);
  const pct = f.pct != null ? f.pct : f.percent;
  const description = f.kind === 'commission' ? `Real estate commission - ${sideWord} (${Number(Number(pct).toFixed(4))}%)`
    : f.kind === 'admin' ? `Admin fee - ${sideWord}` : `${String(f.description || '').slice(0, 170)} - ${sideWord}`;
  const payee = String((f.kind === 'other' && f.paidTo) || company || (f.side === 'buyer' ? "Buyer's Agent" : 'Listing Agent')).slice(0, 120);
  const amount = Number(f.amount);
  return { kind: 'charge', description, altaSection: 'commission', cdSection: 'H', cdLine: '', payee, amount: amount.toFixed(2), paidBy: payer, timing: 'at',
    note: 'From Agent fees on the file overview. Change it there; a change made here stops the automatic updates for this line.', presetKey: ledgerKey(f.side, f.kind, f.slot) };
}
// what was posted, to tell a line a processor changed by hand (left alone) from one still in step
export const ledgerShape = (e) => JSON.stringify({ d: e.description, p: e.payee, a: Number(e.amount), b: e.paidBy, s: e.split || null });
