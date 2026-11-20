/* Transaction coordinators on an agent's profile or contact record (TC-2).
 * Add, remove, and show the list. The same buttons and form layout as the rest of the portal. */
import { html, $, $$, guard, toast } from '../ui.js?v=202611161500';
import { fmtPhone } from '../data/constants.js?v=202611247700';
import { newCoordinatorProblem, personName, TC_NEED_PERSON, TC_SELF, sameContactOrEmail } from '../data/agent-tc-links.js?v=202611248300';

const nameOf = (c) => personName(c);

export function agentTcSectionHtml({ canEdit = false } = {}) {
  return html`<section class="card" data-agent-tcs>
    <h3>Transaction coordinators</h3>
    <p class="muted">Outside assistants for this agent. One coordinator can help more than one agent. On a file, they work on the same side as that agent.</p>
    <div class="side-scroll" data-tc-list><p class="muted">Loading…</p></div>
    ${canEdit ? html`<form class="form-grid" data-tc-add novalidate>
      <h4 class="span2">Add a transaction coordinator</h4>
      <label class="span2">Pick someone already saved
        <select name="tcContactId" data-tc-pick aria-label="Pick a transaction coordinator"><option value="">Someone new — type them below</option></select>
      </label>
      <label>First name<input name="firstName" maxlength="80" autocomplete="given-name" data-tc-first></label>
      <label>Last name<input name="lastName" maxlength="80" autocomplete="family-name"></label>
      <label>Email<input name="email" type="email" maxlength="160" autocomplete="email"></label>
      <label>Phone<input name="phone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone maxlength="40"></label>
      <label class="span2">Company / brokerage<input name="company" maxlength="120"></label>
      <p class="err-text span2" data-tc-err role="alert" hidden></p>
      <div class="span2"><button class="m-btn" type="submit" data-tc-save>Add coordinator</button></div>
    </form>` : html`<p class="muted small" data-tc-readonly>A processor, or this agent, can add or remove a coordinator.</p>`}
  </section>`;
}

export function mountAgentTcSection(root, { api, agentContactId, canEdit }) {
  const box = $('[data-agent-tcs]', root);
  if (!box || !agentContactId || !api.listAgentTcs) return;
  const listEl = $('[data-tc-list]', box);
  const err = $('[data-tc-err]', box);
  const showErr = (m) => { if (!err) return; err.textContent = m || ''; err.hidden = !m; };
  const paint = (rows) => {
    if (!rows.length) {
      listEl.innerHTML = html`<p class="muted" data-tc-empty>No transaction coordinator is linked to this agent yet.</p>`.toString();
      return;
    }
    listEl.innerHTML = html`<table class="tbl striped" data-tc-table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Company</th><th></th></tr></thead><tbody>
      ${rows.map((r) => html`<tr data-tc-row="${r.contactId}"><td>${nameOf(r)}</td><td>${r.phone ? fmtPhone(r.phone) : html`<span class="muted">&mdash;</span>`}</td><td>${r.email || html`<span class="muted">&mdash;</span>`}</td><td>${r.company || html`<span class="muted">&mdash;</span>`}</td>
        <td>${canEdit ? html`<button type="button" class="ghost" data-tc-remove="${r.contactId}" data-tc-name="${nameOf(r)}">Remove</button>` : ''}</td></tr>`)}
    </tbody></table>`.toString();
    if (canEdit) $$('[data-tc-remove]', listEl).forEach((b) => b.addEventListener('click', guard(async () => {
      if (!confirm(`Remove ${b.dataset.tcName} as a transaction coordinator for this agent? The person is kept. This does not take anyone off a file.`)) return;
      await api.unlinkAgentTc(agentContactId, b.dataset.tcRemove);
      toast('Transaction coordinator removed');
      await load();
    })));
  };
  async function load() {
    const rows = await api.listAgentTcs(agentContactId);
    paint(rows || []);
    return rows || [];
  }
  const form = $('[data-tc-add]', box);
  if (form && canEdit) {
    const pick = $('[data-tc-pick]', form);
    let directory = [];
    api.listContacts().then((people) => {
      directory = people || [];
      const opts = directory.filter((c) => c && c.id && c.id !== agentContactId && !String(c.id).startsWith('staff:'));
      opts.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
      pick.innerHTML = html`<option value="">Someone new — type them below</option>${opts.map((c) => html`<option value="${c.id}">${nameOf(c)}${c.email ? html` (${c.email})` : ''}</option>`)}`.toString();
    }).catch(() => { /* the list stays on "someone new"; typing still works */ });
    form.addEventListener('submit', guard(async (e) => {
      e.preventDefault();
      showErr('');
      const fd = new FormData(form);
      const picked = String(fd.get('tcContactId') || '');
      const typed = { firstName: fd.get('firstName'), lastName: fd.get('lastName'), email: fd.get('email'), phone: fd.get('phone'), company: fd.get('company') };
      const agent = directory.find((c) => c.id === agentContactId) || { id: agentContactId };
      try {
        if (picked) {
          const chosen = directory.find((c) => c.id === picked) || { id: picked };
          if (sameContactOrEmail(agent, chosen)) { showErr(TC_SELF); return; }
          await api.linkAgentTc(agentContactId, picked);
        } else {
          const problem = newCoordinatorProblem(typed);
          if (problem) { showErr(problem); return; }
          if (!String(typed.firstName || '').trim() && !String(typed.company || '').trim()) { showErr(TC_NEED_PERSON); return; }
          if (sameContactOrEmail(agent, { email: typed.email })) { showErr(TC_SELF); return; }
          await api.createAndLinkAgentTc(agentContactId, typed);
        }
      } catch (err) { showErr(err.message || 'The coordinator was not saved. Check the name and try again.'); throw err; }
      form.reset();
      if (pick) pick.value = '';
      toast('Transaction coordinator added');
      await load();
    }));
  }
  return load().catch((e) => { listEl.innerHTML = html`<p class="err-text" role="alert">${e.message || 'The list could not be loaded. Refresh the page and try again.'}</p>`.toString(); });
}
