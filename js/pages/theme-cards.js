// CARD THEME (John, Nov 3; the DEFAULT look since "Apply it"): the extra markup the card theme adds. Only used when body.theme-cards is on (theme.js);
// with ?theme=default nothing here is rendered and the pages look as before. FAKE DATA ONLY. Inline SVG icons (no CDN, no icon font).
// Figures that the portal does not store yet (title search / commitment, cash to close, wire status, payoffs, loan type, rate) are MOCKUP
// SAMPLES derived from the fake order (sampleFacts below); every one of them carries a visible "sample" tag (SAMPLE) on the page.
import { html, raw, fmtDate, fmtMoney } from '../ui.js?v=202611061447';
import { STAGES, isRefi, localDate } from '../data/constants.js?v=202611061447';
import { phaseOf, PHASES } from '../data/agent-portal.js?v=202611061447';
import { placeText } from '../data/cla-offices.js?v=202611061447';
import { modAccess } from '../data/modules.js?v=202611061447';

// ---------- icons: 24x24, thin 1.5 stroke, currentColor ----------
const P = {
  dashboard: '<rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/>',
  orders: '<rect x="5" y="4.5" width="14" height="16.5" rx="1.5"/><path d="M9 4.5V3h6v1.5"/><path d="M8.5 12.5l2.2 2.2 4.8-4.8"/>',
  tasks: '<path d="M4 6.5l1.5 1.5L8 5.5"/><path d="M4 12.5l1.5 1.5L8 11.5"/><path d="M4 18.5l1.5 1.5L8 17.5"/><path d="M11 7h9M11 13h9M11 19h9"/>',
  'task-grid': '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15M15 4.5v15"/>',
  'users/new': '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20c.6-3.6 3.2-5.5 6.5-5.5 1.6 0 3 .4 4.1 1.2"/><path d="M18 14v6M15 17h6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M15.5 4.8a3.5 3.5 0 010 6.4M18 14.8c2 .7 3.2 2.5 3.5 5.2"/>',
  teams: '<circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="4.5" r="1.8"/><circle cx="12" cy="19.5" r="1.8"/><circle cx="4.5" cy="12" r="1.8"/><circle cx="19.5" cy="12" r="1.8"/><path d="M12 6.3v3.5M12 14.2v3.5M6.3 12h3.5M14.2 12h3.5"/>',
  crm: '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16.5c.5-1.6 1.7-2.5 3.2-2.5s2.7.9 3.2 2.5M14.5 10h3.5M14.5 13.5h3.5"/>',
  library: '<path d="M4.5 5.5h4.5v14H4.5zM9 5.5h4.5v14H9z"/><path d="M14.2 6.4l4.2-1.3 3.4 13.6-4.2 1.2z"/>',
  activity: '<path d="M3 12.5h4l2.5-6 4.5 12 2.5-6H21"/>',
  templates: '<rect x="7" y="3.5" width="12.5" height="15" rx="1.5"/><path d="M4.5 7v12a1.5 1.5 0 001.5 1.5h10"/><path d="M10 8h6.5M10 11.5h6.5M10 15h4"/>',
  outbox: '<path d="M3.5 13.5l2.5-8h12l2.5 8v5a1.5 1.5 0 01-1.5 1.5h-14a1.5 1.5 0 01-1.5-1.5z"/><path d="M3.5 13.5h5l1 2h5l1-2h5"/>',
  overview: '<path d="M3.5 11L12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
  inbox: '<rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="M4 6.5l8 6 8-6"/>',
  documents: '<path d="M6 3.5h8l4.5 4.5v12.5H6z"/><path d="M14 3.5V8h4.5M9 12h6.5M9 15.5h6.5"/>',
  closing: '<rect x="3.5" y="5.5" width="17" height="15" rx="1.5"/><path d="M3.5 10h17M8 3.5v4M16 3.5v4"/><path d="M9.5 15l1.8 1.8 3.4-3.4"/>',
  contacts: '<rect x="5" y="3.5" width="14.5" height="17" rx="1.5"/><circle cx="12.2" cy="10" r="2.5"/><path d="M8.5 16.5c.6-1.9 2-2.9 3.7-2.9s3.1 1 3.7 2.9M3.5 7.5h3M3.5 12h3M3.5 16.5h3"/>',
  agreements: '<path d="M6 3.5h8l4.5 4.5v12.5H6z"/><path d="M14 3.5V8h4.5"/><path d="M8.5 16.5c1.2-1.8 2.2-2.6 3-2.4.9.3-.3 2.2.6 2.4.7.1 1.3-1 2-1.1.6 0 .8.7 1.9.7"/>',
  accounting: '<rect x="5" y="3.5" width="14" height="17" rx="1.5"/><rect x="7.5" y="6" width="9" height="3.5" rx=".5"/><path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 16.5h.01M12 16.5h.01M15.5 16.5h.01"/>',   // Accounting tab (calculator)
  modules: '<rect x="3.5" y="6" width="17" height="5" rx="2.5"/><circle cx="18" cy="8.5" r="1.6"/><rect x="3.5" y="13" width="17" height="5" rx="2.5"/><circle cx="6" cy="15.5" r="1.6"/>',   // Modules page (two toggles)
  underwriters: '<path d="M12 3v18"/><path d="M5 7h14"/><path d="M5 7l-2.5 6a3 3 0 0 0 5 0z"/><path d="M19 7l-2.5 6a3 3 0 0 0 5 0z"/><path d="M8 21h8"/>',   // Underwriter splits (scales)
  'contact-us': '<path d="M6.5 3.5h3l1.5 4-2 1.3a10 10 0 005.2 5.2l1.3-2 4 1.5v3a1.5 1.5 0 01-1.6 1.5C10.4 17.6 6.4 13.6 5 6.1a1.5 1.5 0 011.5-2.6z"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 004 0"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="10" rx="1.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 017 0v3"/><circle cx="12" cy="15.5" r="1.2"/>',
};
export const icon = (name, cls = 'tc-ico') => raw(`<svg class="${cls}" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] || P.documents}</svg>`);
const LOCK_FILLED = raw('<svg class="tc-lock" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7 10V7.6a5 5 0 0110 0V10h.6c.8 0 1.4.6 1.4 1.4v8.2c0 .8-.6 1.4-1.4 1.4H6.4c-.8 0-1.4-.6-1.4-1.4v-8.2C5 10.6 5.6 10 6.4 10zm2.2 0h5.6V7.6a2.8 2.8 0 00-5.6 0zM12 13.5a1.5 1.5 0 00-.8 2.8V18h1.6v-1.7a1.5 1.5 0 00-.8-2.8z"/></svg>');

// ---------- sample facts the portal does not store yet (deterministic from the fake order) ----------
const hash = (s) => [...String(s || '')].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
const addDays = (iso, n) => (iso ? new Date(Date.parse(String(iso).slice(0, 10) + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10) : '');
const days = (from, to) => Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 864e5);
export function sampleFacts(d) {
  const h = hash(d.fileNumber); const stage = Number(d.stage) || 0; const closed = d.status === 'Closed' || stage >= 9;
  const price = Number(d.purchasePrice) || 0; const loan = Number(d.loanAmount) || 0; const emd = Number(d.emdAmount) || 0;
  // title: search after intake, a commitment once the closing is being scheduled, exceptions cleared during processing
  const searched = stage >= 1 || closed; const committed = stage >= 3 || closed; const final = stage >= 5 || closed;
  const exceptions = final ? 0 : committed ? 1 + (h % 2) : 0; const liens = 1 + (h % 2);
  const title = { status: !searched ? 'Search Ordered' : final ? 'Title Clear' : exceptions ? `${exceptions} Open Exception${exceptions === 1 ? '' : 's'}` : 'Search Complete',
    searchDate: searched ? addDays(d.openDate, 3) : '', commitmentDate: committed ? addDays(d.openDate, 10) : '', final,
    liens: `${liens} lien${liens === 1 ? '' : 's'}${final ? ' (payoff ordered)' : ''} · 0 judgments`, exceptions };
  // money: closing costs ~1.57% of the price (rounded to $50); cash to close = price - loan - EMD + costs
  const costs = Math.round((price || loan) * 0.0157 / 50) * 50; const emdIn = stage >= 1 || closed ? emd : 0;
  const cash = isRefi(d) ? Math.max(0, costs - 0) : Math.max(0, price - loan - emdIn + costs);
  const wire = closed || stage >= 8 ? 'Wire received' : stage >= 4 ? 'Instructions sent' : 'Not requested yet';
  const payoffs = closed ? 'Paid at closing' : stage >= 3 ? `${liens} payoff${liens === 1 ? '' : 's'} ordered` : 'Not ordered yet';
  // loan: type from the loan-to-value, rate from the file number (fake); locked once the commitment is out
  const ltv = price ? loan / price : 0.8; const rate = (5.875 + (h % 5) * 0.125).toFixed(3);
  const lender = { type: !loan ? 'Cash purchase' : ltv > 0.9 ? 'FHA 30-yr fixed' : 'Conventional 30-yr fixed', rate, locked: committed, ltv: loan && price ? Math.round(ltv * 100) + '% LTV' : '' };
  return { title, costs, cash, emdIn, wire, payoffs, lender };
}

// a friendlier headline for each stage (the real stage name is shown right under it)
const STAGE_LABEL = ['Order Opened', 'EMD Receipt', 'Buyer Info Received', 'Scheduling Closing', 'Cash to Close Awareness', 'Processing', 'Final Doc Review', 'Clear to Close', 'Funding Authorized', 'Funds Disbursed'];

// ---------- small building blocks (white inset header with one big value, then label / value fields) ----------
const head = (big, sub, { lock = false, attr = '' } = {}) => html`<div class="tc-head"${raw(attr)}><div class="tc-big">${lock ? LOCK_FILLED : ''}<span>${big}</span></div>${sub ? html`<div class="tc-sub">${sub}</div>` : ''}</div>`;
const f = (label, value, attr = '') => html`<div class="tc-f"${raw(attr)}><div class="tc-l">${label}</div><div class="tc-v">${value === '' || value == null ? '\u2014' : value}</div></div>`;
const cols = (left, right) => html`<div class="tc-body tc-cols"><div>${left}</div><div>${right}</div></div>`;
// the visible tag on every made-up figure (title dates, wire status, payoffs, cash to close, closing costs, loan type, rate)
export const SAMPLE = raw('<span class="tc-sample" data-tc-sample title="Sample figure: the portal does not store this yet">sample</span>');
const sm = (v) => html`${v}${SAMPLE}`;
const card = (key, inner) => html`<section class="tc-card" data-tc-card="${key}">${inner}</section>`;
const shortDate = (iso) => (iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
const longDate = (iso) => (iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '');
const timeOf = (at) => (at && at.length > 10 ? new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '');

// access dot: active = has a portal login and has done something on this file; invited = has a login (or a recorded Share Access) but nothing yet;
// not invited = no portal login. Computed from what this viewer can see.
function accessOf(p, ctx) {
  const c = p.contact || {}; if (p.removed) return ['removed', 'Removed'];
  if (c.profileId) return ctx.activeNames.has(`${c.firstName} ${c.lastName}`) || ctx.donePids.has(p.id) ? ['active', 'Active'] : ['invited', 'Invited'];
  if (c.email && ctx.invitedEmails.has(String(c.email).toLowerCase())) return ['invited', 'Invited'];
  return ['none', 'Not invited'];
}

// the themed Order Summary for one order (overview tab). `canWire` = the existing wire rule (CLA staff + the buyer, never an agent).
export function orderSummary({ d, user, ov, inv = [], tasks = [], canWire, staffView }) {
  const s = sampleFacts(d); const refi = isRefi(d); const ph = phaseOf(d); const stage = Number(d.stage) || 0;
  const today = localDate(); const sc = d.scheduledClosing; const closeOn = (sc && sc.at ? sc.at.slice(0, 10) : '') || d.closingDate || '';
  const toGo = closeOn ? days(today, closeOn) : null;
  const buyerSide = staffView || (user.roles || [user.role]).some((r) => r === 'Client-Buyer' || r === 'Buyer Agent');
  // 1. price
  const c1 = card('price', html`${head(refi ? fmtMoney(d.loanAmount) || '\u2014' : fmtMoney(d.purchasePrice) || '\u2014', refi ? 'Loan Amount · Refinance' : html`Purchase Price <span class="tc-slash">/</span> ${d.transactionType || 'Purchase'}`)}
    ${cols(html`${f('Loan Amount', fmtMoney(d.loanAmount))}${refi ? '' : f('Earnest Money Deposit', d.emdAmount == null || d.emdAmount === '' ? '' : html`${fmtMoney(d.emdAmount)}${d.emdDueDate ? html` <span class="tc-note">due ${fmtDate(d.emdDueDate)}</span>` : ''}`)}`,
      html`${refi ? '' : f('Sales Price', fmtMoney(d.purchasePrice))}${f('County', d.county ? `${d.county}, ${d.state}` : '')}`)}`);
  // 2. stage + phase progress
  const steps = html`<ol class="tc-phases" aria-label="Closing progress">${ph.steps.map((st) => html`<li class="${st.state}" title="${st.name}"><span></span>${st.name}</li>`)}</ol>`;
  const c2 = card('stage', html`${head(d.status !== 'Open' ? d.status : staffView ? STAGE_LABEL[stage] || STAGES[stage] : ph.phaseName, staffView ? html`Stage ${stage + 1} of ${STAGES.length} <span class="tc-slash">/</span> ${STAGES[stage]} <span class="tc-slash">/</span> ${ph.phaseName}` : html`Phase ${ph.phase + 1} of ${ph.steps.length} <span class="tc-slash">/</span> your closing progress`, { attr: ` data-tc-stage="${stage}"` })}
    <div class="tc-body">${cols(html`${f('Opened', fmtDate(d.openDate))}${f('Title Status', sm(s.title.status))}`, html`${f('Open Conditions', String(d.openTasks ?? (ov && ov.counts ? ov.counts.tasks : '')), ' data-tc-open-conditions')}${f('Phase', ph.phaseName)}`)}${steps}</div>`);
  // 3. settlement
  const c3 = card('settlement', html`${head(closeOn ? shortDate(closeOn) : 'Not scheduled', closeOn ? html`Settlement <span class="tc-slash">/</span> ${longDate(closeOn)}` : 'Settlement date')}
    ${cols(html`${f('Closing Location', sc && sc.location ? placeText(sc.location, sc.officeId, sc.officeName) : closeOn ? 'CLA Title office (to be confirmed)' : '')}${f('Closing Time', sc ? timeOf(sc.at) : closeOn ? 'To be confirmed' : '')}`,
      html`${f('Days to Close', toGo == null ? '' : toGo < 0 ? `${-toGo} days ago` : toGo === 0 ? 'Today' : `${toGo} day${toGo === 1 ? '' : 's'}`)}${f('Status', sc ? 'Confirmed' : closeOn ? 'Requested' : 'Not requested')}`)}`);
  // 4. title (sample)
  const c4 = modAccess('title') === 'live' ? card('title', html`${head(sm(s.title.status), s.title.final ? html`Commitment final <span class="tc-slash">/</span> Title insurance` : 'Title search & commitment', { lock: s.title.final, attr: s.title.final ? ' data-tc-commitment-final' : '' })}
    ${cols(html`${f('Search Date', sm(fmtDate(s.title.searchDate) || 'Pending'))}${f('Commitment Date', sm(fmtDate(s.title.commitmentDate) || 'Not issued'))}`, html`${f('Liens / Judgments', sm(staffView ? s.title.liens : s.title.liens.replace(' (payoff ordered)', '')))}${f('Open Exceptions', sm(String(s.title.exceptions)))}`)}`) : '';
  // 5. cash to close: ONLY where the existing wire rule allows it (CLA staff + the buyer). Never rendered for agents or sellers.
  const c5 = canWire ? card('cash', html`${head(html`<span class="tc-dim">Cash to Close:</span> ${fmtMoney(s.cash)}${SAMPLE}`, html`Sample estimate <span class="tc-slash">/</span> buyer funds due at settlement`)}
    ${cols(html`${f('Deposits Received', s.emdIn ? `${fmtMoney(s.emdIn)} EMD` : '$0')}${f('Wire Status', sm(s.wire))}`, html`${f('Est. Closing Costs', sm(fmtMoney(s.costs)))}${staffView ? f('Payoffs', sm(s.payoffs)) : f('Wire Instructions', 'Use the Wire instructions button below')}`)}`) : '';
  // 6. parties + access dots
  const ROLES = [['Client-Buyer', refi ? 'Borrower' : 'Buyer'], ['Client-Seller', 'Seller'], ['Buyer Agent', "Buyer's Agent"], ['Listing Agent', 'Listing Agent'], ['Lender', 'Lender']];
  const actx = { activeNames: new Set((ov ? ov.recentActivity || [] : []).map((a) => a.actorName).filter(Boolean)), donePids: new Set(tasks.filter((t) => t.status === 'done' && t.participantId).map((t) => t.participantId)),
    invitedEmails: new Set(inv.map((i) => String(i.email || '').toLowerCase())) };
  const ps = ROLES.flatMap(([r, label]) => d.participants.filter((p) => p.role === r && p.contact).map((p) => ({ p, label })));
  const cells = ps.map(({ p, label }) => { const [k, txt] = accessOf(p, actx); return html`<div class="tc-party" data-tc-party="${p.role}"><div class="tc-l">${label}</div><div class="tc-v">${p.contact.firstName} ${p.contact.lastName}</div><div class="tc-access" data-access="${k}"><span class="tc-dot ${k}"></span>${txt}</div></div>`; });
  const c6 = card('parties', html`${head(`${ps.length} ${ps.length === 1 ? 'Party' : 'Parties'}`, html`Buyer <span class="tc-slash">/</span> Seller <span class="tc-slash">/</span> Agents <span class="tc-slash">/</span> Lender`)}
    <div class="tc-body"><div class="tc-party-grid">${cells.length ? cells : html`<p class="tc-l">Nobody added yet.</p>`}</div>
    <div class="tc-legend"><span><span class="tc-dot active"></span>Active</span><span><span class="tc-dot invited"></span>Invited</span><span><span class="tc-dot none"></span>Not invited</span></div></div>`);
  // 7. lender (rate / loan type only to CLA staff and the buyer side)
  const lp = d.participants.find((p) => p.role === 'Lender' && p.contact); const lname = d.lenderName || (lp ? lp.contact.company : ''); const officer = d.lenderContact || (lp ? `${lp.contact.firstName} ${lp.contact.lastName}` : '');
  const c7 = card('lender', html`${buyerSide && Number(d.loanAmount) ? head(html`${s.lender.locked ? 'Locked' : 'Floating'} ${s.lender.rate}%${SAMPLE}`, html`${s.lender.type} (sample)${s.lender.ltv ? html` <span class="tc-slash">/</span> ${s.lender.ltv}` : ''}`, { lock: s.lender.locked }) : head(lname || 'No lender yet', 'Lender')}
    ${cols(html`${f('Lender', lname || 'Not specified')}${f('Loan Officer', officer || 'Not specified')}`, buyerSide ? html`${f('Loan Type', Number(d.loanAmount) ? sm(s.lender.type) : 'Cash')}${f('Rate', Number(d.loanAmount) ? sm(`${s.lender.rate}% ${s.lender.locked ? '(locked)' : '(floating)'}`) : '')}` : html`${f('Loan Amount', fmtMoney(d.loanAmount))}`)}`);
  return html`<div class="tc-summary" data-tc-summary>
    <div class="tc-title-row"><h1 class="tc-page-title">Order Summary</h1></div>
    <div class="tc-grid"><div class="tc-col">${c1}${c3}${c4}${c7}</div><div class="tc-col">${c2}${c5}${c6}</div></div>
    <p class="tc-footnote" data-tc-footnote>Figures tagged ${SAMPLE} (${[...['title search and commitment'], ...(canWire ? ['cash to close', 'closing costs', 'wire status'] : []), ...(staffView ? ['payoffs'] : []), ...(buyerSide && Number(d.loanAmount) ? ['loan type and rate'] : [])].join(', ')}) are samples: the portal does not store them yet. Everything else is the order's own (fake) data.</p>
    <h2 class="tc-section">Order details</h2></div>`;
}

// ---------- dashboard: four clickable summary cards computed from the orders this person can see ----------
export function dashCards(deals) {
  const today = localDate(); const dow = (new Date(today + 'T12:00:00').getDay() + 6) % 7;   // Monday = 0
  const mon = addDays(today, -dow); const sun = addDays(mon, 6);
  const open = deals.filter((d) => d.status === 'Open');
  const thisWeek = open.filter((d) => d.closingDate && d.closingDate >= mon && d.closingDate <= sun);
  const lenderWait = open.filter((d) => Number(d.loanAmount) > 0 && (!(d.lenderName || d.lenderContact || d.lenderEmail) || d.stage === 8));
  const overdue = open.reduce((n, d) => n + (d.overdueTasks || 0), 0);
  const pipe = open.reduce((n, d) => n + (Number(isRefi(d) ? d.loanAmount : d.purchasePrice || d.loanAmount) || 0), 0);
  const money = pipe >= 1e6 ? `$${(pipe / 1e6).toFixed(1)}M` : pipe >= 1e3 ? `$${Math.round(pipe / 1e3)}K` : `$${pipe}`;
  const c = (key, href, big, label, sub, ico) => html`<a class="tc-card tc-dash" href="${href}" data-tc-dash="${key}"><div class="tc-head"><div class="tc-big"><span data-tc-value>${big}</span> <span class="tc-big-label">${label}</span></div><div class="tc-sub">${sub}</div></div><div class="tc-body tc-dash-foot">${icon(ico)}<span>View</span></div></a>`;
  return html`<div class="tc-dash-row" data-tc-dash-row>
    ${c('week', '#/orders?s=Open', thisWeek.length, 'Closing This Week', html`${fmtDate(mon)} <span class="tc-slash">/</span> ${fmtDate(sun)}`, 'closing')}
    ${c('lender', '#/orders?s=Open', lenderWait.length, 'Waiting on Lender', 'Loan with no lender yet, or at funding', 'documents')}
    ${c('overdue', '#/tasks', overdue, `Overdue Task${overdue === 1 ? '' : 's'}`, 'Open tasks past their due date', 'tasks')}
    ${c('pipeline', '#/orders?s=Open', money, 'in Pipeline', `${open.length} open order${open.length === 1 ? '' : 's'}`, 'activity')}</div>`;
}
export { PHASES };
