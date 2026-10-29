/* mock adapter: closing (settlement) scheduling. The processor sends a request with time options; each SIDE (buyer / seller) answers through its own
 * link (#/schedule/<token>, works without signing in, like the old portal's hashed scheduler links); the processor confirms one time; a request can be reopened.
 * Nothing is emailed from this build: links are shown to staff to copy, and in-app notifications are created. */
export function closingSchedule(x) {
  const { load, save, nid, me, needUser, needProcessor, dealOr404, onDeal, fileRole, log, nameOf, notify, dealProfileIds, prof, contactOf, clone, now, fail, str, C } = x;
  const SIDES = ['buyer', 'seller'];
  const token = (side) => { const a = new Uint8Array(16); (globalThis.crypto || {}).getRandomValues ? globalThis.crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.floor(Math.random() * 256); });
    return side + '-' + [...a].map((b) => b.toString(16).padStart(2, '0')).join(''); };
  const sideProfiles = (dealId, side) => { const d = load(); return d.participants.filter((p) => p.dealId === dealId && C.sideOf(p.role) === side)
    .map((p) => (d.contacts.find((c) => c.id === p.contactId) || {}).profileId).filter(Boolean); };
  const byToken = (t) => { const tok = str(t, 100); const s = tok && load().settlements.find((z) => SIDES.some((sd) => z.tokens[sd] === tok)); if (!s) fail('This scheduling link is not valid.'); return [s, SIDES.find((sd) => s.tokens[sd] === tok)]; };
  const cleanSlots = (slots) => { const list = (Array.isArray(slots) ? slots : []).map((v) => str(v, 16)).filter(Boolean);
    if (!list.length || list.length > 5) fail('Offer between 1 and 5 time options.');
    list.forEach((v) => { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) || isNaN(Date.parse(v))) fail('Each option needs a date and time.'); if (Date.parse(v) < Date.now()) fail('Time options must be in the future.'); });
    if (new Set(list).size !== list.length) fail('Time options must be different.'); return list.sort(); };
  const responsesOf = (s, round) => load().settlementResponses.filter((r) => r.settlementId === s.id && r.round === round);
  return {
    async listSettlements(dealId) {
      let u = needUser(); u = onDeal(u, dealId); const mySide = C.sideOf(u.role); const staff = C.isProcessor(u.role) || u.isAdmin;
      return clone(load().settlements.filter((s) => s.dealId === dealId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((s) => ({
        ...s, tokens: staff ? s.tokens : undefined, myLink: !staff && mySide && s.status === 'open' ? `#/schedule/${s.tokens[mySide]}` : null, mySide,
        responses: responsesOf(s, s.round).filter((r) => !C.isClient(u.role) || r.side === mySide), createdByName: nameOf(s.createdBy) })));
    },
    async createSettlementRequest(dealId, { slots, location, note }) {
      const u = needProcessor(); const d = load(); const deal = d.deals.find((z) => z.id === dealId) || fail('Order not found.');
      if (d.settlements.some((s) => s.dealId === dealId && s.status === 'open')) fail('There is already an open closing request for this order.');
      const s = { id: nid('s'), dealId, status: 'open', round: 1, slots: cleanSlots(slots), location: str(location, 200), note: str(note, 1000), tokens: { buyer: token('buyer'), seller: token('seller') },
        confirmedSlot: null, createdBy: u.id, createdAt: now(), confirmedAt: null, history: [] };
      d.settlements.push(s); log(dealId, u.id, 'settlement.requested', 'settlement', s.id, `Closing date request sent with ${s.slots.length} option(s)`);
      SIDES.forEach((sd) => notify(sideProfiles(dealId, sd), { kind: 'settlement', dealId, title: `Please pick a closing time for ${deal.street}`, link: `#/schedule/${s.tokens[sd]}` }, u.id));
      save(); return clone(s);
    },
    // Public link page (no sign-in needed). Shows only what that side needs.
    async getSchedulingLink(tok) {
      const [s, side] = byToken(tok); const deal = load().deals.find((z) => z.id === s.dealId); const r = responsesOf(s, s.round).find((z) => z.side === side);
      return clone({ side, fileNumber: deal.fileNumber, street: deal.street, city: deal.city, state: deal.state, slots: s.slots, location: s.location, note: s.note, status: s.status, round: s.round,
        confirmedSlot: s.confirmedSlot, response: r ? { picks: r.picks, note: r.note, responderName: r.responderName, at: r.at } : null });
    },
    async respondSettlement(tok, { picks, note, name }) {
      const [s, side] = byToken(tok); if (s.status !== 'open') fail('This request is closed. The processor will reopen it if anything changes.');
      const u = me(); const list = [...new Set((Array.isArray(picks) ? picks : []).map(Number))];
      if (list.some((i) => !Number.isInteger(i) || i < 0 || i >= s.slots.length)) fail('Pick from the listed times.');
      const n = str(note, 1000); if (!list.length && !n) fail('Pick at least one time, or tell us what works in the note.');
      const who = u ? `${u.firstName} ${u.lastName}` : str(name, 120) || fail('Please enter your name.');
      const d = load(); let r = d.settlementResponses.find((z) => z.settlementId === s.id && z.round === s.round && z.side === side);
      if (!r) { r = { id: nid('sr'), settlementId: s.id, round: s.round, side }; d.settlementResponses.push(r); }
      Object.assign(r, { picks: list.sort(), note: n, respondedBy: u ? u.id : null, responderName: who, at: now() });
      log(s.dealId, u ? u.id : `link:${side}`, 'settlement.responded', 'settlement', s.id, `${side === 'buyer' ? 'Buyer' : 'Seller'} side answered (${who}): ${list.length} option(s)`);
      notify([load().deals.find((z) => z.id === s.dealId).processorId], { kind: 'settlement', dealId: s.dealId, title: `${side === 'buyer' ? 'Buyer' : 'Seller'} side answered the closing date request`, link: `#/deals/${s.dealId}/closing` }, u && u.id);
      save(); return clone(r);
    },
    async confirmSettlement(id, slotIndex) {
      const u = needProcessor(); const d = load(); const s = d.settlements.find((z) => z.id === id) || fail('Request not found.'); if (s.status !== 'open') fail('Only an open request can be confirmed.');
      const i = Number(slotIndex); if (!Number.isInteger(i) || i < 0 || i >= s.slots.length) fail('Pick one of the offered times.');
      s.status = 'confirmed'; s.confirmedSlot = i; s.confirmedAt = now(); const deal = d.deals.find((z) => z.id === s.dealId); deal.closingDate = s.slots[i].slice(0, 10);
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
  };
}
