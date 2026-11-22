// Left-side shortcuts on a CRM record (Janine, CRM Feedback 28 item 3, then Feedback 36).
// Feedback 36 (Janine, Nov 20 2026, 12:40 PM ET): the module links moved to the CRM top tabs.
// This panel keeps only the record's own shortcuts, and only when that section is already on the page.
// Order: Notes, Deals, Open Activities, Closed Activities, Emails, Attachments.
// Deals stays when the record already lists its orders (a client or a company). A deal record has Emails only.
// Feedback 33: no counts on these shortcuts except Attachments. An empty list shows no number. More than 10 shows 10+.
// No extra reads: the count is the attachment rows the record page already drew.
// On a wide screen the panel stays put while the record scrolls. On a narrow screen the shortcuts wrap across the top.
import { html, raw, toText } from '../ui.js?v=202611161500';

export const SHORTCUTS = [
  ['notes', 'Notes', '[data-notes]'],
  ['deals', 'Deals', '[data-crm-orders]'],
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
.crm-shortcut-count { margin-left: 6px; color: var(--ink-3); font-weight: 700; }
.crm-shortcut[aria-current="true"] { background: var(--navy-100); color: var(--navy-800); }
.crm-record-main [data-crm-orders],
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

// The rows already drawn. Nothing is loaded. Empty stays blank. A long list shows 10+.
function attachmentCount(section) {
  const n = section ? section.querySelectorAll('[data-att]').length : 0;
  if (!n) return '';
  return n > 10 ? '10+' : String(n);
}

function jump(nav, main, btn) {
  const tag = btn ? String(btn.tagName).toUpperCase() : '';
  if (!btn || tag === 'A' || tag === 'SPAN') return;
  const spec = SHORTCUTS.find(([key]) => key === btn.getAttribute('data-crm-jump'));
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

function panelItems(main) {
  return SHORTCUTS.filter(([, , sel]) => main.querySelector(sel)).map(([key, label, sel]) => {
    const section = main.querySelector(sel);
    return [key, label, key === 'attachments' ? attachmentCount(section) : ''];
  });
}

function shortcutHtml([key, label, count]) {
  const num = count ? html` <span class="crm-shortcut-count" data-crm-count="${count}">${count}</span>` : '';
  return html`<button type="button" class="crm-shortcut" data-crm-jump="${key}">${label}${num}</button>`;
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
