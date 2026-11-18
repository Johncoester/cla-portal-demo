/* FF-091c: read and save tax rate sheets on TEST. Staff can read. Only an Admin or Super admin can write.
 * If the tables are not there yet, Taxes & Fees keeps the hardcoded rates. Nothing here touches production. */
import { canEditTaxRates, RATE_ADMIN_ONLY, cleanJurisdiction, cleanRateLine, cleanExemption, cleanAllocation, cleanQuestionLabel } from './tax-rate-edit.js?v=202611245800';

const NOT_ON_DB = 'Tax rate sheets are not on this database yet. Apply the tax rate sheet file, then reload this page.';
const missing = (error) => {
  const code = String(error && error.code || '');
  const message = String(error && error.message || '');
  return code === '42P01' || code === 'PGRST205' || /tax_jurisdictions|schema cache|does not exist/i.test(message);
};
const refused = (error) => {
  const code = String(error && error.code || '');
  const message = String(error && error.message || '');
  return code === '42501' || /row-level security|permission denied/i.test(message);
};

function mapJurisdiction(r) {
  return { id: r.id, state: r.state, county: r.county || '', city: r.city || '', name: r.name, active: r.active !== false, notes: r.notes || '' };
}
function mapLine(r) {
  return {
    id: r.id, jurisdictionId: r.jurisdiction_id, kind: r.kind, name: r.name, document: r.document || '', transaction: r.transaction,
    basis: r.basis, rate: r.rate == null ? null : Number(r.rate), rateUnit: r.rate_unit, flatFee: r.flat_fee == null ? null : Number(r.flat_fee),
    pagesIncluded: r.pages_included, perAdditionalPage: r.per_additional_page == null ? null : Number(r.per_additional_page),
    pageTierFrom: r.page_tier_from, pageTierTo: r.page_tier_to, bracketFrom: Number(r.bracket_from) || 0, bracketTo: r.bracket_to == null ? null : Number(r.bracket_to),
    bracketMethod: r.bracket_method, paidBy: r.paid_by, roundThird: !!r.round_third, whenKey: r.when_key || '', whenValue: r.when_value || '',
    replacesName: r.replaces_name || '', sort: r.sort_order || 0, active: r.active !== false, notes: r.notes || ''
  };
}
function mapExemption(r) {
  return { id: r.id, jurisdictionId: r.jurisdiction_id, rateLineId: r.rate_line_id, code: r.code, name: r.name, amount: r.exempt_amount == null ? null : Number(r.exempt_amount), alternateRate: r.alternate_rate == null ? null : Number(r.alternate_rate), maxPrice: r.max_price == null ? null : Number(r.max_price), questionKey: r.question_key || '', active: r.active !== false, notes: r.notes || '' };
}
function mapQuestion(r) {
  return { id: r.id, jurisdictionId: r.jurisdiction_id, key: r.question_key, label: r.label, help: r.help || '', inputType: r.input_type, choices: r.choices || [], scope: r.scope, transaction: r.transaction, sort: r.sort_order || 0, active: r.active !== false };
}
function mapAllocation(r) {
  return { id: r.id, jurisdictionId: r.jurisdiction_id, taxName: r.tax_name, document: r.document || '', transaction: r.transaction, paidBy: r.default_paid_by, lawMandated: !!r.law_mandated, whenKey: r.when_key || '', whenValue: r.when_value || 'yes', active: r.active !== false, notes: r.notes || '' };
}

export async function readTaxBundle(sb) {
  const probe = await sb.from('tax_jurisdictions').select('id,state,county,city,name,active,notes').eq('active', true);
  if (probe.error) { if (missing(probe.error)) return null; throw new Error('Tax rates could not be read. Reload the page and try again.'); }
  if (!probe.data || !probe.data.length) return null;
  const [lines, exemptions, questions, allocations] = await Promise.all([
    sb.from('tax_rate_lines').select('*').eq('active', true),
    sb.from('tax_exemptions').select('*').eq('active', true),
    sb.from('tax_questions').select('*').eq('active', true),
    sb.from('tax_allocations').select('*').eq('active', true)
  ]);
  for (const part of [lines, exemptions, questions, allocations]) {
    if (part.error) { if (missing(part.error)) return null; throw new Error('Tax rates could not be read. Reload the page and try again.'); }
  }
  return {
    source: 'Tax rate sheet',
    jurisdictions: probe.data.map(mapJurisdiction),
    lines: (lines.data || []).map(mapLine),
    exemptions: (exemptions.data || []).map(mapExemption),
    questions: (questions.data || []).map(mapQuestion),
    allocations: (allocations.data || []).map(mapAllocation),
    unset: []
  };
}

function writeError(error) {
  if (refused(error)) return RATE_ADMIN_ONLY;
  if (missing(error)) return NOT_ON_DB;
  if (String(error.code || '') === '23505') return 'That state, county, and city is already on the list. Choose it above and edit its rates.';
  return 'The rate sheet could not be saved. Check the amounts and try again. Nothing was saved.';
}

export function taxRatesSupabase({ sb, me }) {
  const admin = async () => { const u = await me(); if (!canEditTaxRates(u)) throw new Error(RATE_ADMIN_ONLY); return u; };
  const run = async (q) => { const r = await q; if (r.error) throw new Error(writeError(r.error)); return r.data; };
  return {
    async listTaxRates() {
      await admin();
      const bundle = await readTaxBundle(sb);
      if (!bundle) throw new Error(NOT_ON_DB);
      return bundle;
    },
    async saveTaxJurisdiction(input) {
      await admin();
      const clean = cleanJurisdiction(input);
      const row = await run(sb.from('tax_jurisdictions').insert({ state: clean.state, county: clean.county, city: clean.city, name: clean.name }).select('*').single());
      return mapJurisdiction(row);
    },
    async saveTaxRateLine(input) {
      await admin();
      const clean = cleanRateLine(input);
      if (input.id) {
        const patch = { name: clean.name, paid_by: clean.paidBy, updated_at: new Date().toISOString() };
        if (clean.kind === 'recording') patch.flat_fee = clean.flatFee; else patch.rate = clean.rate;
        return mapLine(await run(sb.from('tax_rate_lines').update(patch).eq('id', input.id).select('*').single()));
      }
      if (!input.jurisdictionId) throw new Error('Choose a state, county, or city first.');
      const row = {
        jurisdiction_id: input.jurisdictionId, kind: clean.kind, name: clean.name, paid_by: clean.paidBy,
        transaction: 'purchase', basis: clean.kind === 'recording' ? 'flat' : 'sale', rate_unit: clean.kind === 'recording' ? 'flat' : 'percent',
        rate: clean.kind === 'recording' ? null : clean.rate, flat_fee: clean.kind === 'recording' ? clean.flatFee : null
      };
      return mapLine(await run(sb.from('tax_rate_lines').insert(row).select('*').single()));
    },
    async saveTaxExemption(input) {
      await admin();
      const clean = cleanExemption(input);
      if (!input.id) throw new Error('That exemption is no longer on the list. Reload the page.');
      return mapExemption(await run(sb.from('tax_exemptions').update({ name: clean.name, exempt_amount: clean.amount, alternate_rate: clean.alternateRate, updated_at: new Date().toISOString() }).eq('id', input.id).select('*').single()));
    },
    async saveTaxAllocation(input) {
      await admin();
      const clean = cleanAllocation(input);
      if (!input.id) throw new Error('That split is no longer on the list. Reload the page.');
      return mapAllocation(await run(sb.from('tax_allocations').update({ default_paid_by: clean.paidBy, law_mandated: clean.lawMandated, updated_at: new Date().toISOString() }).eq('id', input.id).select('*').single()));
    },
    async saveTaxQuestion(input) {
      await admin();
      const label = cleanQuestionLabel(input && input.label);
      if (!input.id) throw new Error('That question is no longer on the list. Reload the page.');
      return mapQuestion(await run(sb.from('tax_questions').update({ label, updated_at: new Date().toISOString() }).eq('id', input.id).select('*').single()));
    }
  };
}
