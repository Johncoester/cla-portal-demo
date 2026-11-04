// AGENT INVITES (John, Nov 4): CLA staff (Processor, Sales Person, Sales Team, TC, Admin) invite a real estate agent to the portal from a file or the
// contacts / CRM, see each invite's status (pending, accepted, expired, revoked) and Resend (new link) or Revoke (retired, never deleted).
// NOTHING IS SENT: the portal sends no email. The one-time link is shown on screen to copy.
import { html, raw, $, $$, guard, toast, fmtDateTime } from '../ui.js?v=202611041817';
import { STATUS_LABEL, NO_EMAIL_NOTE } from '../data/agent-profile.js?v=202611041817';
const PILL = { pending: 'warn', accepted: 'ok', expired: 'bad', revoked: '' };
const abs = (link) => location.href.split('#')[0] + link;
export async function render({ api, refresh }) {
  const q = new URLSearchParams(location.hash.split('?')[1] || ''); const pre = q.get('contact') || ''; const preDeal = q.get('deal') || ''; const flt = q.get('status') || '';
  const [list, cands] = await Promise.all([api.listAgentInvites(), api.listAgentInviteCandidates()]);
  const shown = list.filter((i) => !flt || i.status === flt); const count = (s) => list.filter((i) => i.status === s).length;
  const opts = cands.filter((c) => !c.hasLogin).map((c) => html`<option value="${c.contactId}"${c.contactId === pre ? raw(' selected') : ''}${c.pendingInviteId ? raw(' data-pending') : ''}>${c.firstName} ${c.lastName}${c.company ? ` (${c.company})` : ''}${c.files.length ? ` · ${c.files.map((f) => `${f.fileNumber} ${f.role}`).join(', ')}` : ''}${c.pendingInviteId ? ' · invite pending' : ''}</option>`);
  const files = [...new Map(cands.flatMap((c) => c.files).map((f) => [f.dealId, f])).values()];
  const rows = shown.map((i) => html`<tr data-invite-row="${i.id}" data-invite-status="${i.status}"><td><strong>${i.firstName} ${i.lastName}</strong><br><span class="muted small">${i.email}</span></td>
    <td><span class="pill ${PILL[i.status] || ''}" data-status-pill>${STATUS_LABEL[i.status]}</span>${i.resentCount ? html` <span class="muted small">resent ${i.resentCount}&times;</span>` : ''}</td>
    <td>${i.fileNumber || html`<span class="muted">&mdash;</span>`}</td><td class="small">${fmtDateTime(i.createdAt)}<br><span class="muted">by ${i.createdByName}</span></td>
    <td class="small">${i.status === 'accepted' ? html`Accepted ${fmtDateTime(i.acceptedAt)}` : i.status === 'revoked' ? html`Revoked ${fmtDateTime(i.revokedAt)}` : html`${i.status === 'expired' ? 'Expired' : 'Expires'} ${fmtDateTime(i.expiresAt)}`}</td>
    <td class="nowrap">${i.link ? html`<button class="ghost" data-show-link="${i.id}">Show link</button> ` : ''}${['pending', 'expired'].includes(i.status) ? html`<button class="ghost" data-resend="${i.id}">Resend</button> <button class="ghost" data-revoke="${i.id}">Revoke</button>` : ''}</td></tr>`);
  const tabs = [['', 'All', list.length], ['pending', 'Pending', count('pending')], ['accepted', 'Accepted', count('accepted')], ['expired', 'Expired', count('expired')], ['revoked', 'Revoked', count('revoked')]];
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Agent Invites</h2></div>
    <div class="ai-layout">
    <form class="card ai-new" data-invite-form><h3>Invite an agent to the portal</h3>
      <label>From your contacts / CRM or a file<select name="contactId" data-invite-contact><option value="">&mdash; a new person (type below) &mdash;</option>${opts}</select></label>
      <div class="form-grid" data-invite-new><label>First name<input name="firstName" maxlength="80"></label><label>Last name<input name="lastName" maxlength="80"></label><label class="span2">Email<input name="email" type="email" maxlength="160"></label></div>
      <label>Link it to a file (optional)<select name="dealId" data-invite-deal><option value="">No file</option>${files.map((f) => html`<option value="${f.dealId}"${f.dealId === preDeal ? raw(' selected') : ''}>${f.fileNumber}</option>`)}</select></label>
      <button class="m-btn" type="submit" data-invite-create>Create invite link</button>
      <p class="muted small">${NO_EMAIL_NOTE}</p>
      <div class="ai-link" data-invite-result hidden></div></form>
    <div class="ai-list"><ul class="nav-tabs">${tabs.map(([k, l, n]) => html`<li><a class="${k === flt ? 'active' : ''}" href="#/agent-invites${k ? '?status=' + k : ''}" data-invite-tab="${k || 'all'}">${l} <span class="tab-count">${n}</span></a></li>`)}</ul>
      <table class="tbl striped" data-invite-table><thead><tr><th>Agent</th><th>Status</th><th>File</th><th>Invited</th><th>Link</th><th></th></tr></thead><tbody>${rows.length ? rows : html`<tr><td colspan="6" class="muted">No invites here.</td></tr>`}</tbody></table></div></div>`;
  return { title: 'Agent Invites', crumbs: [['Agent Invites']], body, mount(root) {
    const f = $('[data-invite-form]', root); const res = $('[data-invite-result]', root); const cSel = $('[data-invite-contact]', f);
    const toggle = () => { $('[data-invite-new]', f).hidden = !!cSel.value; }; cSel.addEventListener('change', toggle); toggle();
    const showLink = (r, what) => { res.hidden = false; res.innerHTML = html`<p><strong>${what}</strong> for ${r.firstName} ${r.lastName} (${r.email}). Not sent: copy it and send it yourself.</p>
      <div class="ai-link-row"><input readonly value="${abs(r.link)}" data-invite-link aria-label="One-time invite link"><button type="button" class="m-btn" data-copy-link>Copy</button></div>
      <p class="muted small">Works once, until ${fmtDateTime(r.expiresAt)}. Resend makes a new link and the old one stops working.</p>`.toString();
      $('[data-copy-link]', res).addEventListener('click', async () => { const i = $('[data-invite-link]', res); i.select(); try { await navigator.clipboard.writeText(i.value); toast('Link copied'); } catch (e) { toast('Select the link and copy it'); } }); };
    f.addEventListener('submit', guard(async (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(f).entries());
      const r = await api.createAgentInvite(d.contactId ? { contactId: d.contactId, dealId: d.dealId || null } : { firstName: d.firstName, lastName: d.lastName, email: d.email, dealId: d.dealId || null });
      toast('Invite created (nothing sent)'); sessionStorage.setItem('cla-portal-new:last-invite', JSON.stringify(r)); refresh(); }));
    const last = sessionStorage.getItem('cla-portal-new:last-invite'); if (last) { sessionStorage.removeItem('cla-portal-new:last-invite'); try { const r = JSON.parse(last); showLink(r, r.resentCount ? 'New link' : 'Invite link'); } catch (e) { /* ignore */ } }
    $$('[data-show-link]', root).forEach((b) => b.addEventListener('click', () => { const r = list.find((i) => i.id === b.dataset.showLink); showLink(r, 'Invite link'); res.scrollIntoView({ block: 'nearest' }); }));
    $$('[data-resend]', root).forEach((b) => b.addEventListener('click', guard(async () => { const r = await api.resendAgentInvite(b.dataset.resend); toast('New link made (nothing sent)'); sessionStorage.setItem('cla-portal-new:last-invite', JSON.stringify(r)); refresh(); })));
    $$('[data-revoke]', root).forEach((b) => b.addEventListener('click', guard(async () => { if (!confirm('Revoke this invite? The link stops working. The invite stays in the list as Revoked.')) return; await api.revokeAgentInvite(b.dataset.revoke); toast('Invite revoked'); refresh(); })));
  } };
}
