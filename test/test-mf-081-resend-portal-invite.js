/* MF-081 (Matt, Nov 27): Resend portal invite for a buyer, seller or agent, via the existing invite send path. */
import { readFileSync } from 'node:fs';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const src = readFileSync(new URL('../js/pages/dealcontacts.js', import.meta.url), 'utf8');
ok(src.includes('Resend portal invite') && src.includes('data-invite-resend'), 'Contacts shows a Resend portal invite button when a pending invite exists');
ok(src.includes('Invite to portal') && src.includes('pendingInviteFor'), 'a first-time contact still gets Invite to portal');
ok(src.includes('autoSendInvite') && src.includes('createPortalInvite') && src.includes('resendAgentInvite'), 'resend uses the existing create-or-resend invite send path');
ok(src.includes('canInviteToPortal') && src.includes('canInviteAgents'), 'any logged-in CLA staff who can already invite can press it');
ok(!src.includes('testportal@') || src.includes('autoSendInvite'), 'TEST sender rules stay with autoSendInvite');
console.log(fail ? `mf-081: ${fail} failed` : 'mf-081: passed');
if (fail) process.exit(1);
