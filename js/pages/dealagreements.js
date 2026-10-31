// Agreements tab (Matt, Oct 31): agents and clients acknowledge the Wire Fraud Warning, privacy notice and e-consent, each for themselves.
// CLA staff see who acknowledged what, and when. The wording is SAMPLE text until CLA supplies the final versions.
import { html, $$, guard, fmtDateTime, pill, toast } from '../ui.js';

export async function render({ api, deal, refresh }) {
  const r = await api.listAgreements(deal.id);
  const card = (a) => html`<div class="card" data-agreement="${a.code}"><div class="deal-card-head"><h3>${a.title}</h3>${a.myAck ? pill('acknowledged', 'ok') : r.needed ? pill('please read and acknowledge', 'warn') : ''}</div>
    <p>${a.body}</p>
    ${a.myAck ? html`<p class="muted small done-by">You acknowledged this on ${fmtDateTime(a.myAck.at)} (as ${a.myAck.roleLabel}).</p>`
      : r.needed ? html`<form class="ackf" data-code="${a.code}"><label class="check"><input type="checkbox" name="read" required> I have read and understand the ${a.title}.</label>
        <button class="m-btn" type="submit">Acknowledge</button></form>` : ''}</div>`;
  const staffTable = r.people ? html`<div class="box-title"><h2><span class="h-ico"></span>Who has acknowledged</h2></div>
    ${r.people.length ? html`<table class="tbl striped" id="ack-status"><thead><tr><th>Person</th><th>Role on this file</th>${r.agreements.map((a) => html`<th>${a.title}</th>`)}</tr></thead><tbody>
      ${r.people.map((p) => html`<tr><td>${p.name}</td><td>${p.roleLabel}</td>${r.agreements.map((a) => html`<td>${p.acks[a.code] ? html`<span class="ok-text">&#10003;</span> ${fmtDateTime(p.acks[a.code].at)}` : html`<span class="muted">not yet</span>`}</td>`)}</tr>`)}</tbody></table>`
      : html`<p class="muted">No agents or clients with a portal login on this file yet.</p>`}` : '';
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Agreements</h2></div>
    <p class="muted small">Sample wording for this demo build: CLA Title supplies the final text before go-live.${r.needed ? ' Each person on the file acknowledges for themselves; agents cannot acknowledge for their clients.' : ''}</p>
    ${staffTable}${r.agreements.map(card)}`;
  return { title: 'Agreements', crumbs: [['Agreements']], body, mount(root) {
    $$('form.ackf', root).forEach((f) => f.addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.acknowledgeAgreement(deal.id, f.dataset.code); toast('Thank you. Your acknowledgement is recorded.'); refresh(); })));
  } };
}
