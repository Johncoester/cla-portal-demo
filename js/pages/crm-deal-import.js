/* crm-deal-import.js : CRM-FEED-1. #/crm/import/deals (Admin / Super admin). Import deals from a Zoho Deals export.
 * Each row is matched to a portal order: the file number first, else the property address + the client. One match links
 * the Zoho deal to the order (the order stays the one CRM deal). No match: the Zoho deal is its own CRM deal. More than one
 * match: nothing is linked, the row is imported and flagged "needs review". Running the same file twice adds nothing.
 * Preview first; nothing is saved until Import. Nothing is emailed. */
import { html, raw, $, guard, toast, pill, toText } from '../ui.js?v=202611161500';
import { parseCsv, toCsvText, guessMapping, applyMapping } from '../data/crm-janine.js?v=202611247700';
import { importFileKind, importFileRejectReason, importReadErrorMessage } from '../data/crm-import-file.js?v=202611247700';
import { DEAL_IMPORT_FIELDS, DEAL_IMPORT_MAX_ROWS } from '../data/crm-imported-deals.js?v=202611312100';

const MATCH_LABEL = { linked: ['Linked to order', 'ok'], unmatched: ['New CRM deal', 'ok'], ambiguous: ['Needs review', 'warn'] };
export function dealImportResultCell(x) {
  if (x.status === 'duplicate') return html`${pill('Duplicate', 'warn')} <span class="small">${x.message}</span>`;
  if (x.status === 'error') return html`${pill('Error', 'bad')} <span class="small">${x.message}</span>`;
  const [label, tone] = MATCH_LABEL[x.match] || MATCH_LABEL.unmatched;
  return html`${pill(label, tone)}${x.fileNumber ? html` <a href="#/crm/deals/${x.dealId}">${x.fileNumber}</a>` : ''} <span class="muted small">${x.message}</span>`;
}

export async function dealImportPage({ api, me }, { tabs, head }) {
  if (!me.isAdmin) return { title: 'Import', crumbs: [['CRM', '#/crm'], ['Import']], body: html`${head('Import Deals', me)}${tabs('deals')}<p class="err-text" data-import-denied>Only an Admin or Super admin can import.</p>` };
  const testBanner = api.mode === 'supabase' ? html`<p class="notice" data-import-test-banner>TEST portal: fake data only, do not import real client deals</p>` : '';
  const body = html`${head('Import Deals', me)}${tabs('deals')}${testBanner}
    <div class="card" data-deal-import><h3>1. Upload the Zoho Deals export (CSV or Excel)</h3>
      <p class="muted small" data-deal-import-rule>Each row is matched to a portal order by the <strong>file number</strong>, else by the <strong>property address and the client</strong>.
        One match links the Zoho deal to that order, so the order stays one CRM deal. No match: the Zoho deal is added as its own CRM deal.
        More than one match: nothing is linked and the row is marked <strong>Needs review</strong>. A row already imported is skipped, so running the same file again adds nothing.
        Up to ${DEAL_IMPORT_MAX_ROWS} rows. Nothing is emailed.</p>
      <input type="file" accept=".csv,.xlsx,.xls,text/csv" data-deal-import-file aria-describedby="deal-import-err"> <span class="muted small" data-deal-import-fname></span>
      <p class="err-text" id="deal-import-err" data-deal-import-err role="alert" hidden></p></div>
    <div class="card" data-deal-import-map hidden><h3>2. Map the columns</h3><table class="tbl"><thead><tr><th>Column in the file</th><th>First value</th><th>Field</th></tr></thead><tbody data-deal-map-rows></tbody></table>
      <p><button class="m-btn" type="button" data-deal-import-preview>Preview</button></p></div>
    <div class="card" data-deal-import-prev hidden><h3>3. Preview</h3><p data-deal-import-counts></p><table class="tbl" data-deal-import-table></table>
      <p><button class="m-btn" type="button" data-deal-import-run>Import</button> <a class="ghost" href="#/crm/deals">Back to Deals</a></p></div>`;
  const mount = (root) => {
    let rows = null; let fileName = '';
    const err = (m) => { const el = $('[data-deal-import-err]', root); el.textContent = m || ''; el.hidden = !m; };
    const records = () => { const mapping = [...root.querySelectorAll('[data-deal-map]')].map((s) => s.value); return applyMapping(rows, mapping).records; };
    const counts = (c) => `${c.total} rows: ${c.linked} linked to a portal order, ${c.created - c.linked - c.ambiguous} new CRM deals, ${c.ambiguous} need review, ${c.duplicates} duplicates skipped, ${c.errors} errors.`;
    const show = (r) => {
      $('[data-deal-import-counts]', root).textContent = (r.committed ? 'Imported. ' : 'Preview, nothing saved yet. ') + counts(r.counts);
      $('[data-deal-import-table]', root).innerHTML = toText(html`<thead><tr><th>Line</th><th>Deal</th><th>Result</th></tr></thead><tbody>${r.rows.map((x) => html`<tr data-deal-prev-row="${x.line}" data-status="${x.status}" data-match="${x.match || ''}"><td>${x.line}</td><td>${x.name}</td><td>${dealImportResultCell(x)}</td></tr>`)}</tbody>`);
      $('[data-deal-import-prev]', root).hidden = false; $('[data-deal-import-run]', root).hidden = !!r.committed;
    };
    $('[data-deal-import-file]', root).addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return; err('');
      const early = importFileRejectReason(f); if (early) { err(early); return; }
      try {
        let parsed;
        if (importFileKind(f) === 'excel') { const { rowsFromExcel } = await import('../data/crm-excel.js?v=202611221700'); parsed = parseCsv(toCsvText((await rowsFromExcel(await f.arrayBuffer())).rows)); }
        else parsed = parseCsv(await f.text());
        if (!parsed.length || parsed.length < 2) { err('The file has no rows under the header.'); return; }
        if (parsed.length - 1 > DEAL_IMPORT_MAX_ROWS) { err(`The file has ${parsed.length - 1} rows. The most is ${DEAL_IMPORT_MAX_ROWS}.`); return; }
        rows = parsed; fileName = f.name; $('[data-deal-import-fname]', root).textContent = f.name;
        const guess = guessMapping(rows[0], DEAL_IMPORT_FIELDS);
        $('[data-deal-map-rows]', root).innerHTML = toText(rows[0].map((h, i) => html`<tr><td>${h}</td><td class="muted small">${(rows[1] || [])[i] || ''}</td><td><select data-deal-map="${i}" aria-label="Field for ${h}"><option value="">(skip this column)</option>${DEAL_IMPORT_FIELDS.map(([k, l]) => html`<option value="${k}" ${guess[i] === k ? raw('selected') : ''}>${l}</option>`)}</select></td></tr>`));
        $('[data-deal-import-map]', root).hidden = false; $('[data-deal-import-prev]', root).hidden = true;
      } catch (x) { err(importReadErrorMessage(x)); }
    });
    $('[data-deal-import-preview]', root).addEventListener('click', guard(async () => { show(await api.previewCrmDealImport({ records: records(), fileName })); }));
    $('[data-deal-import-run]', root).addEventListener('click', guard(async () => { const r = await api.runCrmDealImport({ records: records(), fileName }); show(r); toast(counts(r.counts)); }));
  };
  return { title: 'Import Deals', crumbs: [['CRM', '#/crm'], ['Deals', '#/crm/deals'], ['Import']], body, mount };
}
