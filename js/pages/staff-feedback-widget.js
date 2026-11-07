/* Persistent staff launcher. It lives on document.body, so opening a file tab does not close it or wipe the draft.
 * It is not a live assistant and it does not send the webhook. */
import { deliveryNotice, newId, sanitizePage, STATUS_LABELS } from '../data/staff-feedback.js?v=202611071830';
import { launcherAllowed, loadDraft, nextWidgetState, saveDraft } from '../data/staff-feedback-widget-state.js?v=202611071830';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif';
const HOST_ID = 'claStaffFeedbackRoot';
let state = { userId: null, open: false, reportId: '' };
let live = null;
let returnFocus = null;

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};
const svg = (cls, path) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); if (cls) s.setAttribute('class', cls);
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', path); p.setAttribute('fill', 'currentColor'); s.appendChild(p); return s;
};
const store = () => (typeof sessionStorage !== 'undefined' ? sessionStorage : null);

function unmount() {
  const root = document.getElementById(HOST_ID);
  if (root) root.remove();
  document.removeEventListener('keydown', onKey);
  live = null;
  state = { userId: null, open: false, reportId: '' };
}

function readForm() {
  if (!live) return null;
  return {
    title: live.title.value, body: live.body.value, reply: live.reply.value,
    includePage: live.includePage.checked, includeOrder: live.includeOrder.checked,
    page: live.page.value, fileNumber: live.file.value, reportId: state.reportId || '',
  };
}

function persist() {
  if (!live || !state.userId) return;
  saveDraft(store(), state.userId, readForm());
}

function applyDraft(draft) {
  if (!live || !draft) return;
  live.title.value = draft.title || '';
  live.body.value = draft.body || '';
  live.reply.value = draft.reply || '';
  live.includePage.checked = !!draft.includePage;
  live.includeOrder.checked = !!draft.includeOrder;
  live.page.value = draft.page || '';
  live.file.value = draft.fileNumber || '';
  live.pageWrap.hidden = !draft.includePage;
  live.orderWrap.hidden = !draft.includeOrder;
  if (draft.reportId) state = { ...state, reportId: draft.reportId };
}

function setOpen(open) {
  if (!live) return;
  state = { ...state, open: !!open };
  live.ovl.hidden = !state.open;
  live.fab.classList.toggle('open', state.open);
  live.fab.setAttribute('aria-expanded', state.open ? 'true' : 'false');
  if (state.open) {
    returnFocus = document.activeElement;
    live.where.textContent = 'You are on ' + (location.hash.split('?')[0] || '#/');
    const focus = state.reportId ? live.reply : live.body;
    focus.focus();
    document.addEventListener('keydown', onKey);
  } else {
    document.removeEventListener('keydown', onKey);
    if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
    else live.fab.focus();
  }
}

function onKey(e) {
  if (!live || !state.open) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); return; }
  if (e.key !== 'Tab') return;
  const nodes = [...live.dlg.querySelectorAll('button, textarea, input, a, select')].filter((n) => !n.disabled && n.offsetParent !== null);
  if (!nodes.length) return;
  const first = nodes[0]; const last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function bubble(parent, message) {
  const box = el('article', 'claSfBubble' + (message.simulation ? ' simulation' : ''));
  box.appendChild(el('p', 'claSfMeta', (message.authorName || 'Staff') + (message.simulation ? ' · Test simulation' : '')));
  const text = el('p'); text.textContent = message.body || ''; box.appendChild(text);
  parent.appendChild(box);
}

async function paint(api) {
  if (!live) return;
  let rows = [];
  try { rows = (await api.listStaffFeedback()) || []; } catch (e) { rows = []; }
  const mine = rows.filter((r) => r.mine);
  live.list.textContent = '';
  if (!mine.length) live.list.appendChild(el('li', '', 'No reports yet.'));
  mine.forEach((r) => {
    const li = el('li');
    const btn = el('button'); btn.type = 'button';
    btn.appendChild(el('strong', '', r.title || 'Report'));
    btn.appendChild(el('span', 'claSfPill', r.statusLabel || STATUS_LABELS[r.status] || r.status || ''));
    if (r.id === state.reportId) btn.classList.add('on');
    btn.addEventListener('click', () => { state = nextWidgetState(state, { type: 'select', reportId: r.id }); paint(api); });
    li.appendChild(btn); live.list.appendChild(li);
  });
  live.thread.textContent = '';
  live.shots.textContent = '';
  const current = mine.find((r) => r.id === state.reportId) || null;
  live.threadWrap.hidden = !current;
  live.compose.hidden = !!current;
  if (!current) {
    live.notice.textContent = deliveryNotice('pending_dispatch', 'bridge_unconfigured');
    return;
  }
  let full = current;
  try { full = await api.getStaffFeedback(current.id); } catch (e) { full = current; }
  live.notice.textContent = full.notice || deliveryNotice(full.deliveryState, full.deliveryReason);
  (full.messages || []).forEach((m) => bubble(live.thread, m));
  (full.attachments || []).forEach((a) => {
    const row = el('p');
    const btn = el('button', 'claSfBtn o', 'View screenshot'); btn.type = 'button';
    btn.addEventListener('click', async () => {
      const file = await api.openStaffFeedbackAttachment(a.id);
      const img = el('img', 'claSfImg'); img.alt = 'Screenshot';
      img.src = file.dataUrl || URL.createObjectURL(file.blob);
      row.appendChild(img);
    });
    row.appendChild(document.createTextNode((a.fileName || 'Screenshot') + ' '));
    row.appendChild(btn); live.shots.appendChild(row);
  });
  if (full.canSupport) {
    const link = el('a', '', 'Open the report list'); link.href = '#/staff-feedback';
    live.shots.appendChild(link);
  }
}

function mount(user, api) {
  unmount();
  state = { userId: user.id, open: false, reportId: '' };
  const root = el('div'); root.id = HOST_ID;
  const fab = el('button', 'claSfFab'); fab.type = 'button'; fab.id = 'claStaffFeedbackFab';
  fab.setAttribute('aria-haspopup', 'dialog'); fab.setAttribute('aria-expanded', 'false');
  fab.setAttribute('aria-label', 'Portal feedback'); fab.setAttribute('data-tip', 'Portal feedback');
  fab.appendChild(svg('claSfIcoChat', 'M5 4h14a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-6.2l-4.3 3.4c-.6.5-1.5.1-1.5-.7V18H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z'));
  fab.appendChild(el('span', 'claSfIcoX', '×'));
  const ovl = el('div', 'claSfOvl'); ovl.id = 'claStaffFeedback'; ovl.hidden = true;
  const dlg = el('div', 'claSfDlg'); dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-labelledby', 'claSfTitle');
  const x = el('button', 'claSfX', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close portal feedback');
  const hi = el('header', 'claSfHi');
  hi.appendChild(el('strong', '', 'Portal feedback')); hi.id = 'claSfTitle';
  hi.appendChild(el('p', '', 'Saved in this portal. Not delivered to the assistant.'));
  const body = el('div', 'claSfBody');
  const notice = el('p', 'claSfNotice'); notice.setAttribute('role', 'status');
  const where = el('p', 'claSfMeta');
  const threadWrap = el('div');
  const thread = el('div', 'claSfThread');
  const shots = el('div');
  const reply = el('textarea'); reply.maxLength = 4000; reply.setAttribute('aria-label', 'Reply');
  const replyRow = el('div', 'claSfRow');
  const replyBtn = el('button', 'claSfBtn', 'Save reply'); replyBtn.type = 'button';
  const sim = el('button', 'claSfBtn o', 'Run test simulation (not delivered)'); sim.type = 'button';
  const back = el('button', 'claSfBtn o', 'New report'); back.type = 'button';
  replyRow.appendChild(back); replyRow.appendChild(sim); replyRow.appendChild(replyBtn);
  threadWrap.appendChild(thread); threadWrap.appendChild(shots); threadWrap.appendChild(el('label', 'claSfLbl', 'Reply')); threadWrap.appendChild(reply); threadWrap.appendChild(replyRow);
  const compose = el('form');
  const title = el('input'); title.type = 'text'; title.maxLength = 140; title.setAttribute('aria-label', 'Title');
  const message = el('textarea'); message.maxLength = 4000; message.setAttribute('aria-label', 'What happened');
  const includePage = el('input'); includePage.type = 'checkbox';
  const pageWrap = el('label', 'claSfLbl', 'Page'); const page = el('input'); page.type = 'text'; page.maxLength = 200; pageWrap.appendChild(page); pageWrap.hidden = true;
  const includeOrder = el('input'); includeOrder.type = 'checkbox';
  const orderWrap = el('label', 'claSfLbl', 'File number'); const file = el('input'); file.type = 'text'; file.maxLength = 40; orderWrap.appendChild(file); orderWrap.hidden = true;
  const shot = el('input'); shot.type = 'file'; shot.accept = ACCEPT; shot.setAttribute('aria-label', 'Screenshot');
  const err = el('div', 'claSfErr'); err.setAttribute('role', 'alert');
  const save = el('button', 'claSfBtn', 'Save report'); save.type = 'submit';
  compose.appendChild(el('label', 'claSfLbl', 'Title')); compose.appendChild(title);
  compose.appendChild(el('label', 'claSfLbl', 'What happened')); compose.appendChild(message);
  const pageCheck = el('label', 'claSfCheck'); pageCheck.appendChild(includePage); pageCheck.appendChild(document.createTextNode(' Include the page I name'));
  const orderCheck = el('label', 'claSfCheck'); orderCheck.appendChild(includeOrder); orderCheck.appendChild(document.createTextNode(' Include an order file number I name'));
  compose.appendChild(pageCheck); compose.appendChild(pageWrap); compose.appendChild(orderCheck); compose.appendChild(orderWrap);
  compose.appendChild(el('p', 'claSfMeta', 'Both boxes start off. One screenshot, not a folder. Customer files are not copied.'));
  compose.appendChild(shot); compose.appendChild(err);
  const row = el('div', 'claSfRow'); row.appendChild(save); compose.appendChild(row);
  const mine = el('section', 'claSfMine'); mine.appendChild(el('h3', '', 'My reports'));
  const list = el('ul'); mine.appendChild(list);
  body.appendChild(notice); body.appendChild(where); body.appendChild(threadWrap); body.appendChild(compose); body.appendChild(mine);
  dlg.appendChild(x); dlg.appendChild(hi); dlg.appendChild(body); ovl.appendChild(dlg);
  root.appendChild(fab); root.appendChild(ovl); document.body.appendChild(root);
  live = { fab, ovl, dlg, title, body: message, reply, includePage, includeOrder, page, file, pageWrap, orderWrap, shot, err, notice, where, thread, threadWrap, shots, compose, list };
  applyDraft(loadDraft(store(), user.id));
  const keep = () => persist();
  [title, message, reply, page, file].forEach((n) => n.addEventListener('input', keep));
  includePage.addEventListener('change', () => { pageWrap.hidden = !includePage.checked; if (includePage.checked && !page.value) { try { page.value = sanitizePage(location.hash.split('?')[0]); } catch (e) { page.value = ''; } } keep(); });
  includeOrder.addEventListener('change', () => { orderWrap.hidden = !includeOrder.checked; keep(); });
  fab.addEventListener('click', () => { state = nextWidgetState(state, { type: 'toggle' }); setOpen(state.open); if (state.open) paint(api); });
  x.addEventListener('click', () => setOpen(false));
  ovl.addEventListener('click', (e) => { if (e.target === ovl) setOpen(false); });
  back.addEventListener('click', () => { state = nextWidgetState(state, { type: 'select', reportId: '' }); paint(api); });
  compose.addEventListener('submit', async (e) => {
    e.preventDefault(); err.textContent = '';
    const idem = newId();
    try {
      const saved = await api.createStaffFeedback({
        title: title.value, body: message.value, includePage: includePage.checked, page: includePage.checked ? page.value : '',
        includeOrder: includeOrder.checked, fileNumber: includeOrder.checked ? file.value : '', idempotencyKey: idem,
      });
      const picked = shot.files && shot.files[0];
      if (picked) {
        if (picked.webkitRelativePath || shot.hasAttribute('webkitdirectory')) throw new Error('Choose one screenshot. Folder upload is not available.');
        const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read the screenshot.')); r.readAsDataURL(picked); });
        await api.addStaffFeedbackAttachment(saved.id, { name: picked.name, mimeType: picked.type, size: picked.size, dataUrl, idempotencyKey: newId() });
      }
      title.value = ''; message.value = ''; includePage.checked = false; includeOrder.checked = false; page.value = ''; file.value = ''; shot.value = '';
      pageWrap.hidden = true; orderWrap.hidden = true;
      state = nextWidgetState(state, { type: 'select', reportId: saved.id });
      saveDraft(store(), user.id, emptySafe());
      notice.textContent = saved.notice || deliveryNotice('pending_dispatch', 'bridge_unconfigured');
      await paint(api);
    } catch (ex) { err.textContent = ex.message || 'Could not save.'; }
  });
  replyBtn.addEventListener('click', async () => {
    err.textContent = '';
    try {
      const saved = await api.replyStaffFeedback(state.reportId, { body: reply.value, idempotencyKey: newId() });
      reply.value = ''; persist();
      notice.textContent = 'Reply saved. Not sent to the assistant.';
      await paint(api);
      if (saved && saved.notice) notice.textContent = saved.notice;
    } catch (ex) { err.textContent = ex.message || 'Could not save.'; }
  });
  sim.addEventListener('click', async () => {
    try { const saved = await api.simulateStaffFeedback(state.reportId); notice.textContent = saved.notice; await paint(api); }
    catch (ex) { err.textContent = ex.message || 'The test simulation was not run.'; }
  });
  paint(api);
}

function emptySafe() {
  return { title: '', body: '', reply: live ? live.reply.value : '', includePage: false, includeOrder: false, page: '', fileNumber: '', reportId: state.reportId || '' };
}

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
    if (live) live.where.textContent = 'You are on ' + (location.hash.split('?')[0] || '#/');
  };
  run();
}
