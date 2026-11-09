/* Voice test inside a file: read-only header facts, the script, and the panel state rules.
 * Voice is its own header control. It is deliberately NOT in js/data/bot-registry.js (the Bots menu),
 * and it never reads documents, money, contacts, or the database. */
export const EMPTY_REPLY = 'No reply yet. A reply appears only after you press Start and Grok voice is connected.';
export const VOICE_GENERIC = 'You are the voice test on CLA Portal Live Test. You are not connected to a file. Do not invent a file number, an address, a price, or a party. You cannot email, upload, change a file, send a message, or take a payment. If asked to do any of that, say this test cannot take actions.';
export const VOICE_FILE_LIMIT = 'Use only these order-header fields, which were already on screen: file number, address, transaction type, file title, county, opened date, settlement date, phase, and the signed-in role on this file. You do not have documents, prices, loans, cash to close, wire instructions, bank details, or contact details. You cannot email, upload, change a file, send a message, or take a payment. If asked, say this test cannot take actions.';

const clip = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 80);

export function voiceFileFacts(deal) {
  const fileNumber = clip(deal && deal.fileNumber);
  if (!deal || !fileNumber) return { connected: false, fileLabel: 'Not connected to a file', facts: null };
  const address = [deal.street, deal.city, deal.state, deal.zip].map(clip).filter(Boolean).join(', ');
  const facts = {
    fileNumber,
    address,
    transactionType: clip(deal.transactionType),
    fileTitle: clip(deal.fileTitle),
    county: clip(deal.county),
    opened: clip(deal.openDate),
    settlement: clip(deal.closingDate),
    phase: clip(deal.phase),
    yourRole: clip(deal.myRoleLabel || deal.myRole),
  };
  return { connected: true, fileLabel: address ? `${fileNumber} · ${address}` : fileNumber, facts };
}

export function voiceInstructions(facts) {
  if (!facts || !facts.connected || !facts.facts) return VOICE_GENERIC;
  const f = facts.facts;
  return [
    `You are the voice test for file ${f.fileNumber}.`,
    f.address ? `Address: ${f.address}.` : 'Address was not on the order header.',
    f.transactionType ? `Transaction type: ${f.transactionType}.` : '',
    f.fileTitle ? `File title: ${f.fileTitle}.` : '',
    f.county ? `County: ${f.county}.` : '',
    f.opened ? `Opened: ${f.opened}.` : '',
    f.settlement ? `Settlement date: ${f.settlement}.` : '',
    f.phase ? `Phase: ${f.phase}.` : '',
    f.yourRole ? `Signed-in role on this file: ${f.yourRole}.` : '',
    VOICE_FILE_LIMIT,
  ].filter(Boolean).join(' ');
}

export function voiceShellPlan(prev, next) {
  const before = prev || {};
  const after = next || {};
  const sameUser = !!after.userId && after.userId === before.userId;
  const sameDeal = String(after.dealId || '') === String(before.dealId || '');
  if (!sameUser || !sameDeal) return { stop: true, keepOpen: false, clearTranscript: true, reason: !sameUser ? 'person' : 'file' };
  return { stop: false, keepOpen: !!before.open, clearTranscript: false, reason: '' };
}

/* Opening the menu never starts the microphone. Closing it always stops. */
export function voiceOpenPlan(alreadyOpen) {
  return alreadyOpen ? { open: false, start: false, stop: true } : { open: true, start: false, stop: false };
}

export function appendTranscript(current, event) {
  const bit = event && (event.delta || event.transcript);
  if (typeof bit !== 'string' || !/transcript/i.test((event && event.type) || '')) return current || '';
  const base = !current || current === EMPTY_REPLY ? '' : current;
  return (base + bit).slice(-4000);
}
