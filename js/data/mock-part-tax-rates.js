/* FF-091c mock store for tax rate sheets. Fake data only. Starts from the rates already in the fee sheet.
 * An Admin's edits stay in this browser. Staff can read them through Taxes & Fees. Only an Admin can change them. */
import { TAX_RATE_SEED } from './tax-rate-seed.js?v=202611244000';
import { canEditTaxRates, RATE_ADMIN_ONLY, cleanJurisdiction, cleanRateLine, cleanExemption, cleanAllocation, cleanQuestionLabel } from './tax-rate-edit.js?v=202611245600';

const VERSION = 1;

export function ensureTaxRates(d) {
  if (!d.taxRateSheet || d.taxRateSheet.version !== VERSION || !d.taxRateSheet.bundle) {
    d.taxRateSheet = { version: VERSION, bundle: JSON.parse(JSON.stringify(TAX_RATE_SEED)) };
  }
  return d.taxRateSheet;
}

export function bundleOf(d) {
  return ensureTaxRates(d).bundle;
}

function placeName(j) {
  return j.city ? `${j.city}, ${j.county ? j.county + ', ' : ''}${j.state}` : (j.county ? `${j.county}, ${j.state}` : j.name);
}

export function taxRatesPart({ load, save, needUser, nid, fail }) {
  const sheet = () => ensureTaxRates(load());
  const admin = () => { const u = needUser(); if (!canEditTaxRates(u)) fail(RATE_ADMIN_ONLY); return u; };
  const view = (d) => {
    const b = d.bundle;
    const jurisdictions = [...b.jurisdictions].filter((j) => j.active !== false).sort((a, c) => placeName(a).localeCompare(placeName(c)));
    return { jurisdictions, lines: b.lines, exemptions: b.exemptions, questions: b.questions, allocations: b.allocations, unset: b.unset || [] };
  };
  return {
    async listTaxRates() { admin(); return view(sheet()); },
    async saveTaxJurisdiction(input) {
      admin();
      let clean; try { clean = cleanJurisdiction(input); } catch (e) { return fail(e.message); }
      const d = sheet();
      if (d.bundle.jurisdictions.some((j) => j.state === clean.state && j.county === clean.county && j.city === clean.city)) fail('That state, county, and city is already on the list. Choose it above and edit its rates.');
      const row = { id: nid('tj'), ...clean, active: true, notes: '' };
      d.bundle.jurisdictions.push(row); save(); return row;
    },
    async saveTaxRateLine(input) {
      admin();
      let clean; try { clean = cleanRateLine(input); } catch (e) { return fail(e.message); }
      const d = sheet();
      const j = d.bundle.jurisdictions.find((x) => x.id === input.jurisdictionId) || fail('Choose a state, county, or city first.');
      let row = input.id ? d.bundle.lines.find((x) => x.id === input.id) : null;
      if (input.id && !row) fail('That rate is no longer on the list. Reload the page.');
      if (!row) {
        row = { id: nid('tl'), jurisdictionId: j.id, kind: clean.kind, document: '', transaction: 'purchase', basis: clean.kind === 'recording' ? 'flat' : 'sale', rateUnit: clean.kind === 'recording' ? 'flat' : 'percent', pagesIncluded: null, perAdditionalPage: null, pageTierFrom: null, pageTierTo: null, bracketFrom: 0, bracketTo: null, bracketMethod: 'whole', roundThird: false, whenKey: '', whenValue: '', replacesName: '', sort: d.bundle.lines.length + 1, active: true, notes: '' };
        d.bundle.lines.push(row);
      }
      row.name = clean.name; row.paidBy = clean.paidBy;
      if (row.kind === 'recording') row.flatFee = clean.flatFee; else row.rate = clean.rate;
      save(); return row;
    },
    async saveTaxExemption(input) {
      admin();
      let clean; try { clean = cleanExemption(input); } catch (e) { return fail(e.message); }
      const d = sheet();
      const row = d.bundle.exemptions.find((x) => x.id === input.id) || fail('That exemption is no longer on the list. Reload the page.');
      row.name = clean.name; row.amount = clean.amount; row.alternateRate = clean.alternateRate; save(); return row;
    },
    async saveTaxAllocation(input) {
      admin();
      let clean; try { clean = cleanAllocation(input); } catch (e) { return fail(e.message); }
      const d = sheet();
      const row = d.bundle.allocations.find((x) => x.id === input.id) || fail('That split is no longer on the list. Reload the page.');
      row.paidBy = clean.paidBy; row.lawMandated = clean.lawMandated; save(); return row;
    },
    async saveTaxQuestion(input) {
      admin();
      let label; try { label = cleanQuestionLabel(input && input.label); } catch (e) { return fail(e.message); }
      const d = sheet();
      const row = d.bundle.questions.find((x) => x.id === input.id) || fail('That question is no longer on the list. Reload the page.');
      row.label = label; save(); return row;
    }
  };
}
