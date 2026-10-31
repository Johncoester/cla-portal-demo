/* mock adapter: Matt Landsberg's Oct 31 notes, priority 2. Mirrored in SQL by migration 14.
 *  - Agreements: each agent / client on a file acknowledges the Wire Fraud Warning, privacy notice and e-consent; staff see who / when.
 *  - Wire instructions: the BUYER (Client-Buyer) and CLA staff only. FAKE sample instructions + fraud warning; every view is logged.
 *  - Closing proposals: agents and clients propose a date-time + where (CLA office / mobile notary / remote); the processor or
 *    coordinator confirms a scheduled closing, which everyone on the file then sees.
 *  - E-sign (DEMO): processor / coordinator ask specific people to sign a document; each signer gets a 'Sign' task, types their name and
 *    adopts it. Only the signer can sign (an agent cannot sign for a client). Provider seam: esign.js. */
import { AGREEMENTS, agreementOf } from './agreements.js';
import { getProvider, ESIGN_PROVIDER } from './esign.js';
import { WIRE_FRAUD_NOTE, CLA_PHONE } from './constants.js';
export function mattP2(x) {
  const { load, save, nid, needUser, isManager, notViewOnly, onDeal, scopeTo, holds, contactOf, isStaffView, personSide, docVisible, log, prof, nameOf, notify, dealProfileIds, clone, now, fail, str, localDate, C } = x;
  const d0 = () => load();
  const arr = (k) => { const d = d0(); if (!d[k]) d[k] = []; return d[k]; };
  const fileText = (pid, dealId) => x.fileRoleText(pid, dealId);
  // the outside people (with a login) who hold an agent / client role on this file
  const outsidePeople = (dealId) => { const d = d0(); const ids = new Set();
    d.participants.filter((p) => p.dealId === dealId && C.OUTSIDE_FILE_ROLES.includes(p.role)).forEach((p) => { const c = d.contacts.find((z) => z.id === p.contactId); const pr = c && c.profileId && prof(c.profileId);
      if (pr && C.isOutside(pr.role) && pr.status !== 'removed') ids.add(pr.id); });
    return [...ids]; };
  const whenOk = (v, label) => { const s = str(v, 16); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) || isNaN(Date.parse(s))) fail(`${label} needs a date and a time.`);
    if (Date.parse(s) < Date.now()) fail(`${label} must be in the future.`); return s; };
  const locOk = (v) => { const s = str(v, 60); if (!C.CLOSING_LOCATIONS.includes(s)) fail(`Pick where to sign: ${C.CLOSING_LOCATIONS.join(', ')}.`); return s; };
  const reqOr404 = (id) => arr('signatureRequests').find((r) => r.id === id) || fail('Signature request not found.');
  const docName = (id) => (d0().documents.find((z) => z.id === id) || {}).name || 'document';
  const sigOut = (u, r) => ({ ...clone(r), docName: docName(r.docId), requestedByName: nameOf(r.requestedBy), providerLabel: getProvider(r.provider).label,
    signers: r.signers.map((s) => ({ ...s, name: nameOf(s.profileId), canSign: s.profileId === u.id && s.status === 'requested' && r.status === 'requested' })) });
  const normName = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

  x.signInfo = (u, t) => { const r = arr('signatureRequests').find((z) => z.id === t.signatureRequestId); if (!r) return null; const o = sigOut(u, r);
    const mine = o.signers.find((s) => s.profileId === u.id); return { ...o, mine: mine || null, canSign: !!(mine && mine.canSign), expectedName: mine ? nameOf(u.id) : '' }; };

  return {
    // ---------- Agreements ----------
    async listAgreements(dealId) {
      let u = needUser(); u = onDeal(u, dealId); const acks = arr('agreementAcks').filter((a) => a.dealId === dealId); const staff = isStaffView(u);
      const mineNeeded = !staff && !!C.sideOf(u.role);
      const out = { agreements: AGREEMENTS.map((a) => { const m = acks.find((k) => k.code === a.code && k.version === a.version && k.profileId === u.id); return { ...a, myAck: m ? { at: m.at, roleLabel: m.roleLabel } : null }; }), needed: mineNeeded };
      out.pending = mineNeeded ? out.agreements.filter((a) => !a.myAck).length : 0;
      if (staff) out.people = outsidePeople(dealId).map((pid) => ({ profileId: pid, name: nameOf(pid), roleLabel: fileText(pid, dealId),
        acks: Object.fromEntries(AGREEMENTS.map((a) => { const k = acks.find((z) => z.profileId === pid && z.code === a.code && z.version === a.version); return [a.code, k ? { at: k.at, roleLabel: k.roleLabel } : null]; })) }));
      return clone(out);
    },
    async acknowledgeAgreement(dealId, code) {
      let u = needUser(); u = onDeal(u, dealId);
      if (isStaffView(u)) fail('Agreements are acknowledged by the agents and clients on the file, each for themselves.');
      if (!C.sideOf(u.role)) fail('Only the agents and clients on this file acknowledge agreements.');
      const a = agreementOf(code) || fail('Unknown agreement.'); const list = arr('agreementAcks');
      const have = list.find((k) => k.dealId === dealId && k.code === a.code && k.version === a.version && k.profileId === u.id); if (have) return clone(have);
      const k = { id: nid('ack'), dealId, code: a.code, version: a.version, profileId: u.id, roleLabel: fileText(u.id, dealId), at: now() }; list.push(k);
      log(dealId, u.id, 'agreement.acknowledged', 'agreement', a.code, `${nameOf(u.id)} (${k.roleLabel}) acknowledged: ${a.title}`); save(); return clone(k);
    },
    // ---------- Wire instructions: buyer + CLA staff only. FAKE SAMPLE. ----------
    async getWireInstructions(dealId) {
      let u = needUser(); u = onDeal(u, dealId);
      if (!(isStaffView(u) || holds(u, 'Client-Buyer'))) fail('Wire instructions are shown to the buyer only. Please contact CLA Title.');
      const deal = d0().deals.find((z) => z.id === dealId);
      log(dealId, u.id, 'wire.viewed', 'deal', dealId, `Wire instructions viewed by ${nameOf(u.id)}`); save();
      return { sample: true, warning: WIRE_FRAUD_NOTE, claPhone: CLA_PHONE, bankName: 'Example Trust Bank (FAKE - NOT A REAL BANK)', bankAddress: '1 Sample Plaza, Nowhere, MD 00000 (fake)',
        routing: '000000000 (SAMPLE)', account: '0000000000 (SAMPLE)', accountName: 'CLA Title & Escrow - Escrow Account (SAMPLE)', reference: `File ${deal.fileNumber} - ${deal.street}`,
        amountNote: 'Your exact amount comes from your Closing Disclosure / settlement statement. Do not use this sample to send money.' };
    },
    // ---------- Closing: proposals from the file, a confirmed scheduled closing from staff ----------
    async listClosingProposals(dealId) {
      let u = needUser(); u = onDeal(u, dealId); const staff = isStaffView(u); const side = C.sideOf(u.role);
      return clone(arr('closingProposals').filter((p) => p.dealId === dealId && (staff || (side && p.side === side)))
        .map((p) => ({ ...p, proposedByName: nameOf(p.proposedBy) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    },
    async proposeClosing(dealId, { at, location, note } = {}) {
      let u = needUser(); u = onDeal(u, dealId); notViewOnly(u);
      if (isStaffView(u)) fail('CLA staff confirm the closing directly.');
      const side = C.sideOf(u.role) || fail('Only the agents and clients on this file can propose a closing time.');
      const p = { id: nid('cp'), dealId, side, proposedBy: u.id, roleLabel: fileText(u.id, dealId), at: whenOk(at, 'The proposed closing'), location: locOk(location), note: str(note, 500), status: 'proposed', createdAt: now() };
      arr('closingProposals').push(p); const deal = d0().deals.find((z) => z.id === dealId);
      log(dealId, u.id, 'closing.proposed', 'closing', p.id, `${nameOf(u.id)} (${p.roleLabel}) proposed closing ${p.at.replace('T', ' ')} - ${p.location}`);
      notify([deal.processorId], { kind: 'settlement', dealId, title: `${nameOf(u.id)} proposed a closing time for ${deal.street}`, link: `#/deals/${dealId}/closing` }, u.id);
      save(); return clone(p);
    },
    async confirmClosing(dealId, { at, location, note, proposalId } = {}) {
      let u = needUser(); u = onDeal(u, dealId); if (!isManager(u)) fail('Only the processor or coordinator can confirm the closing.');
      const d = d0(); const deal = d.deals.find((z) => z.id === dealId); let p = null;
      if (proposalId) { p = arr('closingProposals').find((z) => z.id === proposalId && z.dealId === dealId) || fail('Proposal not found.'); }
      const sc = { at: whenOk(at || (p && p.at), 'The closing'), location: locOk(location || (p && p.location)), note: str(note, 500), confirmedBy: u.id, confirmedAt: now(), proposalId: p ? p.id : null, settlementId: null };
      if (p) p.status = 'confirmed';
      deal.scheduledClosing = sc; deal.closingDate = sc.at.slice(0, 10);
      log(dealId, u.id, 'closing.confirmed', 'deal', dealId, `Closing scheduled for ${sc.at.replace('T', ' ')} - ${sc.location}${p ? ` (proposed by ${nameOf(p.proposedBy)})` : ''}`);
      notify(dealProfileIds(dealId), { kind: 'settlement', dealId, title: `Closing scheduled: ${sc.at.replace('T', ' ')} - ${sc.location} - ${deal.street}`, link: `#/deals/${dealId}/closing` }, u.id);
      save(); return clone(sc);
    },
    // ---------- E-sign (DEMO provider) ----------
    async listSignatureCandidates(docId) {
      let u = needUser(); const doc = d0().documents.find((z) => z.id === docId && z.dealId) || fail('Document not found.'); u = onDeal(u, doc.dealId);
      if (!isManager(u)) fail('Only the processor or coordinator can request signatures.');
      return outsidePeople(doc.dealId).map((pid) => ({ profileId: pid, name: nameOf(pid), roleLabel: fileText(pid, doc.dealId), canSee: docVisible(scopeTo(prof(pid), doc.dealId), doc) }));
    },
    async requestSignature(docId, { signerIds, message } = {}) {
      let u = needUser(); const d = d0(); const doc = d.documents.find((z) => z.id === docId && z.dealId) || fail('Document not found.'); u = onDeal(u, doc.dealId);
      if (!isManager(u)) fail('Only the processor or coordinator can request signatures.');
      const ids = [...new Set(Array.isArray(signerIds) ? signerIds : [])]; if (!ids.length) fail('Pick at least one person to sign.');
      const people = new Set(outsidePeople(doc.dealId)); const open = arr('signatureRequests').filter((r) => r.docId === docId && r.status === 'requested');
      ids.forEach((pid) => { if (!people.has(pid)) fail('Signers must be agents or clients on this file.');
        if (!docVisible(scopeTo(prof(pid), doc.dealId), doc)) fail(`${nameOf(pid)} cannot see this document. Change "Who can see it" first.`);
        if (open.some((r) => r.signers.some((s) => s.profileId === pid && s.status === 'requested'))) fail(`${nameOf(pid)} already has an open signature request for this document.`); });
      const provider = getProvider(ESIGN_PROVIDER); const env = await provider.createRequest({ documentName: doc.name, signers: ids });
      const r = { id: nid('sig'), dealId: doc.dealId, docId, provider: provider.id, envelopeId: env.envelopeId, message: str(message, 500), status: 'requested', requestedBy: u.id, requestedAt: now(), completedAt: null, signers: [] };
      ids.forEach((pid) => { const c = contactOf(pid); const rows = d.participants.filter((p) => p.dealId === doc.dealId && p.contactId === c.id && C.OUTSIDE_FILE_ROLES.includes(p.role));
        const p = rows.find((z) => C.isClient(z.role)) || rows[0];   // a self-represented person signs as the client
        const t = { id: nid('t'), dealId: doc.dealId, participantId: p.id, templateId: null, templateCode: null, templateVersion: null, kind: 'sign', title: `Sign: ${doc.name}`,
          description: r.message || 'Please review and sign this document.', assignedRole: p.role, status: 'todo', dueDate: localDate(5), formData: {}, savedAt: null, savedBy: null, completedAt: null, completedBy: null,
          signatureRequestId: r.id, createdBy: u.id, createdAt: now() };
        d.tasks.push(t); r.signers.push({ profileId: pid, roleLabel: fileText(pid, doc.dealId), taskId: t.id, status: 'requested', signedAt: null, typedName: null, certificate: null }); });
      arr('signatureRequests').push(r);
      log(doc.dealId, u.id, 'signature.requested', 'document', docId, `Signature requested on ${doc.name} from ${ids.map(nameOf).join(', ')} (demo e-sign)`);
      r.signers.forEach((s) => notify([s.profileId], { kind: 'task', dealId: doc.dealId, title: `Please sign: ${doc.name}`, link: `#/deals/${doc.dealId}/tasks/${s.taskId}` }, u.id));
      save(); return clone(sigOut(u, r));
    },
    async listSignatureRequests(dealId) {
      let u = needUser(); u = onDeal(u, dealId); const staff = isStaffView(u); const side = C.sideOf(u.role);
      return clone(arr('signatureRequests').filter((r) => r.dealId === dealId && (staff || r.signers.some((s) => s.profileId === u.id || (C.isAgent(u.role) && personSide(s.profileId, dealId) === side))))
        .map((r) => sigOut(u, r)).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)));
    },
    async signDocument(requestId, { typedName, adopt } = {}) {
      let u = needUser(); const r = reqOr404(requestId); u = onDeal(u, r.dealId);
      const s = r.signers.find((z) => z.profileId === u.id) || fail('Only the person asked to sign can sign. An agent cannot sign for a client.');
      if (r.status === 'cancelled') fail('This signature request was cancelled.'); if (s.status === 'signed') fail('You already signed this document.');
      const doc = d0().documents.find((z) => z.id === r.docId); if (!doc || !docVisible(u, doc)) fail('You cannot see this document any more. Please contact CLA Title.');
      if (!(adopt === true || adopt === 'on' || adopt === 'true')) fail('Tick "I adopt this as my signature" to sign.');
      const full = nameOf(u.id); if (normName(typedName) !== normName(full)) fail(`Type your full name exactly as shown: ${full}.`);
      const rec = await getProvider(r.provider).recordSignature({ envelopeId: r.envelopeId, signerId: u.id, typedName: str(typedName, 120) });
      Object.assign(s, { status: 'signed', signedAt: now(), typedName: str(typedName, 120), certificate: rec.certificate });
      const t = d0().tasks.find((z) => z.id === s.taskId); if (t) { t.status = 'done'; t.completedAt = now(); t.completedBy = u.id; }
      if (r.signers.every((z) => z.status === 'signed')) { r.status = 'signed'; r.completedAt = now(); }
      log(r.dealId, u.id, 'signature.signed', 'document', r.docId, `${full} (${s.roleLabel}) signed ${doc.name} (demo e-sign)`);
      notify([r.requestedBy], { kind: 'task', dealId: r.dealId, title: `${full} signed ${doc.name}${r.status === 'signed' ? ' - all signatures in' : ''}`, link: `#/deals/${r.dealId}/documents` }, u.id);
      save(); return clone(sigOut(u, r));
    },
    async cancelSignatureRequest(id) {
      let u = needUser(); const r = reqOr404(id); u = onDeal(u, r.dealId); if (!isManager(u)) fail('Only the processor or coordinator can cancel a signature request.');
      if (r.status !== 'requested') fail('Only an open request can be cancelled.');
      await getProvider(r.provider).cancelRequest({ envelopeId: r.envelopeId }); r.status = 'cancelled';
      r.signers.forEach((s) => { const t = d0().tasks.find((z) => z.id === s.taskId); if (t && ['todo', 'in_progress', 'blocked'].includes(t.status)) t.status = 'cancelled'; });
      log(r.dealId, u.id, 'signature.cancelled', 'document', r.docId, `Signature request on ${docName(r.docId)} cancelled`); save(); return true;
    },
  };
}
