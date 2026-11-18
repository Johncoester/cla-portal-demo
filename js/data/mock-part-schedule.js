/* mock adapter: closing (settlement) scheduling. The processor sends a request with time options; each SIDE (buyer / seller) answers through its own
 * link (#/schedule/<token>, works without signing in, like the old portal's hashed scheduler links); the processor confirms one time; a request can be reopened.
 * Nothing is emailed from this build: links are shown to staff to copy, and in-app notifications are created.
 * Matt: the request's closing location defaults to the closest CLA Title office. Each side picks a location plus the dates and times that work.
 * The processor sees both answers on the file. */
import { OFFICE_LOCATION, officeAddress } from './offices.js?v=202611245800';
import { closingOfficeChoices, officeById, officeNameOf, officeRows } from './mock-part-offices.js?v=202611245800';
import { cleanScheduleAnswers, schedulePatch, schedulingToldEmail, settlementAgentChoices, INVITE_FROM, INVITE_FROM_NAME, schedulingFromDeal } from './scheduling-details.js?v=202611245800';
import { cleanSideAgent, reminderEmptyMessage, reminderMessage, reminderRecipients, sideAgentFromDeal, sideAgentPatch } from './scheduling-agent.js?v=202611245800';
export function closingSchedule(x) {
  const { load, save, nid, me, needUser, needProcessor, dealOr404, onDeal, fileRole, log, nameOf, notify, dealProfileIds, prof, contactOf, clone, now, fail, str, C } = x;
  const SIDES = ['buyer', 'seller'];
  const token = (side) => { const a = new Uint8Array(16); (globalThis.crypto || {}).getRandomValues ? globalThis.crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.floor(Math.random() * 256); });
    return side + '-' + [...a].map((b) => b.toString(16).padStart(2, '0')).join(''); };
  const sideProfiles = (dealId, side) => { const d = load(); return d.participants.filter((p) => p.dealId === dealId && C.sideOf(p.role) === side)
    .map((p) => (d.contacts.find((c) => c.id === p.contactId) || {}).profileId).filter(Boolean); };
  const byToken = (t) => { const tok = str(t, 100); const s = tok && load().settlements.find((z) => SIDES.some((sd) => z.tokens[sd] === tok)); if (!s) fail('This scheduling link is not valid.'); return [s, SIDES.find((sd) => s.tokens[sd] === tok)]; };
  const partyLink = (t) => { const tok = str(t, 80); const link = tok && (load().schedulingLinks || []).find((z) => z.token === tok);
    if (!link) fail('This scheduling link is not valid. Ask your agent to send a new one.');
    if (link.expiresAt && Date.parse(link.expiresAt) < Date.now()) fail('This scheduling link has expired. Ask your agent to send a new one.');
    return link; };
  const cleanSlots = (slots) => { const list = (Array.isArray(slots) ? slots : []).map((v) => str(v, 16)).filter(Boolean);
    if (!list.length || list.length > 5) fail('Offer between 1 and 5 time options.');
    list.forEach((v) => { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) || isNaN(Date.parse(v))) fail('Each option needs a date and time.'); if (Date.parse(v) < Date.now()) fail('Time options must be in the future.'); });
    if (new Set(list).size !== list.length) fail('Time options must be different.'); return list.sort(); };
  const responsesOf = (s, round) => load().settlementResponses.filter((r) => r.settlementId === s.id && r.round === round);
  // A chosen place. Empty input keeps the request's place (including an older free-text location). A new choice must be one of the closing locations.
  const placeOf = (location, officeId, fallbackLoc, fallbackOffice) => {
    const sent = !(location == null || location === '');
    if (!sent && (officeId == null || officeId === '')) return { location: fallbackLoc || '', officeId: fallbackOffice || null };
    let loc = sent ? str(location, 60) : ''; let off = officeId == null || officeId === '' ? '' : str(officeId, 40);
    if (!loc && off) loc = OFFICE_LOCATION;
    if (loc === OFFICE_LOCATION) { if (!off) off = fallbackOffice || ''; const o = off && officeById(load(), off); if (!o || !o.active) fail('Pick an active CLA Title office.'); return { location: loc, officeId: o.id }; }
    if (off) fail('Only a CLA Title office closing names an office.');
    if (loc && !C.CLOSING_LOCATIONS.includes(loc)) fail(`Pick where to sign: ${C.CLOSING_LOCATIONS.join(', ')}.`);
    return { location: loc, officeId: null };
  };
  const answerView = (r) => ({ ...r, location: r.location || '', officeId: r.officeId || null, officeName: officeNameOf(load(), r.officeId) });
  return {
    async listSettlements(dealId) {
      let u = needUser(); u = onDeal(u, dealId); const mySide = C.sideOf(u.role); const staff = C.runsOrders(u) || u.isAdmin;
      return clone(load().settlements.filter((s) => s.dealId === dealId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((s) => ({
        ...s, officeId: s.officeId || null, officeName: officeNameOf(load(), s.officeId), tokens: staff ? s.tokens : undefined, myLink: !staff && mySide && s.status === 'open' ? `#/schedule/${s.tokens[mySide]}` : null, mySide,
        responses: responsesOf(s, s.round).filter((r) => !C.isClient(u.role) || r.side === mySide).map(answerView), createdByName: nameOf(s.createdBy) })));
    },
    async createSettlementRequest(dealId, { slots, location, note, officeId } = {}) {
      const u = needProcessor(); const d = load(); const deal = d.deals.find((z) => z.id === dealId) || fail('Order not found.');
      if (d.settlements.some((s) => s.dealId === dealId && s.status === 'open')) fail('There is already an open closing request for this order.');
      const nearest = closingOfficeChoices(d, deal);
      const blank = (location == null || location === '') && (officeId == null || officeId === '');
      const place = blank ? { location: nearest.officeId ? OFFICE_LOCATION : '', officeId: nearest.officeId } : placeOf(location, officeId, '', nearest.officeId);
      const s = { id: nid('s'), dealId, status: 'open', round: 1, slots: cleanSlots(slots), location: place.location, officeId: place.officeId, note: str(note, 1000), tokens: { buyer: token('buyer'), seller: token('seller') },
        confirmedSlot: null, createdBy: u.id, createdAt: now(), confirmedAt: null, history: [] };
      d.settlements.push(s); log(dealId, u.id, 'settlement.requested', 'settlement', s.id, `Closing date request sent with ${s.slots.length} option(s)`);
      SIDES.forEach((sd) => notify(sideProfiles(dealId, sd), { kind: 'settlement', dealId, title: `Please pick a closing time for ${deal.street}`, link: `#/schedule/${s.tokens[sd]}` }, u.id));
      save(); return clone(s);
    },
    // Public link page (no sign-in needed). Shows only what that side needs.
    async getSchedulingLink(tok) {
      const [s, side] = byToken(tok); const d0 = load(); const deal = d0.deals.find((z) => z.id === s.dealId); const r = responsesOf(s, s.round).find((z) => z.side === side);
      const nearest = closingOfficeChoices(d0, deal);
      const offices = officeRows(d0).filter((o) => o.active).map((o) => ({ id: o.id, name: o.name, address: officeAddress(o), state: o.state }));
      return clone({ side, fileNumber: deal.fileNumber, street: deal.street, city: deal.city, state: deal.state, zip: deal.zip, slots: s.slots, location: s.location, officeId: s.officeId || null, officeName: officeNameOf(d0, s.officeId),
        defaultOfficeId: s.officeId || nearest.officeId, offices, note: s.note, status: s.status, round: s.round, confirmedSlot: s.confirmedSlot,
        response: r ? { picks: r.picks, note: r.note, responderName: r.responderName, at: r.at, location: r.location || '', officeId: r.officeId || null } : null });
    },
    async respondSettlement(tok, { picks, note, name, location, officeId } = {}) {
      const [s, side] = byToken(tok); if (s.status !== 'open') fail('This request is closed. The processor will reopen it if anything changes.');
      const u = me(); const list = [...new Set((Array.isArray(picks) ? picks : []).map(Number))];
      if (list.some((i) => !Number.isInteger(i) || i < 0 || i >= s.slots.length)) fail('Pick from the listed times.');
      const n = str(note, 1000); if (!list.length && !n) fail('Pick at least one time, or tell us what works in the note.');
      const place = placeOf(location, officeId, s.location, s.officeId);
      const who = u ? `${u.firstName} ${u.lastName}` : str(name, 120) || fail('Please enter your name.');
      const d = load(); let r = d.settlementResponses.find((z) => z.settlementId === s.id && z.round === s.round && z.side === side);
      if (!r) { r = { id: nid('sr'), settlementId: s.id, round: s.round, side }; d.settlementResponses.push(r); }
      Object.assign(r, { picks: list.sort(), note: n, location: place.location, officeId: place.officeId, respondedBy: u ? u.id : null, responderName: who, at: now() });
      log(s.dealId, u ? u.id : `link:${side}`, 'settlement.responded', 'settlement', s.id, `${side === 'buyer' ? 'Buyer' : 'Seller'} side answered (${who}): ${list.length} option(s)`);
      notify([load().deals.find((z) => z.id === s.dealId).processorId], { kind: 'settlement', dealId: s.dealId, title: `${side === 'buyer' ? 'Buyer' : 'Seller'} side answered the closing date request`, link: `#/deals/${s.dealId}/closing` }, u && u.id);
      save(); return clone(r);
    },
    async confirmSettlement(id, slotIndex) {
      const u = needProcessor(); const d = load(); const s = d.settlements.find((z) => z.id === id) || fail('Request not found.'); if (s.status !== 'open') fail('Only an open request can be confirmed.');
      const i = Number(slotIndex); if (!Number.isInteger(i) || i < 0 || i >= s.slots.length) fail('Pick one of the offered times.');
      s.status = 'confirmed'; s.confirmedSlot = i; s.confirmedAt = now(); const deal = d.deals.find((z) => z.id === s.dealId); deal.closingDate = s.slots[i].slice(0, 10);
      deal.scheduledClosing = { at: s.slots[i], location: s.location, officeId: s.officeId || null, note: '', confirmedBy: u.id, confirmedAt: now(), proposalId: null, settlementId: s.id };   // shown to everyone on the file
      log(s.dealId, u.id, 'settlement.confirmed', 'settlement', s.id, `Closing confirmed for ${s.slots[i].replace('T', ' ')}`);
      notify(dealProfileIds(s.dealId), { kind: 'settlement', dealId: s.dealId, title: `Closing confirmed: ${s.slots[i].replace('T', ' ')} - ${deal.street}`, link: `#/deals/${s.dealId}/closing` }, u.id);
      save(); return clone(s);
    },
    async reopenSettlement(id, { slots, note } = {}) {
      const u = needProcessor(); const d = load(); const s = d.settlements.find((z) => z.id === id) || fail('Request not found.');
      if (d.settlements.some((z) => z.dealId === s.dealId && z.status === 'open' && z.id !== s.id)) fail('Another request is already open.');
      s.history.push({ round: s.round, slots: s.slots, confirmedSlot: s.confirmedSlot, closedAt: now() });
      if (slots && slots.length) s.slots = cleanSlots(slots); if (note != null) s.note = str(note, 1000);
      s.round += 1; s.status = 'open'; s.confirmedSlot = null; s.confirmedAt = null;
      log(s.dealId, u.id, 'settlement.reopened', 'settlement', s.id, `Closing date request reopened (round ${s.round})`);
      SIDES.forEach((sd) => notify(sideProfiles(s.dealId, sd), { kind: 'settlement', dealId: s.dealId, title: 'The closing time is being rescheduled - please answer again', link: `#/schedule/${s.tokens[sd]}` }, u.id));
      save(); return clone(s);
    },
    // MF-056: the buyer or seller opens the queued link. No sign-in. Nothing is emailed.
    async getPartySchedule(tok) {
      const link = partyLink(tok);
      const d0 = load(); const deal = d0.deals.find((z) => z.id === link.dealId) || fail('This scheduling link is not valid.');
      const near = closingOfficeChoices(d0, deal);
      const offices = officeRows(d0).filter((o) => o.active !== false).map((o) => ({ id: o.id, name: o.name, address: officeAddress(o) }));
      const view = schedulingFromDeal(deal)[link.side];
      return clone({ side: link.side, fileNumber: deal.fileNumber, street: deal.street, city: deal.city, state: deal.state, zip: deal.zip, closingDate: deal.closingDate || '', defaultOfficeId: view.officeId || near.officeId || '', officeHint: near.text || '', offices, answers: view });
    },
    async submitPartySchedule(tok, answers) {
      const link = partyLink(tok); const d = load(); const deal = d.deals.find((z) => z.id === link.dealId) || fail('This scheduling link is not valid.');
      const offices = officeRows(d).filter((o) => o.active !== false).map((o) => ({ id: o.id, name: o.name }));
      const clean = cleanScheduleAnswers({ ...answers, askParty: false }, { side: link.side, offices });
      const kept = deal.closingDate;
      Object.assign(deal, schedulePatch(clean, { by: 'party', officeName: clean.officeId ? officeNameOf(d, clean.officeId) : '' }));
      deal.closingDate = kept;
      link.usedAt = now();
      const agent = link.createdBy ? prof(link.createdBy) : null;
      if (agent && agent.email) {
        const mail = schedulingToldEmail({ side: link.side, agentName: `${agent.firstName || ''} ${agent.lastName || ''}`.trim(), deal, answered: true });
        d.outbox.push({ id: nid('ob'), channel: 'email', kind: 'invite', status: 'queued', sentAt: null, fromEmail: INVITE_FROM, fromName: INVITE_FROM_NAME, from: `${INVITE_FROM_NAME} <${INVITE_FROM}>`, senderType: 'portal', toEmail: agent.email, toName: `${agent.firstName || ''} ${agent.lastName || ''}`.trim(), toProfileId: agent.id, subject: mail.subject, body: mail.body, dealId: deal.id, createdBy: null, createdAt: now(), taskId: null });
      }
      notify([link.createdBy, deal.processorId].filter(Boolean), { kind: 'settlement', dealId: deal.id, title: `The ${link.side} scheduled the settlement`, link: `#/deals/${deal.id}/closing` }, null);
      log(deal.id, link.createdBy || 'link', 'schedule.party', 'deal', deal.id, `${link.side} side scheduled the settlement`);
      save(); return clone({ ok: true, side: link.side });
    },
    async schedulingCopyLinks(dealId) {
      const u = needUser(); onDeal(u, dealId); const staff = C.runsOrders(u) || u.isAdmin;
      const rows = (load().schedulingLinks || []).filter((l) => l.dealId === dealId && (staff || l.createdBy === u.id));
      const latest = ['buyer', 'seller'].map((side) => rows.filter((l) => l.side === side).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]).filter(Boolean);
      return clone(latest.map((l) => ({ side: l.side, path: l.path, createdAt: l.createdAt })));
    },
    async saveSettlementAgent(dealId, input = {}) {
      const u = needProcessor(); const d = load(); const deal = d.deals.find((z) => z.id === dealId) || fail('Order not found.');
      const choices = settlementAgentChoices(d.profiles || []);
      const side = input.side === 'seller' ? 'seller' : 'buyer';
      let clean;
      try { clean = cleanSideAgent({ ...input, side }, choices); }
      catch (err) { fail(err.message); }
      const kept = deal.closingDate; const closer = deal.closerName;
      Object.assign(deal, sideAgentPatch(clean));
      deal.closingDate = kept; deal.closerName = closer;
      log(dealId, u.id, 'schedule.agent', 'deal', dealId, clean.name ? `Settlement agent/notary (${side}): ${clean.name}` : `Settlement agent/notary cleared (${side})`);
      save(); return clone(sideAgentFromDeal(deal, side));
    },
    async previewSchedulingReminder(dealId, side) {
      const u = needProcessor(); onDeal(u, dealId); const d = load();
      const parts = d.participants.filter((p) => p.dealId === dealId).map((p) => {
        const c = d.contacts.find((z) => z.id === p.contactId) || {};
        const pr = c.profileId ? (d.profiles || []).find((z) => z.id === c.profileId) : null;
        return { ...p, removed: !!(pr && pr.status === 'removed'), contact: c };
      });
      return clone(reminderRecipients(parts, side));
    },
    async sendSchedulingReminder(dealId, side) {
      const u = needProcessor(); const preview = await this.previewSchedulingReminder(dealId, side);
      if (!preview.recipients.length) fail(reminderEmptyMessage(preview.side));
      const d = load(); const deal = d.deals.find((z) => z.id === dealId) || fail('Order not found.');
      const kept = deal.closingDate;
      preview.recipients.forEach((r) => {
        const mail = reminderMessage({ side: preview.side, firstName: r.name.split(' ')[0], deal });
        d.outbox.push({ id: nid('ob'), channel: 'email', kind: 'scheduling', status: 'queued', sentAt: null, fromEmail: INVITE_FROM, fromName: INVITE_FROM_NAME, senderType: 'portal', toEmail: r.email, toName: r.name, toProfileId: r.profileId, subject: mail.subject, body: mail.body, dealId, createdBy: u.id, createdAt: now(), templateKey: 'scheduling_reminder' });
      });
      deal.closingDate = kept;
      log(dealId, u.id, 'schedule.reminder', 'deal', dealId, `Settlement reminder emailed to the ${preview.side} side (${preview.recipients.length})`);
      save();
      return clone({ emailed: true, sent: preview.recipients.length, failed: [], recipients: preview.recipients.map((r) => ({ name: r.name, email: r.email, role: r.role })) });
    },
    async saveSchedulingNotes(dealId, notes) {
      const u = needProcessor(); const text = String(notes == null ? '' : notes);
      if (text.trim().length > 2000) fail('Processor notes can be up to 2,000 characters. Shorten the note and save again.');
      const d = load(); const deal = d.deals.find((z) => z.id === dealId) || fail('Order not found.');
      const kept = deal.closingDate;
      deal.schedulingProcessorNotes = text.trim();
      deal.closingDate = kept;
      log(dealId, u.id, 'schedule.notes', 'deal', dealId, 'Processor scheduling notes saved');
      save(); return clone({ notes: deal.schedulingProcessorNotes });
    },
  };
}
