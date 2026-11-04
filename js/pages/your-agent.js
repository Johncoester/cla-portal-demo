// "YOUR AGENT" CARD (John, Nov 4: "remember your agent"). On the buyer / seller (client) portal, every page: the agent's photo, name, brokerage,
// cell and email (tap to call / email). A Client-Buyer sees the buyer's agent on the file, a Client-Seller the listing agent. The data comes from
// api.listMyAgents(), which returns only the card fields (no birthday, no license, no address, nothing about money or wires).
// No agent on the file: no card. No photo: an initials avatar. On a phone it collapses to one compact row with call / email buttons.
import { html, raw } from '../ui.js?v=202611041356';
import { telHref } from '../data/agent-profile.js?v=202611041356';
import { avatarHtml } from './agent-profile-form.js?v=202611041356';
const ico = { phone: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5z"/></svg>' };
export function yourAgentHtml(agents) {
  if (!agents || !agents.length) return '';
  const one = (a) => html`<div class="ya-agent" data-agent-card="${a.side}" data-agent-name="${a.firstName} ${a.lastName}">
      <div class="ya-photo">${avatarHtml(a, 'lg')}</div>
      <div class="ya-who"><strong class="ya-name" data-agent-card-name>${a.firstName} ${a.lastName}</strong>${a.brokerage ? html`<span class="ya-brokerage" data-agent-card-brokerage>${a.brokerage}</span>` : ''}<span class="ya-role">${a.side === 'seller' ? 'Your listing agent' : "Your buyer's agent"}</span></div>
      <ul class="ya-contact">
        ${a.cellPhone ? html`<li><a href="${telHref(a.cellPhone)}" data-agent-tel><span class="ya-ico">${raw(ico.phone)}</span><span class="ya-txt">${a.cellPhone}</span><span class="ya-lbl">cell</span></a></li>` : ''}
        ${a.officePhone ? html`<li class="ya-office"><a href="${telHref(a.officePhone)}" data-agent-office><span class="ya-ico">${raw(ico.phone)}</span><span class="ya-txt">${a.officePhone}</span><span class="ya-lbl">office</span></a></li>` : ''}
        ${a.email ? html`<li><a href="mailto:${a.email}" data-agent-mailto><span class="ya-ico">${raw(ico.mail)}</span><span class="ya-txt">${a.email}</span></a></li>` : ''}
      </ul></div>`;
  return html`<aside class="your-agent" data-your-agent aria-label="Your agent"><div class="ya-head">${agents.length > 1 ? 'Your agents' : 'Your agent'}</div>${agents.map(one)}
    <p class="ya-foot">Questions about your home? Your agent is one tap away.</p></aside>`;
}
