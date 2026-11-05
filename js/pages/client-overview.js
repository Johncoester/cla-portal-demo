// CLIENT OVERVIEW (John, Nov 4: "Love it" / "make it live"): the redesigned File Overview for the buyer (Client-Buyer) and, mirrored, the seller
// (Client-Seller). Same data as before (getDeal / getOrderOverview / listTasks / listMessageRecipients / listMyAgents), no new fields.
// Buyers never see Cash to Close, payoffs or wire details here; the only wire item is the existing Wire instructions button (buyer + staff only, as before).
// app.js draws this page in the light "client shell" (white top bar, no sidebar) because the view sets clientPage.
import { html, raw, $, $$, guard, formData, modal, closeModal, options, fmtMoney, pill, toast } from '../ui.js?v=202611051010';
import { STAGES, fmtPhone, isRefi } from '../data/constants.js?v=202611051010';
import { composeModal } from './compose.js?v=202611051010';
import { slotText } from './dealclosing.js?v=202611051010';

// stage 5 shows as "Wire Fraud Awareness" on the BUYER's view only (display only; the stored stage list is unchanged)
export const clientStageName = (i, side) => (side === 'buyer' && i === 4 ? 'Wire Fraud Awareness' : STAGES[i]);
export const STAGE_GROUPS = [['Getting started', 0, 2], ['Getting ready to close', 3, 6], ['Closing & after', 7, 9]];
// BUYER-ONLY (Nov 4 call, Matt: "this is specific to the buyer user"): a buyer on the file who is not also an agent on it
export const isPureBuyer = (user) => (user.roles || [user.role]).includes('Client-Buyer') && !(user.roles || [user.role]).some((r) => /Agent$/.test(r));
// SELLER MIRROR (John, Nov 4 night): a seller on the file who is not also an agent on it gets the same new interface as the pure buyer
// (task-first Overview, plain tabs, agreements as to-dos, no Agreements / Contacts tab, Share access). File-first: the roles come from THIS file.
export const isPureSeller = (user) => { const r = user.roles || [user.role]; return r.includes('Client-Seller') && !r.includes('Client-Buyer') && !r.some((x) => /Agent$/.test(x)); };
export const isPureClient = (user) => isPureBuyer(user) || isPureSeller(user);
export const BUYER_TAB_LABELS = { overview: 'Overview', tasks: 'To-do list', inbox: 'Messages', documents: 'Documents', closing: 'Closing appointment', activity: 'Activity' };
export const clientSide = (user) => { const r = user.roles || [user.role]; return r.includes('Client-Buyer') ? 'buyer' : r.includes('Client-Seller') ? 'seller' : null; };
const OPEN = ['todo', 'in_progress', 'blocked'];
const longDate = (d) => { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number); if (!y || !m || !dd) return String(d);
  return new Date(y, m - 1, dd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const initials = (f, l) => `${(f || '')[0] || ''}${(l || '')[0] || ''}`.toUpperCase() || '?';
const fact = (k, v, key) => html`<div class="co-fact" data-co-fact="${key}"><div class="k">${k}</div><div class="v">${v || '\u2014'}</div></div>`;
// agreements still to acknowledge, as to-do rows that open the agreement (pure buyer and pure seller)
export const agreementTasks = (d, ag) => ((ag && ag.agreements) || []).filter((a) => !a.myAck).map((a) => ({ id: `ag-${a.code}`, agreement: a.code, title: `Read and acknowledge: ${a.title}`, dueDate: '', href: `#/deals/${d.id}/agreements?a=${a.code}` }));
const tel = (p) => String(p || '').replace(/[^0-9+]/g, '');

// PILL TABS (John, Nov 4: every buyer tab in the same light client layout): one nav for the Overview and every tab page.
// Pure buyer AND pure seller (seller mirror, Nov 4): Overview, To-do list, Messages, Documents, Closing appointment, Activity. A client who is also their
// own agent on the file (self-represented): Overview, Tasks, Messages, Documents, Closing, Agreements, Contacts, Activity.
// active = the route tab ('overview', 'tasks', ...); a buyer's agreement page counts as the To-do list (agreements are to-dos for the buyer).
const TAB_OF = { overview: 'overview', tasks: 'tasks', inbox: 'inbox', documents: 'documents', closing: 'closing', activity: 'activity', agreements: 'agreements', contacts: 'contacts' };
export function clientNav(d, user, active, n = {}) {
  const pure = isPureClient(user); const on = pure && active === 'agreements' ? 'tasks' : TAB_OF[active] || '';
  const tab = (key, href, label, cnt) => html`<a class="${on === key ? 'on' : ''}" href="${href}" data-co-tab="${label}"${on === key ? raw(' aria-current="page"') : ''}>${label}${cnt ? html` <span class="n">${cnt}</span>` : ''}</a>`;
  const B = `#/deals/${d.id}`; const agent = (user.roles || [user.role]).some((r) => /Agent$/.test(r));
  return html`<nav class="co-seg" aria-label="This file" data-co-nav>${pure ? html`${tab('overview', B, BUYER_TAB_LABELS.overview, 0)}${tab('tasks', `${B}/tasks`, BUYER_TAB_LABELS.tasks, n.todo)}${tab('inbox', `${B}/inbox`, BUYER_TAB_LABELS.inbox, n.msg)}${tab('documents', `${B}/documents`, BUYER_TAB_LABELS.documents, n.docs)}${tab('closing', `${B}/closing`, BUYER_TAB_LABELS.closing, 0)}${tab('activity', `${B}/activity`, BUYER_TAB_LABELS.activity, 0)}`
    : html`${tab('overview', B, 'Overview', 0)}${tab('tasks', `${B}/tasks`, 'Tasks', n.tasks)}${tab('inbox', `${B}/inbox`, 'Messages', n.msg)}${tab('documents', `${B}/documents`, 'Documents', n.docs)}${tab('closing', `${B}/closing`, 'Closing', 0)}${tab('agreements', `${B}/agreements`, 'Agreements', n.ag)}${agent ? tab('contacts', `${B}/contacts`, 'Contacts', 0) : ''}${tab('activity', `${B}/activity`, 'Activity', 0)}`}</nav>`;
}
// The top of every client TAB page: the file line and the same pill tabs as the Overview (counts read the same way as there)
export async function clientTabChrome({ api, user }, d, active) {
  const pure = isPureClient(user);
  const [ov, tasks, ag] = await Promise.all([api.getOrderOverview(d.id).catch(() => ({ counts: {} })), pure ? api.listTasks(d.id).catch(() => []) : [], api.listAgreements(d.id).catch(() => null)]);
  const todo = pure ? tasks.filter((t) => t.mine && OPEN.includes(t.status)).length + agreementTasks(d, ag).length : 0; const cnt = ov.counts || {};
  const what = isRefi(d) ? 'refinance' : clientSide(user) === 'buyer' ? 'home purchase' : 'home sale';
  return html`<h1 class="co-greet co-greet-sm" data-co-greet>Your ${what}</h1><p class="co-sub co-file" data-co-file>${d.street}, ${d.city}, ${d.state} ${d.zip} \u00b7 Order ${d.fileNumber}</p>
    ${clientNav(d, user, active, { todo, tasks: cnt.tasks, msg: d.unread || 0, docs: cnt.documents, ag: ag && ag.pending })}`;
}

export async function renderClientOverview(ctx, d, here) {
  const { api, user } = ctx; const side = clientSide(user); const refi = isRefi(d); const pure = isPureClient(user);
  const [ov, ur, tasks, recips, myAgents, ag, shares] = await Promise.all([api.getOrderOverview(d.id), api.listUpdateRequests(d.id).catch(() => []), api.listTasks(d.id).catch(() => []),
    api.listMessageRecipients(d.id).catch(() => []), api.listMyAgents ? api.listMyAgents({ dealId: d.id }).catch(() => []) : [], api.listAgreements(d.id).catch(() => ({ pending: 0 })), api.listSharedAccess ? api.listSharedAccess(d.id).catch(() => []) : []]);
  const canMsg = new Set(recips.map((r) => r.id)); const canWire = side === 'buyer';   // SAME rule as before: the buyer (and staff) only
  const closed = d.status === 'Closed'; const cur = Math.max(0, Math.min(9, Number(d.stage) || 0)); const done = closed ? 10 : cur; const pct = done * 10;
  const what = refi ? 'refinance' : side === 'buyer' ? 'home purchase' : 'home sale';
  // NEXT STEP: the earliest-due open task that is the viewer's own
  const mine = tasks.filter((t) => t.mine && OPEN.includes(t.status)).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const hrefOf = (t) => (['form', 'sign', 'agent'].includes(t.kind) ? `#/deals/${d.id}/tasks/${t.id}` : `#/deals/${d.id}/tasks`);
  // AGREEMENTS AS TASKS (buyer, Nov 4 call; seller mirrored): each agreement still to acknowledge is a to-do that opens the agreement; no Agreements tab for either
  const agTasks = pure ? agreementTasks(d, ag) : [];
  const todo = [...mine.map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate, href: hrefOf(t) })), ...agTasks];
  const next = todo[0];
  // ---------- closing team ----------
  const ps = d.participants.filter((p) => !p.removed && p.contact); const meC = ps.find((p) => p.contact.profileId === user.id);
  const row = (p, chip, { cla = false, you = false, via = false, big = false } = {}) => { const c = p.contact; const pid = c.profileId; const name = `${c.firstName} ${c.lastName}`.trim();
    const em = via ? 'Contact through your agent' : c.contactHidden ? 'Contact through CLA Title' : [c.email, fmtPhone(c.phone)].filter(Boolean).join(' \u00b7 ');
    const acts = you || via || c.contactHidden ? '' : html`<div class="co-acts">${pid && canMsg.has(pid) ? html`<button type="button" data-co-message="${pid}">Message</button>` : ''}${c.phone ? html`<a href="tel:${tel(c.phone)}" data-co-call>Call</a>` : ''}</div>`;
    return html`<div class="${big ? 'co-ya' : 'co-prow'}" data-co-person="${name}" data-co-role="${chip}"${you ? raw(' data-co-you') : ''}${via ? raw(' data-co-via-agent') : ''}><div class="co-av" aria-hidden="true">${initials(c.firstName, c.lastName)}</div>
      <div class="co-who"><div class="co-nm">${name}${you ? html` <span class="co-you">(you)</span>` : ''}</div>${c.company && !via ? html`<div class="co-em">${c.company}</div>` : ''}<div class="co-em">${em}</div><span class="co-chip${cla ? ' cla' : ''}">${chip}</span></div>${acts}</div>`; };
  const ownAgentRole = side === 'buyer' ? 'Buyer Agent' : 'Listing Agent'; const otherAgentRole = side === 'buyer' ? 'Listing Agent' : 'Buyer Agent';
  const myRole = side === 'buyer' ? 'Client-Buyer' : 'Client-Seller'; const otherRole = side === 'buyer' ? 'Client-Seller' : 'Client-Buyer';
  const B = refi ? 'Borrower' : 'Buyer'; const L = { 'Client-Buyer': B, 'Client-Seller': 'Seller', 'Buyer Agent': "Buyer's agent", 'Listing Agent': 'Listing agent' };
  const ownAgents = ps.filter((p) => p.role === ownAgentRole && p.contactId !== (meC && meC.contactId));
  const selfAgent = ps.some((p) => p.role === ownAgentRole && meC && p.contactId === meC.contactId);
  // CLA Title & Escrow: the processor, the sales rep(s) and a transaction coordinator who works for CLA (company on the contact)
  const claTc = (p) => /\bCLA\b/i.test(p.contact.company || '');
  const cla = [...ps.filter((p) => p.role === 'Processor').map((p) => [p, 'Settlement processor']), ...ps.filter((p) => ['Sales Person', 'Sales Team'].includes(p.role)).map((p) => [p, 'CLA Sales Rep']),
    ...ps.filter((p) => p.role === 'Transaction Coordinator' && claTc(p)).map((p) => [p, 'Transaction coordinator'])];
  const seenCla = new Set(); const claRows = cla.filter(([p]) => (seenCla.has(p.contactId) ? false : seenCla.add(p.contactId)));
  const mySide = [...ps.filter((p) => p.role === myRole && p.contactId !== (meC && meC.contactId)).map((p) => [p, L[myRole]]), ...ps.filter((p) => p.role === 'Transaction Coordinator' && !claTc(p)).map((p) => [p, 'Transaction coordinator']), ...(side === 'buyer' ? ps.filter((p) => p.role === 'Lender').map((p) => [p, 'Lender']) : [])];
  const other = pure ? [] : [...ps.filter((p) => p.role === otherAgentRole).map((p) => row(p, L[otherAgentRole])), ...ps.filter((p) => p.role === otherRole).map((p) => row(p, L[otherRole], { via: true }))];
  // "Your agent" for both (seller mirror, Nov 4): the buyer's agent for the buyer, the listing agent for the seller. Neither ever sees the other side's agent (adapter drops the row).
  const team = html`${ownAgents.map((p) => row(p, 'Your agent', { big: true }))}
    ${claRows.length ? html`<div class="co-sec">CLA Title &amp; Escrow</div>${claRows.map(([p, c]) => row(p, c, { cla: true }))}` : ''}
    ${mySide.length || meC ? html`<div class="co-sec">Your side</div>${mySide.map(([p, c]) => row(p, c))}${meC ? row(meC, selfAgent ? `${L[myRole]} + ${L[ownAgentRole]}` : L[myRole], { you: true }) : ''}` : ''}
    ${other.length ? html`<div class="co-sec">Other side of the deal</div>${other}` : ''}`;
  // ---------- progress ----------
  const pills = STAGES.map((s, i) => { const st = i < done ? 'done' : i === cur && !closed ? 'now' : ''; return html`<span class="co-pill ${st}" data-co-stage="${i}" data-co-state="${st || 'upcoming'}"><i>${st === 'done' ? raw('&#10003;') : i + 1}</i>${clientStageName(i, side)}</span>`; });
  const groups = STAGE_GROUPS.map(([label, a, b]) => { const st = done > b ? ['Done', ''] : done >= a ? ['In progress', 'w'] : ['Coming up', 'w'];
    return html`<div data-co-group="${label}"><span class="co-gl">${label} (steps ${a + 1}\u2013${b + 1})</span><span class="co-badge ${st[1]}">${st[0]}</span></div>`; });
  const sc = d.scheduledClosing;
  const msgCount = d.unread || 0; const cnt = ov.counts || {};
  const body = html`<div class="co-page" data-client-overview="${side}">
    <h1 class="co-greet" data-co-greet>Hi ${user.firstName}, here\u2019s your ${what}</h1><p class="co-sub">${d.street}, ${d.city}, ${d.state} ${d.zip} \u00b7 Order ${d.fileNumber}</p>
    ${clientNav(d, user, 'overview', { todo: todo.length, tasks: cnt.tasks, msg: msgCount, docs: cnt.documents, ag: ag && ag.pending })}
    ${d.selfRep ? html`<div class="notice info" data-self-rep>You are the <strong>${d.myRoleLabel}</strong> on this file. Your tasks as the client and as the agent are in one list; the history records which capacity you acted in.</div>` : ''}
    ${sc ? html`<div class="notice info" data-scheduled-closing><strong>Closing scheduled:</strong> ${slotText(sc.at)} &middot; ${sc.location}${sc.note ? html` &middot; ${sc.note}` : ''} <a href="#/deals/${d.id}/closing">details</a></div>` : ''}
    ${!pure && ag && ag.pending ? html`<div class="notice warn" data-agreements-pending>You have <strong>${ag.pending}</strong> agreement(s) to read and acknowledge (including the Wire Fraud Warning). <a href="#/deals/${d.id}/agreements">Open Agreements</a></div>` : ''}
    ${pure && side === 'buyer' && ov.emdPending ? html`<div class="co-emd" role="status" data-co-emd><span class="co-emd-ic" aria-hidden="true">&#36;</span><span><strong>CLA Title hasn\u2019t received your earnest money deposit yet.</strong>${!refi && d.emdDueDate ? html` It was due ${longDate(d.emdDueDate)}.` : ''} Once it arrives, CLA Title sends you the receipt and this note goes away.</span></div>` : ''}
    <section class="co-card" data-co-progress><div class="co-ch">Your closing progress<span class="r">${ov.canRequestUpdate ? html`<button type="button" class="co-btn g" data-co-ask>Ask for an update</button>` : ''}</span></div><div class="co-cb">
      <div class="co-status"><div class="co-ring" style="background:conic-gradient(var(--co-bi) 0 ${pct}%, var(--co-bs) ${pct}% 100%)" data-co-ring="${done}"><div><span><b>${done}/10</b>steps done</span></div></div>
        <div><div class="co-l1" data-co-step>${closed ? 'All 10 steps are done: your file is closed' : `You\u2019re on step ${cur + 1} of 10: ${clientStageName(cur, side)}`}</div><div class="co-l2">${d.status !== 'Open' && !closed ? `File status: ${d.status}. ` : ''}CLA Title &amp; Escrow keeps this up to date as your file moves along.</div>
          <div class="co-pills" data-co-pills>${pills}</div></div></div>
      <div class="co-acc">${groups}</div>
      ${ur.length ? html`<div class="co-sec">Your update requests</div><ul class="co-ur" id="update-requests">${ur.map((r) => html`<li data-ur="${r.id}" data-ur-status="${r.status}"><strong>${r.topic}</strong>${r.note ? html` <span class="muted small">${r.note}</span>` : ''} ${r.status === 'answered' ? html`${pill('answered', 'ok')}<br>${r.response}` : pill('waiting for CLA Title', 'warn')}</li>`)}</ul>` : ''}
    </div></section>
    <section class="co-card" data-co-property><div class="co-ch">${d.street}${canWire ? html`<span class="r"><button type="button" class="co-btn g" id="wirebtn">Wire instructions</button></span>` : ''}</div><div class="co-cb">
        <div class="co-city">${d.city}, ${d.state} ${d.zip} \u00b7 Order # ${d.fileNumber}</div>
        <div class="co-facts" data-co-facts>${fact('Open date', longDate(d.openDate), 'open')}${refi ? '' : fact(side === 'buyer' ? 'Purchase price' : 'Sale price', fmtMoney(d.purchasePrice), 'price')}${side === 'buyer' ? fact('Loan amount', fmtMoney(d.loanAmount), 'loan') : ''}${fact('Settlement date', longDate(d.closingDate) || 'Not set yet', 'settlement')}${refi || side !== 'buyer' ? '' : fact('EMD due', longDate(d.emdDueDate), 'emd-due')}${fact('County', d.county, 'county')}</div>
        <div class="co-agentline"><img src="assets/img/logo-icon.png" alt=""><span>Your settlement agent: <b>CLA Title &amp; Escrow</b></span></div></div></section>
    <section class="co-next" data-co-next="${next ? next.id : ''}" data-co-outstanding="${todo.length}"><div class="co-ic" aria-hidden="true">&#10004;</div><div class="co-next-main">
      <div class="k">${todo.length ? `Your outstanding tasks (${todo.length})` : 'Next step for you'}</div>
      ${todo.length ? html`<ul class="co-todo">${todo.map((t, i) => html`<li data-co-todo="${t.id}"${t.agreement ? html` data-co-agreement="${t.agreement}"` : ''}><span class="t">${t.title}</span><span class="d">${t.dueDate ? html`Due <span ${i === 0 ? raw('data-co-next-due') : ''}>${longDate(t.dueDate)}</span>` : t.agreement ? 'Read and acknowledge' : 'No due date'}</span><a class="co-btn ${i === 0 ? 'p' : 'g'}" href="${t.href}" ${i === 0 ? raw('data-co-start') : ''}>${i === 0 ? 'Start this step' : 'Open'}</a></li>`)}</ul>`
        : html`<div class="t">Nothing is needed from you right now</div><div class="d">We will let you know when there is something to do.</div>`}</div></section>
    <section class="co-card" data-co-team><div class="co-ch">Your closing team${ov.canShareAccess ? html`<span class="r"><button type="button" class="co-btn g" id="shareaccess">Share access</button></span>` : ''}</div><div class="co-cb">${team}
        ${ov.canShareAccess && shares.length ? html`<div class="co-sec">You shared access with</div><ul class="co-ur" data-co-shared>${shares.map((z) => html`<li data-co-share="${z.email}">${z.firstName} ${z.lastName} <span class="muted small">${z.email} \u00b7 ${z.permission} \u00b7 recorded in the portal, nothing sent</span></li>`)}</ul>` : ''}</div></section>
    </div>`;
  return { title: d.fileNumber, clientPage: { deal: d, side }, crumbs: [...here, ['Overview']], body, mount(root) {
    $$('[data-co-message]', root).forEach((b) => b.addEventListener('click', guard(() => composeModal({ api, deal: d, go: ctx.go, user }, { title: 'New Conversation', to: b.dataset.coMessage, withFiles: true }))));
    const ask = $('[data-co-ask]', root); if (ask) ask.addEventListener('click', () => { const m = modal('Ask for an update', html`<form id="requpdate" class="form-grid" data-request-update><label class="span2">What would you like an update on?<select name="topic" required><option value="">Choose&hellip;</option>${options(ov.updateTopics, '')}</select></label>
      <label class="span2">Note (optional)<input name="note" maxlength="1000"></label><p class="muted small span2">CLA Title &amp; Escrow answers here in the portal.</p><div class="span2"><button class="m-btn" type="submit">Submit Request</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
      $('#requpdate', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); if (!f.topic) throw new Error('Pick what you want an update on.'); await api.requestUpdate(d.id, f); closeModal(); toast('Update requested. CLA Title will answer here.'); ctx.refresh(); })); });
    const wb = $('#wirebtn', root); if (wb) wb.addEventListener('click', guard(() => ctx.wireModal(api, d)));
    const sa = $('#shareaccess', root); if (sa) sa.addEventListener('click', () => ctx.shareModal({ buyer: pure && side === 'buyer', seller: pure && side === 'seller' }));
  } };
}
