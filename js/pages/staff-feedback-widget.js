/* Portal conversation. One composer, one explicit Send, and replies only after they are saved.
 * A phone app can use the same thread later. This panel does not read order files or attachment bytes. */
import { conversationTitle, newId } from '../data/staff-feedback.js?v=202611080400';
import { launcherAllowed, loadDraft, nextWidgetState, saveDraft } from '../data/staff-feedback-widget-state.js?v=202611080400';

const HOST_ID = 'claStaffFeedbackRoot';
let state = { userId: null, open: false, reportId: '' };
let composing = false;
let live = null;
let returnFocus = null;
let watchToken = 0;
let paintGen = 0;

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};
const store = () => (typeof sessionStorage !== 'undefined' ? sessionStorage : null);

function unmount() {
  watchToken += 1;
  paintGen += 1;
  const root = document.getElementById(HOST_ID);
  if (root) root.remove();
  document.body.classList.remove('cla-sf-open');
  document.removeEventListener('keydown', onKey);
  if (typeof window !== 'undefined') delete window.__claLocalDemoReply;
  live = null;
  composing = false;
  state = { userId: null, open: false, reportId: '' };
}

function readForm() {
  if (!live) return null;
  return { title: '', body: live.body.value, reply: '', includePage: false, includeOrder: false, page: '', fileNumber: '', reportId: state.reportId || '' };
}
function persist() {
  if (!live || !state.userId) return;
  saveDraft(store(), state.userId, readForm());
}
function placePanel() {
  if (!live) return;
  if (window.matchMedia('(max-width: 700px)').matches) {
    live.dlg.style.left = ''; live.dlg.style.top = ''; live.dlg.style.width = ''; live.dlg.style.right = '';
    return;
  }
  const btn = document.querySelector('[data-bots-btn]');
  const bar = document.querySelector('.topbar-main');
  const below = bar ? Math.round(bar.getBoundingClientRect().bottom + 10) : 72;
  const width = Math.min(460, window.innerWidth - 24);
  let left = btn ? Math.round(btn.getBoundingClientRect().left) : 16;
  left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
  live.dlg.style.top = below + 'px';
  live.dlg.style.left = left + 'px';
  live.dlg.style.width = width + 'px';
}
function markButton() {
  document.body.classList.toggle('cla-sf-open', !!state.open);
  const btn = document.querySelector('[data-bots-btn]');
  if (!btn) return;
  btn.setAttribute('aria-expanded', state.open ? 'true' : 'false');
  const cur = btn.querySelector('[data-bots-current]');
  if (cur) cur.textContent = state.open ? 'Tech assistant' : 'Choose…';
}
function setOpen(open) {
  if (!live) return;
  state = { ...state, open: !!open };
  live.ovl.hidden = !state.open;
  markButton();
  if (state.open) {
    returnFocus = document.activeElement;
    placePanel();
    live.body.focus();
    document.addEventListener('keydown', onKey);
  } else {
    document.removeEventListener('keydown', onKey);
    const back = document.querySelector('[data-bots-btn]');
    if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
    else if (back) back.focus();
  }
}
function onKey(e) {
  if (!live || !state.open) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); return; }
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); live.form.requestSubmit(); return; }
  if (e.key !== 'Tab') return;
  const nodes = [...live.dlg.querySelectorAll('button, textarea, input, a, summary')].filter((n) => !n.disabled && n.offsetParent !== null);
  if (!nodes.length) return;
  const first = nodes[0]; const last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function bubble(message) {
  const assistant = message.authorKind === 'bot';
  const demo = !!message.simulation;
  const box = el('article', 'claSfBubble ' + (assistant ? 'assistant' : 'user') + (demo ? ' demo' : ''));
  box.appendChild(el('p', 'claSfWho', assistant ? (demo ? 'Local demo · Not a real reply' : 'Tech assistant') : 'You'));
  const text = el('p', 'claSfText'); text.textContent = message.body || ''; box.appendChild(text);
  return box;
}

function quietCopy(full, dispatch) {
  if (dispatch && dispatch.localDemo) return 'Local demo only. This was not sent to me.';
  if (dispatch && dispatch.reason === 'run_started') return 'Sent. Nothing back in this thread yet.';
  if (dispatch && dispatch.reason === 'accepted_unrecorded') return 'That may have been sent. It was not sent again.';
  if (dispatch && dispatch.error && !/bearer|webhook url|token|eyJ/i.test(dispatch.error)) return "That didn't send. It's still here.";
  const messages = full && full.messages || [];
  if (messages.some((m) => m.authorKind === 'bot' && !m.simulation)) return '';
  if (messages.some((m) => m.simulation)) return 'That note above is a local demo, not me.';
  if (full && full.deliveryState === 'run_accepted') return 'Sent. Nothing back in this thread yet.';
  if (full && full.deliveryState === 'pending_dispatch' && messages.length) return 'Not sent.';
  return '';
}

function attached(node) {
  if (!node) return false;
  if (node.isConnected === false) return false;
  if (node.isConnected === true) return true;
  let cur = node;
  while (cur) {
    if (cur === document.body || cur.tag === 'BODY') return true;
    cur = cur.parentNode || cur.parent || null;
  }
  return false;
}
function stillPaint(host, userId, gen, scope) {
  return !!(host && live === host && attached(host.root) && state.userId === userId && paintGen === gen
    && (!scope || (state.open && state.reportId === scope.reportId)));
}

async function paint(api, dispatch, scope) {
  const gen = ++paintGen;
  const host = live;
  const userId = state.userId;
  if (!stillPaint(host, userId, gen, scope)) return { ok: false };
  let rows;
  try { rows = (await api.listStaffFeedback()) || []; }
  catch (e) { return { ok: false, error: true }; }
  if (!stillPaint(host, userId, gen, scope)) return { ok: false };
  const mine = rows.filter((r) => r.mine);
  if (!scope && !state.reportId && !composing && mine[0]) state = { ...state, reportId: mine[0].id };
  if (!stillPaint(host, userId, gen, scope)) return { ok: false };
  const reportId = scope ? scope.reportId : state.reportId;
  const current = mine.find((r) => r.id === reportId) || null;
  let full = current;
  if (current) {
    try { full = await api.getStaffFeedback(current.id); }
    catch (e) { return { ok: false, error: true }; }
  }
  if (!stillPaint(host, userId, gen, scope)) return { ok: false };
  const messages = (full && full.messages || []).slice().sort((a, b) => (Number(a.turnOrd) || 0) - (Number(b.turnOrd) || 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  host.thread.textContent = '';
  if (!messages.length) host.thread.appendChild(el('p', 'claSfEmpty', 'Nothing here yet. Send a message when you want me to see it.'));
  messages.forEach((m) => host.thread.appendChild(bubble(m)));
  if (full && (full.attachments || []).length) host.thread.appendChild(el('p', 'claSfFile', (full.attachments.length === 1 ? '1 screenshot is' : full.attachments.length + ' screenshots are') + ' stored with this conversation. This thread does not open the file.'));
  const older = mine.filter((r) => r.id !== reportId);
  host.history.hidden = !reportId;
  host.historyList.textContent = '';
  older.forEach((r) => {
    const btn = el('button', 'claSfHistBtn', r.title || 'Earlier conversation'); btn.type = 'button';
    btn.addEventListener('click', () => { composing = false; state = nextWidgetState(state, { type: 'select', reportId: r.id }); paint(api); });
    host.historyList.appendChild(btn);
  });
  host.quiet.textContent = quietCopy(full, dispatch);
  host.quiet.hidden = !host.quiet.textContent;
  host.thread.scrollTop = host.thread.scrollHeight;
  if (host.thread.dataset) host.thread.dataset.checkedAt = String(Date.now());
  return { ok: true, waiting: /Nothing back in this thread yet/.test(host.quiet.textContent || '') };
}

function armReplyWatch(api, reportId) {
  const token = ++watchToken;
  const host = live;
  const userId = state.userId;
  const started = Date.now();
  if (!host || !attached(host.root)) return;
  if (host.thread.dataset) host.thread.dataset.sentAt = String(started);
  let errors = 0;
  const alive = () => token === watchToken && live === host && attached(host.root) && state.open && state.userId === userId && state.reportId === reportId;
  const tick = async () => {
    if (!alive()) return;
    let result;
    try { result = await paint(api, null, { reportId }); }
    catch (e) { result = { error: true }; }
    if (!alive()) return;
    if (!result || result.error || !result.ok) {
      errors += 1;
      if (errors > 2 || Date.now() - started > 90000) return;
      setTimeout(tick, 5000);
      return;
    }
    if (!result.waiting || Date.now() - started > 90000) return;
    setTimeout(tick, 5000);
  };
  setTimeout(tick, 5000);
}

function mount(user, api) {
  unmount();
  state = { userId: user.id, open: false, reportId: '' };
  composing = false;
  const root = el('div'); root.id = HOST_ID;
  const ovl = el('div', 'claSfOvl'); ovl.id = 'claStaffFeedback'; ovl.hidden = true;
  const dlg = el('div', 'claSfDlg'); dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-labelledby', 'claSfTitle');
  const mark = el('div', 'claSfMark');
  const x = el('button', 'claSfX', 'Close'); x.type = 'button'; x.setAttribute('aria-label', 'Close');
  const hi = el('header', 'claSfHi');
  hi.appendChild(el('p', 'claSfKicker', 'CLA'));
  hi.appendChild(el('strong', '', 'Tech assistant')); hi.id = 'claSfTitle';
  hi.appendChild(el('p', '', 'You can talk to me here about this portal. I see what you send. A reply shows in this thread only after it is saved.'));
  const body = el('div', 'claSfBody');
  const history = el('details', 'claSfHistory');
  const summary = el('summary', '', 'Earlier conversations');
  const historyList = el('div', 'claSfHistList');
  const fresh = el('button', 'claSfHistBtn', 'Start a new conversation'); fresh.type = 'button';
  history.appendChild(summary); history.appendChild(historyList); history.appendChild(fresh);
  const thread = el('div', 'claSfThread'); thread.setAttribute('role', 'log'); thread.setAttribute('aria-live', 'polite'); thread.setAttribute('aria-relevant', 'additions');
  const quiet = el('p', 'claSfQuiet'); quiet.setAttribute('role', 'status');
  const form = el('form', 'claSfCompose');
  const message = el('textarea'); message.maxLength = 4000; message.setAttribute('aria-label', 'Message'); message.placeholder = 'Message me';
  const err = el('div', 'claSfErr'); err.setAttribute('role', 'alert');
  const row = el('div', 'claSfRow');
  const send = el('button', 'claSfBtn', 'Send'); send.type = 'submit'; send.setAttribute('aria-label', 'Send message');
  row.appendChild(send);
  form.appendChild(message); form.appendChild(err); form.appendChild(row);
  body.appendChild(history); body.appendChild(thread); body.appendChild(quiet); body.appendChild(form);
  dlg.appendChild(mark); dlg.appendChild(x); dlg.appendChild(hi); dlg.appendChild(body);
  ovl.appendChild(dlg); root.appendChild(ovl); document.body.appendChild(root);
  live = { root, ovl, dlg, body: message, err, quiet, thread, history, historyList, form, api };
  const draft = loadDraft(store(), user.id);
  if (draft && draft.body) message.value = draft.body;
  message.addEventListener('input', persist);
  x.addEventListener('click', () => setOpen(false));
  ovl.addEventListener('click', (e) => { if (e.target === ovl) setOpen(false); });
  fresh.addEventListener('click', () => { composing = true; state = nextWidgetState(state, { type: 'select', reportId: '' }); message.focus(); paint(api); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); err.textContent = '';
    const text = message.value.trim();
    if (!text) { err.textContent = 'Write a message before sending.'; return; }
    send.disabled = true;
    const host = live;
    const userId = state.userId;
    try {
      let saved;
      let eventId = '';
      if (!state.reportId) {
        saved = await api.createStaffFeedback({ title: conversationTitle(text), body: text, includePage: false, includeOrder: false, idempotencyKey: newId() });
        if (live !== host || state.userId !== userId) return;
        composing = false;
        state = nextWidgetState(state, { type: 'select', reportId: saved.id });
      } else {
        saved = await api.addStaffFeedbackTurn(state.reportId, { body: text, idempotencyKey: newId() });
        eventId = saved.turnEventId || '';
      }
      if (live !== host || state.userId !== userId) return;
      message.value = ''; persist();
      const result = api.requestStaffFeedbackDispatch ? await api.requestStaffFeedbackDispatch(state.reportId, eventId || undefined) : { error: 'The server did not accept the send. It was not marked delivered.' };
      if (live !== host || state.userId !== userId) return;
      const painted = await paint(api, result);
      if (live !== host || !attached(host.root) || state.userId !== userId) return;
      if (painted && painted.ok && result && (result.reason === 'run_started' || result.reason === 'accepted_unrecorded')) armReplyWatch(api, state.reportId);
    } catch (ex) { if (live === host && host.err) host.err.textContent = ex.message || 'The message was not sent.'; }
    finally { if (live === host && attached(host.root)) send.disabled = false; }
  });
  if (api.recordLocalDemoReply && typeof window !== 'undefined') {
    window.__claLocalDemoReply = async (text) => {
      if (!state.reportId) return null;
      const saved = await api.recordLocalDemoReply(state.reportId, { body: text, idempotencyKey: newId() });
      await paint(api);
      return saved;
    };
  }
  paint(api);
}

export function openStaffFeedbackPanel() {
  if (!live) return;
  state = nextWidgetState(state, { type: 'open' });
  setOpen(true);
  if (live.api) paint(live.api);
}
export function hideStaffFeedbackPanel() { setOpen(false); }
export function syncStaffFeedbackWidget({ user, demoActive = false, viewingAs = false, getApi } = {}) {
  if (typeof document === 'undefined') return;
  const allowed = launcherAllowed(user, { demoActive, viewingAs });
  const next = nextWidgetState(state.userId ? state : { userId: null, open: false, reportId: '' }, { type: 'sync', allowed, userId: user && user.id });
  if (!allowed || next.unmount && next.userId == null) { unmount(); return; }
  const run = async () => {
    const api = await getApi();
    if (next.switched || !document.getElementById(HOST_ID)) {
      if (state.userId && state.userId !== user.id) persist();
      mount(user, api);
      return;
    }
    state = nextWidgetState(state, { type: 'navigate' });
    live.api = api;
    if (live) { placePanel(); live.ovl.hidden = !state.open; markButton(); }
  };
  run();
}
