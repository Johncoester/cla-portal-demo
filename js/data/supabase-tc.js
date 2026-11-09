/* [SUPABASE] TC PORTAL (John, Nov 5; migration 71). Same names as mock-part-tc.js. NOT run against a hosted project
 * (best effort; the mock adapter and the SQL tests are the tested parts).
 *  - public.update_tc_contract / update_tc_client_contact / update_tc_emd_alta / create_all_parties_thread
 *  - typed columns on deals (contract, commissions, EMD received, signed ALTA); threads.staff_coordinated */
import { STAGES, moneyAmount, plainNumber } from './constants.js?v=202611100245';
export function tcSupabase({ sb, ok, camel, api }) {
  const dealRow = async (id) => camel(ok(await sb.from('deals').select('*').eq('id', id).single()));
  const milestones = (q) => STAGES.map((name, i) => ({ index: i, name,
    state: q.status === 'Closed' ? 'done' : i < (q.stage || 0) ? 'done' : i === (q.stage || 0) ? 'current' : 'upcoming',
    date: i === 0 ? q.openDate : i === 3 ? q.closingDate : i === 9 && q.status === 'Closed' ? q.closingDate : null }));
  const emdAlta = (q) => ({ received: !!q.emdReceived, receivedDate: q.emdReceivedDate || null,
    receivedAmount: q.emdReceivedAmount == null ? q.emdAmount : q.emdReceivedAmount, holder: q.emdHolder || '',
    altaReceived: !!q.altaReceived, altaReceivedDate: q.altaReceivedDate || null, altaDocumentId: q.altaDocumentId || null });
  return {
    async getContractInfo(id) {
      const q = await dealRow(id); const deal = await api.getDeal(id);
      return { purchasePrice: q.purchasePrice ?? '', contractDate: q.contractDate || '', listingCommissionPct: q.listingCommissionPct ?? '',
        listingCommissionAmount: q.listingCommissionAmount ?? '', buyerCommissionPct: q.buyerCommissionPct ?? '',
        buyerCommissionAmount: q.buyerCommissionAmount ?? '', sellerConcessions: q.sellerConcessions ?? '',
        emdAmount: q.emdAmount ?? '', emdHolder: q.emdHolder || '', closingDate: q.closingDate || '',
        clients: deal.participants.filter((p) => ['Client-Buyer', 'Client-Seller'].includes(p.role)).map((p) => ({
          participantId: p.id, contactId: p.contactId, role: p.role, firstName: p.contact.firstName, lastName: p.contact.lastName,
          email: p.contact.email || '', phone: p.contact.phone || '' })) };
    },
    async updateContractInfo(id, patch = {}) {
      ok(await sb.rpc('update_tc_contract', {
        p_deal: id, p_purchase_price: patch.purchasePrice !== undefined ? moneyAmount(patch.purchasePrice) : null,
        p_contract_date: patch.contractDate || null, p_listing_commission_pct: patch.listingCommissionPct !== undefined ? plainNumber(patch.listingCommissionPct) : null,
        p_listing_commission_amount: patch.listingCommissionAmount !== undefined ? moneyAmount(patch.listingCommissionAmount) : null,
        p_buyer_commission_pct: patch.buyerCommissionPct !== undefined ? plainNumber(patch.buyerCommissionPct) : null,
        p_buyer_commission_amount: patch.buyerCommissionAmount !== undefined ? moneyAmount(patch.buyerCommissionAmount) : null,
        p_seller_concessions: patch.sellerConcessions !== undefined ? moneyAmount(patch.sellerConcessions) : null,
        p_emd_amount: patch.emdAmount !== undefined ? moneyAmount(patch.emdAmount) : null, p_emd_holder: patch.emdHolder != null ? patch.emdHolder : null,
        p_closing_date: patch.closingDate || null,
        p_clear_contract_date: patch.contractDate === '' || patch.contractDate === null,
        p_clear_closing_date: patch.closingDate === '' || patch.closingDate === null }));
      return this.getContractInfo(id);
    },
    async updateClientContact(id, participantId, patch) {
      ok(await sb.rpc('update_tc_client_contact', { p_deal: id, p_participant: participantId, p_first: patch.firstName || '',
        p_last: patch.lastName || '', p_email: patch.email || '', p_phone: patch.phone || '' }));
      return camel(ok(await sb.from('contacts').select('*').eq('id', (await this.getContractInfo(id)).clients.find((c) => c.participantId === participantId).contactId).single()));
    },
    async getMilestones(id) { return milestones(await dealRow(id)); },
    async getEmdAlta(id) { return emdAlta(await dealRow(id)); },
    async updateEmdAlta(id, p = {}) {
      ok(await sb.rpc('update_tc_emd_alta', {
        p_deal: id, p_emd_received: p.received === undefined ? null : !!(p.received === true || p.received === 'yes' || p.received === 'true' || p.received === 'on'),
        p_emd_received_date: p.receivedDate || null, p_emd_received_amount: p.receivedAmount !== undefined ? moneyAmount(p.receivedAmount) : null,
        p_alta_received: p.altaReceived === undefined && !p.altaDocumentId ? null : !!(p.altaReceived === true || p.altaReceived === 'yes' || p.altaReceived === 'true' || p.altaReceived === 'on' || p.altaDocumentId),
        p_alta_received_date: p.altaReceivedDate || null, p_alta_document_id: p.altaDocumentId || null }));
      return this.getEmdAlta(id);
    },
    async getTcFileSummary(id) {
      const q = await dealRow(id); const tasks = (await api.listTasks(id)).filter((t) => ['todo', 'in_progress', 'blocked'].includes(t.status));
      return { deal: await api.getDeal(id), milestones: milestones(q), emdAlta: emdAlta(q), outstanding: tasks.length, tasks: tasks.slice(0, 12) };
    },
    async createAllPartiesThread(id, { subject, body }) {
      return { id: ok(await sb.rpc('create_all_parties_thread', { p_deal: id, p_subject: subject || '', p_body: body || '' })), staffCoordinated: true };
    },
  };
}
