// Left-side shortcuts on a CRM record (Janine, CRM Feedback 28 item 3).
// Janine, Nov 18 2026, 5:23 PM ET: Clients, Leads, Deals, Task, Meeting, Call come first, in that order.
// A module with a section already on the record scrolls to it. Otherwise it opens that module's list.
// The older shortcuts stay after those six, in the same order, and only when that section is on the page.
// No extra reads: the panel only looks at sections the record page already drew.
import { html, raw, toText } from '../ui.js?v=202611161500';

// [key, label, section selector, list address when that section is not on this record]
export const MODULE_SHORTCUTS = [
  ['clients', 'Clients', '[data-account-contacts]', '#/crm/contacts'],
  ['leads', 'Leads', '', '#/crm/leads'],
  ['deals', 'Deals', '[data-crm-orders]', '#/crm/deals'],
  ['task', 'Task', '[data-board-col="open-tasks"]', '#/crm'],
  ['meeting', 'Meeting', '[data-board-col="open-meetings"]', '#/crm/meetings'],
  ['call', 'Call', '[data-board-col="open-calls"]', '#/crm/calls'],
];

// Kept after the six, in this order. Deals moved up into MODULE_SHORTCUTS.
export const SHORTCUTS = [
  ['notes', 'Notes', '[data-notes]'],
  ['open', 'Open Activities', '[data-open-acts]'],
  ['closed', 'Closed Activities', '[data-closed-acts]'],
  ['emails', 'Emails', '[data-emails-list]'],
  ['attachments', 'Attachments', '[data-attachments]'],
];

const CSS = `
.crm-record.has-shortcuts { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: var(--s4); align-items: start; }
.crm-record-main { min-width: 0; }
.crm-shortcuts { position: sticky; top: calc(var(--topbar-h) + 8px); z-index: 4; display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 8px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg); box-shadow: var(--sh-1); }
.crm-shortcut { display: block; width: 100%; text-align: left; text-decoration: none; background: transparent; border: 0; border-radius: var(--r); padding: 8px 10px; color: var(--ink-2); font-weight: 600; font-size: var(--fs-sm); cursor: pointer; }
.crm-shortcut:hover { background: var(--surface-2); color: var(--ink); }
.crm-shortcut[aria-current="true"] { background: var(--navy-100); color: var(--navy-800); }
.crm-record-main [data-account-contacts],
.crm-record-main [data-crm-orders],
.crm-record-main [data-board-col="open-tasks"],
.crm-record-main [data-board-col="open-meetings"],
.crm-record-main [data-board-col="open-calls"],
.crm-record-main [data-notes],
.crm-record-main [data-open-acts],
.crm-record-main [data-closed-acts],
.crm-record-main [data-emails-list],
.crm-record-main [data-attachments] { scroll-margin-top: calc(var(--topbar-h) + 8px); }
@media (max-width: 800px) {
  .crm-record.has-shortcuts { grid-template-columns: minmax(0, 1fr); }
  .crm-shortcuts { position: static; flex-direction: row; flex-wrap: wrap; top: auto; }
  .crm-shortcut { width: auto; flex: 1 1 auto; min-height: 40px; }
}
`;

export function recordShell(inner) {
  return html`<div class="crm-record has-shortcuts" data-crm-record>
    <nav class="crm-shortcuts" data-crm-shortcuts aria-label="Related lists"></nav>
    <div class="crm-record-main" data-crm-record-main>${inner}</div>
  </div><style id="crm-shortcut-css">${raw(CSS)}</style>`;
}

function specs() {
  return [...MODULE_SHORTCUTS, ...SHORTCUTS];
}

function jump(nav, main, btn) {
  if (!btn || String(btn.tagName).toUpperCase() === 'A') return;
  const spec = specs().find(([key]) => key === btn.getAttribute('data-crm-jump'));
  if (!spec || !spec[2]) return;
  const el = main.querySelector(spec[2]);
  if (!el) return;
  nav.querySelectorAll('[data-crm-jump]').forEach((b) => b.removeAttribute('aria-current'));
  btn.setAttribute('aria-current', 'true');
  if (!el.id) el.id = 'crm-section-' + spec[0];
  btn.setAttribute('aria-controls', el.id);
  const go = el.scrollIntoView;
  if (typeof go !== 'function') return;
  try { go.call(el, { behavior: 'smooth', block: 'start' }); }
  catch { try { go.call(el); } catch { /* a test page has no layout */ } }
}

// The six modules are always shown. A section on the page scrolls; otherwise the shortcut opens that module's list.
// Older shortcuts are added only when their section is already on the page.
function panelItems(main) {
  const modules = MODULE_SHORTCUTS.map(([key, label, sel, href]) => {
    const onPage = !!(sel && main.querySelector(sel));
    return [key, label, onPage ? sel : '', onPage ? '' : href];
  });
  const rest = SHORTCUTS.filter(([, , sel]) => main.querySelector(sel));
  return [...modules, ...rest];
}

function shortcutHtml([key, label, , href]) {
  if (href) return html`<a class="crm-shortcut" data-crm-jump="${key}" href="${href}">${label}</a>`;
  return html`<button type="button" class="crm-shortcut" data-crm-jump="${key}">${label}</button>`;
}

// Fills the panel. Returns the shortcut keys that were shown, in panel order.
export function wireShortcuts(root) {
  const scope = root && root.querySelector ? root : null;
  if (!scope) return [];
  const shell = scope.querySelector('[data-crm-record]');
  const nav = scope.querySelector('[data-crm-shortcuts]');
  const main = scope.querySelector('[data-crm-record-main]') || scope;
  if (!nav || !shell) return [];
  const found = panelItems(main);
  shell.classList.toggle('has-shortcuts', found.length > 0);
  if (!found.length) { nav.hidden = true; nav.innerHTML = ''; return []; }
  nav.hidden = false;
  nav.innerHTML = toText(found.map(shortcutHtml));
  if (nav.dataset.wired !== '1') {
    nav.dataset.wired = '1';
    nav.addEventListener('click', (e) => {
      const t = e.target;
      const btn = t && typeof t.closest === 'function' ? t.closest('[data-crm-jump]') : null;
      if (!btn || !nav.contains(btn)) return;
      jump(nav, main, btn);
    });
  }
  return found.map(([key]) => key);
}
