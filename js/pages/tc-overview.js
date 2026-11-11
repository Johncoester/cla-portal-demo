// TC FILE OVERVIEW (John, Nov 5): light, mirrors buyer/seller overview. Order: progress, address/key info, outstanding tasks, contacts.
// Quick jumps: Contract info, Milestones, EMD & ALTA, Documents/Upload, Messages (all parties). FAKE DATA ONLY.
import { html, raw, $, $$, guard, formData, modal, closeModal, options, fmtDate, fmtMoney, pill, toast } from '../ui.js?v=202611070139';
import { STAGES, DOC_TYPES, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXT, moneyShow, moneyAmount } from '../data/constants.js?v=202611101015';
import { settlementSectionHtml, mountSettlement } from './settlement-section.js?v=202611111700';
import { composeModal } from './compose.js?v=202611110900';
import { sameUploadId } from '../data/supabase-nov5.js?v=202611130200';
import { partyDisplayName } from '../data/party-name.js?v=202611102000';
const OPEN = ['todo', 'in_progress', 'blocked'];
const long = (d) => { if (!d) return '—'; const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const href = (d, t = '') => `#/deals/${d.id}${t ? '/' + t : ''}`;
const initials = (f, l) => `${(f || '')[0] || ''}${(l || '')[0] || ''}`.toUpperCase() || '?';
const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read the file.')); r.readAsDataURL(f); });
export async function renderTcOverview(ctx, d) {
  const { api, user, refresh } = ctx;
  const [tasks, contacts, ms, emd, ci, emailN, portalN, locations] = await Promise.all([
    api.listTasks(d.id), api.getDeal(d.id), api.getMilestones(d.id), api.getEmdAlta(d.id), api.getContractInfo(d.id),
    api.fileEmailUnreadCount ? api.fileEmailUnreadCount(d.id).catch(() => 0) : 0,
    api.filePortalUnread ? api.filePortalUnread(d.id).catch(() => 0) : 0,
    api.listClosingLocations ? api.listClosingLocations(d.id).catch(() => []) : [],
  ]);
  const open = tasks.filter((t) => OPEN.includes(t.status)).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const cur = d.status === 'Closed' ? 10 : Math.max(0, Math.min(9, Number(d.stage) || 0)); const pct = cur * 10;
  const chips = html`${emd.received ? pill('EMD received ' + long(emd.receivedDate), 'ok') : pill('EMD not received', 'warn')} ${emd.altaReceived ? pill('Signed ALTA received ' + long(emd.altaReceivedDate), 'ok') : pill('Signed ALTA pending', 'warn')}`;
  const body = html`<div class="co-page tc-page" data-tc-overview>
    <h1 class="co-greet" data-co-greet>Hi ${user.firstName}, here’s your coordination file</h1><p class="co-sub">${d.street}, ${d.city}, ${d.state} ${d.zip} · Order ${d.fileNumber}</p>
    <nav class="co-seg tc-nav" aria-label="File tools" data-tc-nav>
      <a class="on" href="${href(d)}" data-tc-tab="Overview" aria-current="page">Overview</a><a href="${href(d, 'tasks')}" data-tc-tab="Tasks">Tasks ${open.length ? html`<span class="n">${open.length}</span>` : ''}</a><a href="${href(d, 'spouse')}" data-tc-tab="Spouse">Spouse</a>
      <a href="${href(d, 'inbox')}" data-tc-tab="Messages">Messages${portalN ? html` <span class="n" data-portal-unread>${portalN}</span>` : ''}</a><a href="${href(d, 'email')}" data-tc-tab="Email">Email${emailN ? html` <span class="n" data-email-unread>${emailN}</span>` : ''}</a><a href="${href(d, 'documents')}" data-tc-tab="Documents">Documents</a><a href="${href(d, 'closing')}" data-tc-tab="Closing">Closing</a><a href="${href(d, 'contacts')}" data-tc-tab="Contacts">Contacts</a><a href="${href(d, 'activity')}" data-tc-tab="Activity">Activity</a></nav>
    <div class="tc-quick" data-tc-quick><span class="muted small">Quick jump</span>
      <button type="button" class="co-btn g" data-tc-action="contract">Contract info</button><button type="button" class="co-btn g" data-tc-action="milestones">Milestones</button><button type="button" class="co-btn g" data-tc-action="emd">EMD &amp; ALTA</button>
      <button type="button" class="co-btn g" data-tc-action="upload">Documents / Upload</button><button type="button" class="co-btn p" data-tc-action="messages">Messages (all parties)</button></div>
    <section class="co-card" data-co-progress data-tc-section="milestones"><div class="co-ch">Closing progress<span class="r"><span class="co-chip cla">TC view</span></span></div><div class="co-cb">
      <div class="co-status"><div class="co-ring" style="background:conic-gradient(var(--co-bi) 0 ${pct}%, var(--co-bs) ${pct}% 100%)" data-co-ring="${cur}"><div><span><b>${cur}/10</b>steps done</span></div></div>
        <div><div class="co-l1" data-co-step>${d.status === 'Closed' ? 'All 10 steps are done: file closed' : `You’re on step ${cur + 1} of 10: ${STAGES[cur]}`}</div><div class="co-l2">Milestone dates are visible here for you and your clients.</div>
          <div class="co-pills" data-co-pills>${ms.map((m) => html`<span class="co-pill ${m.state === 'done' ? 'done' : m.state === 'current' ? 'now' : ''}" data-tc-stage="${m.index}" data-co-state="${m.state}"><i>${m.state === 'done' ? raw('&#10003;') : m.index + 1}</i>${m.name}<small>${m.date ? long(m.date) : 'Not dated'}</small></span>`)}</div></div></div>
    </div></section>
    <section class="co-card" data-co-property><div class="co-ch">${d.street}<span class="r"><button type="button" class="co-btn g" data-tc-action="contract">Edit contract info</button></span></div><div class="co-cb">
      <div class="co-city">${d.city}, ${d.state} ${d.zip} · Order # ${d.fileNumber}</div>
      <div class="co-facts" data-co-facts><div class="co-fact"><div class="k">Contract date</div><div class="v">${long(ci.contractDate)}</div></div><div class="co-fact"><div class="k">Sale price</div><div class="v">${fmtMoney(ci.purchasePrice) || '—'}</div></div><div class="co-fact"><div class="k">Settlement date</div><div class="v">${long(ci.closingDate)}</div></div><div class="co-fact"><div class="k">EMD holder</div><div class="v">${ci.emdHolder || 'Not set'}</div></div></div>
      <div class="tc-chips" data-tc-emd-alta>${chips} <button type="button" class="co-btn g" data-tc-action="emd">Update EMD / ALTA</button></div>
    </div></section>
    <section class="co-next" data-co-next="${open[0] ? open[0].id : ''}" data-co-outstanding="${open.length}"><div class="co-ic" aria-hidden="true">&#10004;</div><div class="co-next-main"><div class="k">Outstanding tasks (${open.length})</div>
      ${open.length ? html`<ul class="co-todo">${open.slice(0, 8).map((t, i) => html`<li data-co-todo="${t.id}"><span class="t">${t.title}</span><span class="d">${t.assignedRole} · ${t.dueDate ? 'Due ' + long(t.dueDate) : 'No due date'}</span><a class="co-btn ${i === 0 ? 'p' : 'g'}" href="${href(d, 'tasks')}${['form', 'sign', 'agent'].includes(t.kind) ? '/' + t.id : ''}">Open</a></li>`)}</ul>${open.length > 8 ? html`<a class="small" href="${href(d, 'tasks')}">View all ${open.length} tasks →</a>` : ''}` : html`<p class="muted">You’re all caught up.</p>`}</div></section>
    ${settlementSectionHtml({ deal: d, user, demoLocked: !!ctx.demoLocked, locations })}
    <section class="co-card" data-co-team><div class="co-ch">Contacts &amp; parties<span class="r"><button type="button" class="co-btn g" data-tc-action="messages">Message all parties</button></span></div><div class="co-cb">
      ${contacts.participants.filter((p) => !p.removed && p.contact).map((p) => { const c = p.contact; const name = partyDisplayName(p); const bits = name.split(/\s+/).filter(Boolean); return html`<div class="co-prow" data-co-person="${name}" data-co-role="${p.role}"><div class="co-av">${initials(bits[0], bits[1])}</div><div class="co-who"><div class="co-nm">${name}</div><div class="co-em">${[c.email, c.phone].filter(Boolean).join(' · ') || 'Contact through CLA Title'}</div><span class="co-chip ${['Processor', 'Transaction Coordinator', 'Sales Person', 'Sales Team'].includes(p.role) ? 'cla' : ''}">${p.role}</span></div></div>`; })}
    </div></section>
  </div>`;
  return { title: d.fileNumber, tcPage: true, crumbs: [['Orders', '#/orders'], [d.fileNumber, href(d)], ['Overview']], body, mount(root) {
    mountSettlement(root, { api, deal: d, refresh, user, demoLocked: !!ctx.demoLocked });
    $$('[data-tc-action]', root).forEach((b) => b.addEventListener('click', guard(async () => {
      const a = b.dataset.tcAction;
      if (a === 'contract') contractModal();
      else if (a === 'milestones') { const el = $('[data-tc-section="milestones"]', root); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      else if (a === 'emd') emdModal();
      else if (a === 'upload') uploadModal();
      else if (a === 'messages') messageModal();
    })));
    function contractModal() {
      const clients = ci.clients;
      const m = modal('Contract info', html`<form id="tc-ci" class="form-grid"><p class="muted small span2">Every field is stored as a typed, reportable column. No wire instructions, Cash to Close or payoffs here.</p>
        <label>Sale price<input name="purchasePrice" data-money inputmode="decimal" value="${moneyShow(ci.purchasePrice)}"></label><label>Contract date<input type="date" name="contractDate" value="${ci.contractDate || ''}"></label>
        <label>Listing commission %<input name="listingCommissionPct" inputmode="decimal" value="${ci.listingCommissionPct}"></label><label>Listing commission $<input name="listingCommissionAmount" data-money inputmode="decimal" value="${moneyShow(ci.listingCommissionAmount)}"></label>
        <label>Buyer commission %<input name="buyerCommissionPct" inputmode="decimal" value="${ci.buyerCommissionPct}"></label><label>Buyer commission $<input name="buyerCommissionAmount" data-money inputmode="decimal" value="${moneyShow(ci.buyerCommissionAmount)}"></label>
        <label>Seller concessions<input name="sellerConcessions" data-money inputmode="decimal" value="${moneyShow(ci.sellerConcessions)}"></label><label>Settlement date<input type="date" name="closingDate" value="${ci.closingDate || ''}"></label>
        <label>EMD amount<input name="emdAmount" data-money inputmode="decimal" value="${moneyShow(ci.emdAmount)}"></label><label>EMD holder<input name="emdHolder" value="${ci.emdHolder}"></label>
        <h4 class="span2">Clients</h4>${clients.map((c) => html`<fieldset class="span2" data-client="${c.participantId}"><legend>${c.role === 'Client-Buyer' ? 'Buyer' : 'Seller'}</legend><div class="form-grid"><label>First name<input name="firstName" required value="${c.firstName}"></label><label>Last name<input name="lastName" value="${c.lastName}"></label><label>Email<input type="email" name="email" value="${c.email}"></label><label>Phone<input name="phone" type="tel" value="${c.phone}"></label></div></fieldset>`)}
        <div class="span2"><button class="m-btn" type="submit">Save contract info</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`, { wide: true });
      $('#tc-ci', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); ['purchasePrice', 'listingCommissionAmount', 'buyerCommissionAmount', 'sellerConcessions', 'emdAmount'].forEach((k) => { f[k] = moneyAmount(f[k]); });
        await api.updateContractInfo(d.id, f); for (const c of clients) { const box = $(`[data-client="${c.participantId}"]`, e.target); await api.updateClientContact(d.id, c.participantId, { firstName: $('[name=firstName]', box).value, lastName: $('[name=lastName]', box).value, email: $('[name=email]', box).value, phone: $('[name=phone]', box).value }); }
        closeModal(); toast('Contract info and client details saved'); refresh(); }));
    }
    function emdModal() {
      const m = modal('EMD & ALTA tracker', html`<form id="tc-emd" class="form-grid"><p class="span2">Current: ${chips}</p>
        <label class="check span2"><input type="checkbox" name="received" ${emd.received ? raw('checked') : ''}> EMD received</label><label>EMD received date<input type="date" name="receivedDate" value="${emd.receivedDate || ''}"></label><label>EMD received amount<input name="receivedAmount" data-money inputmode="decimal" value="${moneyShow(emd.receivedAmount)}"></label>
        <label class="check span2"><input type="checkbox" name="altaReceived" ${emd.altaReceived ? raw('checked') : ''}> Signed ALTA / settlement statement received</label><label>Signed ALTA date<input type="date" name="altaReceivedDate" value="${emd.altaReceivedDate || ''}"></label>
        <label class="span2">Quick upload signed ALTA (optional)<input type="file" name="altaFile" accept=".pdf,.png,.jpg,.jpeg"></label>
        <p class="muted small span2">Uploading an ALTA marks it received with today’s date unless you choose one. Documents stay in the portal.</p>
        <div class="span2"><button class="m-btn" type="submit">Save EMD / ALTA</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`, { wide: true });
      $('#tc-emd', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); let docId = null; const file = f.altaFile;
        if (file && file.name) { if (file.size > MAX_UPLOAD_BYTES) throw new Error('File is too large for this demo.'); const dataUrl = await readFile(file);
          const doc = await api.addDocument(d.id, { id: sameUploadId(e.target._upload || (e.target._upload = {}), file), name: file.name, description: 'Signed ALTA / settlement statement', mimeType: file.type, size: file.size, dataUrl, visibility: 'staff', docType: 'Settlement statement', folderId: null }); docId = doc.id; }
        await api.updateEmdAlta(d.id, { received: !!f.received, receivedDate: f.receivedDate, receivedAmount: moneyAmount(f.receivedAmount), altaReceived: !!f.altaReceived || !!docId, altaReceivedDate: f.altaReceivedDate, altaDocumentId: docId || undefined }); closeModal(); toast('EMD & ALTA saved'); refresh(); }));
    }
    function uploadModal() {
      const m = modal('Upload miscellaneous document', html`<form id="tc-up" class="form-grid"><label class="span2">File *<input type="file" name="file" required></label><label class="span2">Type<select name="docType" required><option value="">Choose…</option>${options([...new Set(['Contract / addendum', 'Other', ...DOC_TYPES])], '')}</select></label><label class="span2">Note<input name="description" maxlength="500"></label><label class="span2">Who can see it<select name="visibility"><option value="staff">CLA Title staff only</option><option value="all">All parties</option><option value="buyer">Buyer side + CLA</option><option value="seller">Seller side + CLA</option></select></label><div class="span2"><button class="m-btn" type="submit">Upload document</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
      $('#tc-up', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); const file = f.file; if (!file?.name) throw new Error('Choose a file.'); if (file.size > MAX_UPLOAD_BYTES) throw new Error('File is too large for this demo.');
        const dataUrl = await readFile(file); await api.addDocument(d.id, { id: sameUploadId(e.target._upload || (e.target._upload = {}), file), name: file.name, description: f.description, mimeType: file.type, size: file.size, dataUrl, visibility: f.visibility, docType: f.docType }); closeModal(); toast('Document uploaded'); refresh(); }));
    }
    function messageModal() {
      const m = modal('Message all parties', html`<form id="tc-msg" class="form-grid"><p class="span2 notice info">One coordination thread for you, the client(s), processor and agents. Each outside party sees only CLA staff and their own side’s replies — the buyer still never sees the listing agent, and the seller never sees the buyer’s agent.</p><label class="span2">Subject<input name="subject" required maxlength="150" value="${d.street} — coordination update"></label><label class="span2">Message<textarea name="body" required rows="4" maxlength="4000"></textarea></label><div class="span2"><button class="m-btn" type="submit">Start coordination thread</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
      $('#tc-msg', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); await api.createAllPartiesThread(d.id, f); closeModal(); toast('Coordination thread started (in-portal only; nothing emailed)'); location.hash = `#/deals/${d.id}/inbox`; }));
    }
  } };
}

export async function tcTabChrome(ctx, d, active) {
  const [tasks, emailN, portalN] = await Promise.all([
    ctx.api.listTasks(d.id),
    ctx.api.fileEmailUnreadCount ? ctx.api.fileEmailUnreadCount(d.id).catch(() => 0) : 0,
    ctx.api.filePortalUnread ? ctx.api.filePortalUnread(d.id).catch(() => 0) : 0,
  ]);
  const open = tasks.filter((t) => OPEN.includes(t.status)).length;
  return html`<h1 class="co-greet co-greet-sm" data-co-greet>Coordination file</h1><p class="co-sub co-file" data-co-file>${d.street}, ${d.city}, ${d.state} ${d.zip} · Order ${d.fileNumber}</p>
    <nav class="co-seg tc-nav" aria-label="This file" data-tc-nav>${[['overview', 'Overview', href(d), 0], ['tasks', 'Tasks', href(d, 'tasks'), open], ['spouse', 'Spouse', href(d, 'spouse'), 0], ['inbox', 'Messages', href(d, 'inbox'), Number(portalN) || 0], ['email', 'Email', href(d, 'email'), Number(emailN) || 0], ['documents', 'Documents', href(d, 'documents'), 0], ['closing', 'Closing', href(d, 'closing'), 0], ['contacts', 'Contacts', href(d, 'contacts'), 0], ['activity', 'Activity', href(d, 'activity'), 0]].map(([k, l, h, n]) => html`<a class="${active === k ? 'on' : ''}" href="${h}" data-tc-tab="${l}"${active === k ? raw(' aria-current="page"') : ''}>${l}${n ? html` <span class="n">${n}</span>` : ''}</a>`)}</nav>`;
}
