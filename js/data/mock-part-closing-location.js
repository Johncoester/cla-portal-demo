/* WHERE EACH BUYER / SELLER WILL BE AT CLOSING, mock adapter (mirrors public.closing_party_locations, migration 58). John, Nov 4 2026.
 * One row per Client-Buyer / Client-Seller participant on an order (created on the first answer). Typed fields: inStateAtClosing (boolean),
 * closingLocationState (US code), closingLocationCountry (ISO 3166-1 alpha-2), signingMethod (staff only), answeredAt / answeredBy, updatedAt / updatedBy.
 * Who: the party reads / answers their OWN row; CLA staff read every row on orders they can see; Processor / Admin / Super admin edit any answer and
 * set the signing method; an agent reads their own side's clients (answer only, never the signing method); nobody sees the other side; no deletes. */
import { cleanLocationAnswer, canManageClosingLocations, locationFlag, whereText, CLIENT_PARTY_ROLES, SIGNING_CODES, signingLabel, reminderTitle, stateName } from './closing-location.js?v=202611060027';
import { senderFor } from './email-senders.js?v=202611060027';
const AGENT_FOR = { 'Buyer Agent': 'Client-Buyer', 'Listing Agent': 'Client-Seller' };
export function closingLocationPart({ load, save, needUser, now, fail, nid, isStaffView, dealOr404, contactOf, fileRoles, fullName, notify, prof, localDate }) {
  const rows = () => { const d = load(); if (!Array.isArray(d.closingPartyLocations)) d.closingPartyLocations = []; return d.closingPartyLocations; };
  const parties = (dealId) => { const d = load(); return d.participants.filter((p) => p.dealId === dealId && CLIENT_PARTY_ROLES.includes(p.role))
    .map((p) => ({ p, c: d.contacts.find((z) => z.id === p.contactId) || null })); };
  // what this user may see on this order: 'all' (staff), or the participant rows they may read (own rows + own side's clients for an agent)
  const scope = (u, dealId) => { const deal = dealOr404(u, dealId); if (isStaffView(u)) return { deal, all: true, own: new Set(), read: null };
    const mine = contactOf(u.id); const roles = fileRoles(u.id, dealId); const list = parties(dealId);
    const own = new Set(list.filter(({ c }) => c && mine && c.id === mine.id).map(({ p }) => p.id));
    const sideRoles = roles.map((r) => AGENT_FOR[r]).filter(Boolean);
    const read = new Set([...own, ...list.filter(({ p }) => sideRoles.includes(p.role)).map(({ p }) => p.id)]);
    const agentRows = new Set(list.filter(({ p }) => sideRoles.includes(p.role) && !own.has(p.id)).map(({ p }) => p.id));   // John, Nov 4: agents answer for their side's clients
    return { deal, all: false, own, read, agentRows }; };
  const view = (deal, { p, c }, staff) => { const r = rows().find((z) => z.participantId === p.id) || {};
    const v = { participantId: p.id, dealId: deal.id, partyRole: p.role, name: c ? fullName(c) : '', propertyState: deal.state,
      inStateAtClosing: r.inStateAtClosing ?? null, closingLocationState: r.closingLocationState || null, closingLocationCountry: r.closingLocationCountry || null,
      answeredAt: r.answeredAt || null, answeredBy: r.answeredBy || null, updatedAt: r.updatedAt || null };
    v.whereText = whereText(v, deal.state);
    if (staff) { v.signingMethod = r.signingMethod || 'undecided'; v.signingLabel = signingLabel(v.signingMethod); v.flag = locationFlag(v); }
    return v; };
  const upsert = (deal, pid, patch, u) => { const t = now(); let r = rows().find((z) => z.participantId === pid);
    if (!r) { r = { id: nid('cpl'), dealId: deal.id, participantId: pid, inStateAtClosing: null, closingLocationState: null, closingLocationCountry: null, signingMethod: 'undecided', answeredAt: null, answeredBy: null, createdAt: t };
      rows().push(r); }
    Object.assign(r, patch, { updatedAt: t, updatedBy: u.id }); return r; };
  const answer = (u, dealId, participantId, input, staffEdit) => { const s = scope(u, dealId);
    const one = parties(dealId).find(({ p }) => p.id === participantId) || fail('That buyer / seller is not on this order.');
    if (staffEdit) { if (!canManageClosingLocations(u)) fail('Only the Processor or an Admin can change another party\'s answer.'); }
    else if (!s.own.has(participantId) && !(s.agentRows && s.agentRows.has(participantId))) fail('You can only answer for yourself (or, as the agent, for your own side\'s clients).');
    let v; try { v = cleanLocationAnswer(input, s.deal.state); } catch (e) { fail(e.message); }
    upsert(s.deal, participantId, { ...v, answeredAt: now(), answeredBy: u.id }, u); save(); return view(s.deal, one, isStaffView(u)); };
  // REMINDERS (John, Nov 4): while a buyer / seller on an OPEN order has not answered and the closing is not scheduled, they get one reminder a day:
  // a bell notification + an email QUEUED in the outbox (never sent) + a typed reminder row (closingLocationReminders) for reporting. Answered -> no more.
  const remRows = () => { const d = load(); if (!Array.isArray(d.closingLocationReminders)) d.closingLocationReminders = []; return d.closingLocationReminders; };
  const due = (dealId = null) => { const d = load(); const out = [];
    d.deals.filter((x) => (!dealId || x.id === dealId) && x.status === 'Open' && !x.scheduledClosing).forEach((deal) => parties(deal.id).forEach(({ p, c }) => {
      const pr = c && c.profileId && prof(c.profileId); if (!pr || pr.status !== 'active') return;
      const r = rows().find((z) => z.participantId === p.id); if (r && r.inStateAtClosing != null) return;
      out.push({ deal, p, c, profileId: pr.id, email: pr.email }); })); return out; };
  function sweep(dealId = null, by = null) { const today = localDate(); let n = 0;
    for (const x of due(dealId)) {
      if (remRows().some((z) => z.participantId === x.p.id && z.profileId === x.profileId && z.remindedOn === today)) continue;
      const title = reminderTitle(x.deal); const link = `#/deals/${x.deal.id}/closing`;
      notify([x.profileId], { kind: 'closing_location', dealId: x.deal.id, title, link });
      const nn = load().notifications.filter((z) => z.profileId === x.profileId && z.kind === 'closing_location').slice(-1)[0];
      const ob = { id: nid('ob'), channel: 'email', kind: 'closing_location_reminder', status: 'queued', toProfileId: x.profileId, toEmail: x.email, subject: title,
        body: `Will you be in ${stateName(x.deal.state)} at the time of closing? If you will be in another state or outside the US, CLA Title will arrange a remote (RON), embassy or out-of-state signing. Answer here: ${link}`,
        link, taskId: null, dealId: x.deal.id, createdBy: by, createdAt: now(), sentAt: null };
      Object.assign(ob, senderFor(load(), 'processor', x.deal.id)); load().outbox.push(ob);
      remRows().push({ id: nid('clr'), dealId: x.deal.id, participantId: x.p.id, profileId: x.profileId, partyRole: x.p.role, remindedOn: today, notificationId: nn ? nn.id : null, outboxId: ob.id, createdAt: now(), createdBy: by });
      n++; }
    if (n) save(); return n; }
  return {
    // send today's reminders (system sweep; also run at sign-in). Staff may run it for one order. Nothing is emailed: outbox only.
    async remindClosingLocations(dealId = null) { const u = needUser(); if (dealId) dealOr404(u, dealId); if (!isStaffView(u)) fail('CLA staff run the reminders.'); return sweep(dealId, u.id); },
    _sweepClosingLocationReminders: (dealId = null) => sweep(dealId, null),
    // the signed-in party's own unanswered prompt on an order (overview card): [] once answered or once the closing is scheduled
    async closingLocationPrompt(dealId) { const u = needUser(); const s = scope(u, dealId); if (s.all || s.deal.scheduledClosing) return [];
      return parties(dealId).filter(({ p }) => s.own.has(p.id)).map((x) => view(s.deal, x, false)).filter((v) => v.inStateAtClosing == null); },
    async listClosingLocationReminders(dealId) { const u = needUser(); dealOr404(u, dealId); const staff = isStaffView(u);
      return remRows().filter((z) => z.dealId === dealId && (staff || z.profileId === u.id)).map((z) => ({ ...z })); },
    // the rows this user may see on the order (staff: every Client-Buyer / Client-Seller; a client: their own; an agent: their side's clients)
    async listClosingLocations(dealId) { const u = needUser(); const s = scope(u, dealId);
      return parties(dealId).filter(({ p }) => s.all || s.read.has(p.id)).map((x) => ({ ...view(s.deal, x, s.all), mine: s.own.has(x.p.id), forClient: !!(s.agentRows && s.agentRows.has(x.p.id)), canAnswer: s.own.has(x.p.id) || !!(s.agentRows && s.agentRows.has(x.p.id)) || (s.all && canManageClosingLocations(u)) })); },
    async answerClosingLocation(dealId, participantId, input) { return answer(needUser(), dealId, participantId, input, false); },
    async setClosingLocation(dealId, participantId, input) { return answer(needUser(), dealId, participantId, input, true); },
    async setSigningMethod(dealId, participantId, method) { const u = needUser(); const s = scope(u, dealId);
      if (!canManageClosingLocations(u)) fail('Only the Processor or an Admin sets the signing method.');
      if (!SIGNING_CODES.includes(method)) fail('Pick a signing method from the list.');
      const one = parties(dealId).find(({ p }) => p.id === participantId) || fail('That buyer / seller is not on this order.');
      upsert(s.deal, participantId, { signingMethod: method }, u); save(); return view(s.deal, one, true); },
    // staff only: the flags (parties who will not be in the property's state at closing)
    async closingLocationFlags(dealId) { const u = needUser(); if (!isStaffView(u)) return []; const s = scope(u, dealId);
      return parties(dealId).map((x) => view(s.deal, x, true)).filter((v) => v.flag).map((v) => ({ participantId: v.participantId, ...v.flag, signingMethod: v.signingMethod, signingLabel: v.signingLabel })); },
  };
}
