/* [SUPABASE] John's Nov 4 portal meeting + Janine's Nov 4 videos (migration 56). Same names / shapes as mock-part-feedback-nov4.js and the closing
 * office parts of mock-part-matt.js. NOT run against a hosted project (best effort; the mock adapter is the tested one).
 *  - Closing office: moved to supabase-offices.js (migration 57, public.offices); the getClosingOfficeDefault below is overridden there.
 *  - Disbursement Details: public.deal_disbursements (Admin writes; trigger writes deal_disbursement_log).
 *  - Search result columns: public.crm_search_columns (each person's own).
 *  - Custom views / saved filters: tables are in place; running a view needs the CRM list queries, so it is not connected yet. */
import { CLA_OFFICES, OFFICE_LOCATION } from './cla-offices.js?v=202611070139';
import { DISBURSEMENT_FIELDS, cleanDisbursement } from './crm-disbursement.js?v=202611070139';
import { SEARCH_COL_MAX } from './crm-views.js?v=202611070139';
const NOT_YET = 'Custom views and saved filters are not connected to the live database yet (they work in the demo build). Nothing was saved.';
const snake = (k) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
export function feedbackNov4Supabase({ sb, ok, me }) {
  return {
    async getClosingOfficeDefault(dealId) {
      const offices = (ok(await sb.from('cla_offices').select('id,name,address,state,state_default,position').eq('active', true).order('position')) || [])
        .map((o) => ({ id: o.id, name: o.name, address: o.address, state: o.state, stateDefault: o.state_default }));
      const d = (ok(await sb.rpc('closing_office_default', { p_deal: dealId })) || [])[0] || {};
      return { offices: offices.length ? offices : CLA_OFFICES, officeId: d.office_id || null, reason: d.reason || 'none', text: d.office_name || '', officeLocation: OFFICE_LOCATION };
    },
    async getCrmDealDisbursement(dealId) { const u = await me();
      const r = ok(await sb.from('deal_disbursements').select('*').eq('deal_id', dealId).maybeSingle()) || {};
      const values = {}; DISBURSEMENT_FIELDS.forEach(([k, , t]) => { const v = r[snake(k)]; values[k] = v == null ? null : t === 'money' ? Number(v) : String(v); });
      const history = ok(await sb.from('deal_disbursement_log').select('*').eq('deal_id', dealId).order('changed_at', { ascending: false }).limit(50)) || [];
      return { values, canEdit: !!(u && ['Admin', 'Super admin'].includes(u.role)), history: history.map((h) => ({ field: h.field_key, from: h.old_amount ?? h.old_date, to: h.new_amount ?? h.new_date, at: h.changed_at, byId: h.changed_by })) };
    },
    async saveCrmDealDisbursement(dealId, input = {}) { const u = await me(); if (!u || !['Admin', 'Super admin'].includes(u.role)) throw new Error('Only an Admin or Super admin can enter Disbursement Details.');
      const v = cleanDisbursement(input); const row = { deal_id: dealId }; Object.keys(v).forEach((k) => { row[snake(k)] = v[k]; });
      ok(await sb.from('deal_disbursements').upsert(row, { onConflict: 'deal_id' })); return this.getCrmDealDisbursement(dealId);
    },
    async getCrmSearchColumns(module) { const u = await me();
      return (ok(await sb.from('crm_search_columns').select('column_key,position').eq('user_id', u.id).eq('module', module).order('position')) || []).map((r) => r.column_key); },
    async saveCrmSearchColumns(module, keys) { const u = await me();
      ok(await sb.from('crm_search_columns').delete().eq('user_id', u.id).eq('module', module));
      if (keys == null) return null;
      const list = [...new Set((keys || []).map(String))].slice(0, SEARCH_COL_MAX);
      if (list.length) ok(await sb.from('crm_search_columns').insert(list.map((k, i) => ({ user_id: u.id, module, position: i, column_key: k }))));
      return list; },
    async listCrmViews() { return []; },
    async listCrmSavedFilters() { return []; },
    async createCrmView() { throw new Error(NOT_YET); }, async updateCrmView() { throw new Error(NOT_YET); }, async cloneCrmView() { throw new Error(NOT_YET); },
    async retireCrmView() { throw new Error(NOT_YET); }, async pinCrmView() { throw new Error(NOT_YET); }, async runCrmView() { throw new Error(NOT_YET); },
    async saveCrmSavedFilter() { throw new Error(NOT_YET); }, async renameCrmSavedFilter() { throw new Error(NOT_YET); }, async retireCrmSavedFilter() { throw new Error(NOT_YET); },
  };
}
