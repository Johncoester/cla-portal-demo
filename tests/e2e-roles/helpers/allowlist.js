/* Recipients this suite is willing to email.
 * A recipient must be E2E_MAIL_TO or a plus-alias of it, and must also be an
 * address the Live Test server itself will accept. */

const EMAIL = /^[a-z0-9._%+'-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/;

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

/* Same Live Test rule as js/data/gmail-email.js and gmail-core.mjs. */
export function portalAllows(addr) {
  const a = normalizeEmail(addr);
  if (!EMAIL.test(a) || a.includes('..')) return false;
  if (a === 'clatestportal@gmail.com' || a === 'jcoester-6jkr3p@mail.grokbot.com') return true;
  if (/^clatestportal\+[a-z0-9._-]{1,64}@gmail\.com$/.test(a)) return true;
  return /^[a-z0-9._%+'-]+@clatitle\.com$/.test(a);
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

export function isPlusAliasOf(base, addr) {
  const root = splitMailbox(base);
  const who = splitMailbox(addr);
  if (!root || !who || who.domain !== root.domain) return false;
  if (who.all === root.all) return true;
  if (root.local.includes('+')) return false;
  const prefix = root.local + '+';
  if (!who.local.startsWith(prefix)) return false;
  const tag = who.local.slice(prefix.length);
  return /^[a-z0-9._-]{1,64}$/.test(tag);
}

export function mailTo() {
  return normalizeEmail(process.env.E2E_MAIL_TO || '');
}

/* Throws. Call this before any invite or file send. */
export function assertRecipientsAllowed(addresses, { base = mailTo(), label = 'recipient' } = {}) {
  if (!base) {
    const err = new Error('Abort: E2E_MAIL_TO is not set, so no email can be sent.');
    err.code = 'E2E_ALLOWLIST';
    throw err;
  }
  const list = [].concat(addresses || []).map(normalizeEmail).filter(Boolean);
  if (!list.length) {
    const err = new Error(`Abort: ${label} list is empty.`);
    err.code = 'E2E_ALLOWLIST';
    throw err;
  }
  const bad = [];
  for (const addr of list) {
    if (!isPlusAliasOf(base, addr) || !portalAllows(addr)) bad.push(addr);
  }
  if (bad.length) {
    const err = new Error(`Abort: ${label} is outside the test inbox allowlist (${bad.join(', ')}). Nothing was sent.`);
    err.code = 'E2E_ALLOWLIST';
    throw err;
  }
  return list;
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
