/* Test-account address helpers. Nov 16 (John, Claude's PR 293 audit): a walkthrough send goes only to E2E_MAIL_TO.
 * Addresses on the test file are never recipients. The file name stays so seed-accounts.mjs and the specs keep their imports. */

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function splitMailbox(addr) {
  const a = normalizeEmail(addr);
  const at = a.lastIndexOf('@');
  if (at < 1) return null;
  return { local: a.slice(0, at), domain: a.slice(at + 1), all: a };
}

/* clatestportal@gmail.com + tag "e2e-buyer" -> clatestportal+e2e-buyer@gmail.com
 * qa@clatitle.com + tag "e2e-buyer" -> qa+e2e-buyer@clatitle.com
 * A base that already contains + cannot grow another alias. */
export function plusAlias(base, tag) {
  const box = splitMailbox(base);
  const extra = String(tag || '').trim().toLowerCase();
  if (!box || !/^[a-z0-9._-]{1,48}$/.test(extra) || box.local.includes('+')) return '';
  return `${box.local}+${extra}@${box.domain}`;
}

export function mailTo() {
  return normalizeEmail(process.env.E2E_MAIL_TO || '');
}

/* Who a walkthrough send may email. partyAddresses are addresses found on the file; they are never returned.
 * mailTo is E2E_MAIL_TO. A blank or non-email value fails closed: ok is false and to is empty. */
export function e2eMailRecipients(partyAddresses, mailTo) {
  const blocked = [];
  const seen = new Set();
  for (const raw of partyAddresses || []) {
    const a = normalizeEmail(raw);
    if (!splitMailbox(a) || seen.has(a)) continue;
    seen.add(a);
    blocked.push(a);
  }
  const inbox = normalizeEmail(mailTo);
  if (!splitMailbox(inbox)) return { ok: false, to: [], blocked };
  return { ok: true, to: [inbox], blocked: blocked.filter((a) => a !== inbox) };
}

export const ROLE_TAGS = {
  superAdmin: 'e2e-super-admin',
  processor: 'e2e-processor',
  salesPerson: 'e2e-sales-person',
  salesTeam: 'e2e-sales-team',
  coordinator: 'e2e-coordinator',
  buyerAgent: 'e2e-buyer-agent',
  listingAgent: 'e2e-listing-agent',
  buyer: 'e2e-buyer',
  seller: 'e2e-seller',
  invitee: 'e2e-invitee',
};
