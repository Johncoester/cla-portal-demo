/* TC-ASSIGN-1 (John, Nov 21 2026): the agents a transaction coordinator works with, on the coordinator's contact record and on
 * User List > Edit user. Adding an agent here is the same link as adding the coordinator on the agent's profile: it works both ways,
 * and the coordinator then goes on all of that agent's files. Removing keeps both people and takes nobody off a file. */
import { html, $, $$, guard, toast } from '../ui.js?v=202611161500';
import { fmtPhone } from '../data/constants.js?v=202611247700';
import { personName, sameContactOrEmail, TC_SELF } from '../data/agent-tc-links.js?v=202611248300';

export const TC_PICK_AGENT = 'Pick the agent from the list.';

export function tcAgentsSectionHtml({ canEdit = false } = {}) {
  return html`<section class="card" data-tc-agents>
    <h3>Agents this coordinator works with</h3>
    <p class="muted">Adding an agent puts this coordinator on all of that agent's files, on the agent's side. It is the same link as the agent's Transaction coordinators list.</p>
    <div class="side-scroll" data-tca-list><p class="muted">Loading…</p></div>
    ${canEdit ? html`<form class="form-grid" data-tca-add novalidate>
      <label class="span2">Agent
        <select name="agentContactId" data-tca-pick aria-label="Pick an agent"><option value="">Pick an agent</option></select>
      </label>
      <p class="err-text span2" data-tca-err role="alert" hidden></p>
      <div class="span2"><button class="m-btn" type="submit" data-tca-save>Add agent</button></div>
    </form>` : html`<p class="muted small" data-tca-readonly>A processor or admin can add or remove an agent here.</p>`}
  </section>`;
}

export function agentChoices(people, tcContactId) {
  return (people || []).filter((c) => c && c.id && c.id !== tcContactId && !String(c.id).startsWith('staff:') && (!c.contactType || c.contactType === 'realtor'))
    .sort((a, b) => personName(a).localeCompare(personName(b)));
}

export function mountTcAgentsSection(root, { api, tcContactId, canEdit }) {
  const box = $('[data-tc-agents]', root);
  if (!box || !tcContactId || !api.listTcAgents) return;
  const listEl = $('[data-tca-list]', box);
  const err = $('[data-tca-err]', box);
  const showErr = (m) => { if (!err) return; err.textContent = m || ''; err.hidden = !m; };
  const paint = (rows) => {
    if (!rows.length) { listEl.innerHTML = html`<p class="muted" data-tca-empty>No agent is linked to this coordinator yet.</p>`.toString(); return; }
    listEl.innerHTML = html`<table class="tbl striped" data-tca-table><thead><tr><th>Agent</th><th>Phone</th><th>Email</th><th>Company</th><th></th></tr></thead><tbody>
      ${rows.map((r) => html`<tr data-tca-row="${r.contactId}"><td>${personName(r)}</td><td>${r.phone ? fmtPhone(r.phone) : html`<span class="muted">&mdash;</span>`}</td><td>${r.email || html`<span class="muted">&mdash;</span>`}</td><td>${r.company || html`<span class="muted">&mdash;</span>`}</td>
        <td>${canEdit ? html`<button type="button" class="ghost" data-tca-remove="${r.contactId}" data-tca-name="${personName(r)}">Remove</button>` : ''}</td></tr>`)}
    </tbody></table>`.toString();
    if (canEdit) $$('[data-tca-remove]', listEl).forEach((b) => b.addEventListener('click', guard(async () => {
      if (!confirm(`Remove ${b.dataset.tcaName} from this coordinator's agents? Both people are kept. This does not take anyone off a file.`)) return;
      await api.unlinkAgentTc(b.dataset.tcaRemove, tcContactId);
      toast('Agent removed');
      await load();
    })));
  };
  async function load() { const rows = (await api.listTcAgents(tcContactId)) || []; paint(rows); return rows; }
  const form = $('[data-tca-add]', box);
  if (form && canEdit) {
    const pick = $('[data-tca-pick]', form);
    let directory = [];
    api.listContacts().then((people) => {
      directory = people || [];
      pick.innerHTML = html`<option value="">Pick an agent</option>${agentChoices(directory, tcContactId).map((c) => html`<option value="${c.id}">${personName(c)}${c.email ? html` (${c.email})` : ''}</option>`)}`.toString();
    }).catch(() => { /* the list stays empty; the error below says to pick */ });
    form.addEventListener('submit', guard(async (e) => {
      e.preventDefault();
      showErr('');
      const agentId = String(new FormData(form).get('agentContactId') || '');
      if (!agentId) { showErr(TC_PICK_AGENT); return; }
      const tc = directory.find((c) => c.id === tcContactId) || { id: tcContactId };
      const agent = directory.find((c) => c.id === agentId) || { id: agentId };
      if (sameContactOrEmail(agent, tc)) { showErr(TC_SELF); return; }
      try { await api.linkAgentTc(agentId, tcContactId); } catch (er) { showErr(er.message || 'The agent was not added. Try again.'); throw er; }
      form.reset();
      toast('Agent added. The coordinator is now on that agent\u2019s files.');
      await load();
    }));
  }
  return load().catch((e) => { listEl.innerHTML = html`<p class="err-text" role="alert">${e.message || 'The list could not be loaded. Refresh the page and try again.'}</p>`.toString(); });
}
