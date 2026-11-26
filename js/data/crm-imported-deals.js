/* crm-imported-deals.js : CRM-FEED-1 (John chat 9:09 PM Nov 25). Portal orders ARE the CRM deals. Deals Janine imports from a
 * Zoho export land in public.crm_imported_deals; one that matches a portal order (file number, else property address + client)
 * is linked to it and is not shown twice. Pure helpers only: column mapping for the Deals import and the merge into the
 * CRM Deals list. The matching itself runs in the database (migration 20261131100000). */

// [key, label, other header names]. Zoho's Deals export headers are in the aliases.
export const DEAL_IMPORT_FIELDS = [
  ['zohoId', 'Zoho Record Id', ['record id', 'id', 'deal id', 'zoho id']],
  ['name', 'Deal Name', ['deal', 'deal name', 'name']],
  ['fileNumber', 'File Number', ['file', 'file no', 'file #', 'file number', 'order number', 'escrow number']],
  ['street', 'Property Street', ['property address', 'street', 'address', 'property street', 'mailing street']],
  ['city', 'City', ['property city', 'mailing city']],
  ['state', 'State', ['property state', 'mailing state']],
  ['zip', 'ZIP', ['zip code', 'postal code', 'property zip']],
  ['clientName', 'Client Name', ['contact name', 'client', 'buyer', 'seller', 'client name']],
  ['clientEmail', 'Client Email', ['email', 'contact email', 'client email']],
  ['amount', 'Amount', ['purchase price', 'sales price', 'amount']],
  ['stage', 'Stage', ['deal stage', 'status']],
  ['closingDate', 'Closing Date', ['closing date', 'close date', 'expected close', 'closed date']],
  ['ownerName', 'Deal Owner', ['owner', 'deal owner', 'sales person', 'salesperson']]];
export const DEAL_IMPORT_CHUNK = 500;
export const DEAL_IMPORT_MAX_ROWS = 10000;

// Zoho stage words -> the order status words the Deals list filters on.
export function importedStatusOf(stage) {
  const s = String(stage || '').toLowerCase();
  if (/cancel|lost|dead/.test(s)) return 'Cancelled';
  if (/hold/.test(s)) return 'On Hold';
  if (/closed|won|funded|recorded/.test(s)) return 'Closed';
  return 'Open';
}

// rows = crm_deals() rows (already shaped), imported = crm_imported_deals_list().
// A linked imported deal adds its Zoho fields to the order row. An unlinked one is its own row, shown only when no
// owner / client / source filter is set (it has no portal owner, client link, or source) and its status fits.
export function mergeImportedDeals(rows, imported, f = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const imp = Array.isArray(imported) ? imported : [];
  if (!imp.length) return list;
  const byDeal = new Map(imp.filter((z) => z && z.dealId).map((z) => [z.dealId, z]));
  const out = list.map((r) => (byDeal.has(r.id) ? { ...r, zoho: zohoOf(byDeal.get(r.id)) } : r));
  const filtered = !!(f.ownerId || f.clientId || f.source);
  const st = f.status || 'Open';
  if (filtered) return out;
  for (const z of imp) {
    if (!z || z.dealId) continue;   // linked: the order row is the deal (or this person cannot see that order), never a second copy
    const status = importedStatusOf(z.stage);
    if (st !== 'All' && status !== st) continue;
    out.push({ id: 'zoho:' + z.id, imported: true, ambiguous: z.matchStatus === 'ambiguous', matchNote: z.matchNote || '', zoho: zohoOf(z),
      name: z.propertyAddress || z.name || z.fileNumber || '', propertyAddress: z.propertyAddress || '', fileNumber: z.fileNumber || '',
      amount: z.amount == null ? null : Number(z.amount), closingDate: z.closingDate || null, openDate: null, status, stage: status === 'Open' ? 'Opened' : status === 'Cancelled' ? 'Canceled' : status,
      clientName: z.clientName || '', ownerName: z.ownerName || '', sourceText: 'Zoho import', city: z.city || '', createdAt: z.createdAt || null, _link: '', _clientLink: '' });
  }
  return out;
}
const zohoOf = (z) => ({ id: z.id, zohoId: z.zohoId || '', name: z.name || '', stage: z.stage || '', ownerName: z.ownerName || '', matchStatus: z.matchStatus || '', matchNote: z.matchNote || '' });

// Split rows into server calls of at most DEAL_IMPORT_CHUNK. Each call returns { rows, counts }; lines are made file-wide.
export async function runDealImportChunks(call, records, commit, fileName) {
  const all = []; const counts = { total: 0, created: 0, linked: 0, ambiguous: 0, duplicates: 0, errors: 0 }; let importId = null;
  for (let i = 0; i < records.length; i += DEAL_IMPORT_CHUNK) {
    const part = records.slice(i, i + DEAL_IMPORT_CHUNK);
    const r = (await call({ p_commit: !!commit, p_file_name: fileName || '', p_rows: part, p_import: importId })) || {};
    importId = r.importId || importId;
    (r.rows || []).forEach((x) => all.push({ ...x, line: (Number(x.line) || 0) + i }));
    Object.keys(counts).forEach((k) => { counts[k] += Number((r.counts || {})[k]) || 0; });
  }
  return { importId, committed: !!commit, rows: all, counts };
}
