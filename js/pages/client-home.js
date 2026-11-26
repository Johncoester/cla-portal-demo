// MF-069 (Matt Landsberg, Nov 25 2026, confirmed): the buyer's landing page after first login is mobile friendly,
// makes it easy to pick the file, and makes clear which tasks they have to do.
// A buyer or seller (client-only login) lands on Open Orders. This adds one big card per file above the order table:
// property address and file number (the tap target that opens the file), the stage and closing date, and the open tasks
// that are the client's to do, each linking straight to its form. On a phone the eight-column table is hidden (css/client-home.css).
// Staff, agents and coordinators do not get this; their Open Orders page is unchanged.
import { html, fmtDate } from '../ui.js?v=202611161500';
import { STAGES } from '../data/constants.js?v=202611302300';

const OPEN = ['todo', 'in_progress', 'blocked'];
const FORM_KINDS = ['form', 'sign', 'agent'];
export const taskHref = (t) => `#/deals/${t.dealId}/tasks${FORM_KINDS.includes(t.kind) ? '/' + t.id : ''}`;

// One card per file. tasks = this person's tasks (my_task_list / listMyTasks); a task is "needed from you" while it is open and theirs.
export function clientHomeFiles(deals, tasks, today) {
  const mine = new Map();
  (tasks || []).filter((t) => t.mine !== false && OPEN.includes(t.status)).forEach((t) => {
    const id = t.dealId || (t.deal && t.deal.id); if (!id) return;
    if (!mine.has(id)) mine.set(id, []);
    mine.get(id).push({ id: t.id, dealId: id, title: t.title, status: t.status, kind: t.kind, dueDate: t.dueDate || null, overdue: !!(t.overdue || (t.dueDate && today && t.dueDate < today)) });
  });
  const files = (deals || []).map((d) => {
    const list = (mine.get(d.id) || []).sort((a, b) => (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31') || String(a.title).localeCompare(String(b.title)));
    const stageNo = Number(d.stage) || 0;
    return { id: d.id, fileNumber: d.fileNumber || '', street: d.street || '', cityLine: [d.city, [d.state, d.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      role: d.myRole === 'Client-Seller' ? 'Seller' : d.myRole === 'Client-Buyer' ? 'Buyer' : '', stage: d.stageName || STAGES[stageNo] || '', closingDate: d.closingDate || '', status: d.status || '', tasks: list };
  });
  // files that need something from the client first, then the soonest closing date
  return files.sort((a, b) => (b.tasks.length > 0) - (a.tasks.length > 0) || (a.closingDate || '9999-12-31').localeCompare(b.closingDate || '9999-12-31') || a.fileNumber.localeCompare(b.fileNumber));
}

export function clientHomeCards(files) {
  if (!files.length) return html`<section class="client-home" data-client-home><p class="muted" data-ch-empty>You have no orders here yet.</p></section>`;
  return html`<section class="client-home" data-client-home aria-label="Your orders">${files.map((f) => html`
    <article class="ch-card${f.tasks.length ? ' needs-you' : ''}" data-ch-file="${f.id}">
      <a class="ch-open" href="#/deals/${f.id}" data-ch-open><span class="ch-addr">${f.street || f.fileNumber}</span><span class="ch-city">${f.cityLine}</span>
        <span class="ch-meta">File ${f.fileNumber}${f.role ? ` · You are the ${f.role}` : ''}${f.stage ? ` · ${f.stage}` : ''}${f.closingDate ? ` · Closing ${fmtDate(f.closingDate)}` : ''}</span></a>
      ${f.tasks.length ? html`<div class="ch-tasks" data-ch-tasks><h3>Needed from you (${f.tasks.length})</h3><ul>${f.tasks.map((t) => html`<li><a href="${taskHref(t)}" data-ch-task>${t.title}</a>${t.dueDate ? html` <span class="ch-due${t.overdue ? ' late' : ''}">${t.overdue ? 'Overdue, was due ' : 'Due '}${fmtDate(t.dueDate)}</span>` : ''}</li>`)}</ul></div>`
        : html`<p class="ch-clear muted" data-ch-clear>Nothing needed from you right now.</p>`}
    </article>`)}</section>`;
}
