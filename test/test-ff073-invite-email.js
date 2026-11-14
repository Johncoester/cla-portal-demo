/* FF-073c/d/e and MF-055 points 2-4 (Janine YES 10:43 AM ET Nov 13; John auto-send 1:30 PM ET).
   Nothing is emailed from this test. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { toText } from '../js/ui.js';
import { shouldInviteAfterEmailChange, inviteAfterEmailChange, inviteAfterEmailChangeToast, emailChanged } from '../js/data/invite-send.js';
import { inviteAuthData, inviteSubjectFor, inviteWelcome } from '../supabase/functions/_shared/gmail-core.mjs';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

ok(emailChanged('a@x.com', 'A@x.com') === false && emailChanged('a@x.com', 'b@x.com') === true && emailChanged('', 'b@x.com') === true, 'emailChanged ignores case and empty-to-value counts as a change');
ok(shouldInviteAfterEmailChange('Client-Buyer', 'old@x.com', 'new@x.com') && shouldInviteAfterEmailChange('Client-Seller', 'old@x.com', 'new@x.com') && shouldInviteAfterEmailChange('Buyer Agent', 'old@x.com', 'new@x.com') && shouldInviteAfterEmailChange('Listing Agent', 'old@x.com', 'new@x.com'), 'buyers, sellers and agents are invited after an email change');
ok(!shouldInviteAfterEmailChange('Processor', 'old@x.com', 'new@x.com') && !shouldInviteAfterEmailChange('Client-Buyer', 'same@x.com', 'same@x.com'), 'staff roles and an unchanged email are skipped');

const info = { kind: 'agent', inviteKind: 'client', partyRole: 'buyer', firstName: 'Joyce', street: '6231 Yellowstone Drive', city: 'Some City', state: 'VA', zip: '20100' };
ok(inviteSubjectFor(info).includes('6231 Yellowstone Drive') && inviteWelcome(info).includes('You\'re the buyer for') && inviteWelcome(info).includes('6231 Yellowstone Drive'), 'the welcome email names the buyer and the property address');
const data = inviteAuthData(info, { kind: 'agent', token: 'a'.repeat(64) });
ok(data.property_address.includes('6231 Yellowstone Drive') && data.first_name === 'Joyce' && data.party_role === 'buyer' && data.portal_invite.startsWith('agent.'), 'Auth metadata carries the address, name and role');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
const dealId = 'deal-1';
const buyer = (await api.getDeal(dealId)).participants.find((p) => p.role === 'Client-Buyer');
ok(!!buyer && buyer.contact && buyer.contact.email, 'the mock file has a buyer with an email');
const previous = buyer.contact.email;
const next = 'clatestportal+joyce.new@gmail.com';
const saved = await api.updateContact(buyer.contactId, { email: next });
ok(saved.email === next, 'the contact email was saved');
const sentCalls = [];
const wrap = { ...api, sendInviteEmail: async (a) => { sentCalls.push(a); return { sent: true, to: next, from: 'testportal@clatitle.com' }; } };
const r = await inviteAfterEmailChange(wrap, { dealId, contactId: buyer.contactId, role: 'Client-Buyer', previousEmail: previous, newEmail: next });
ok(r.sent === true && r.to === next && r.link && r.link.includes('#/agent-invite/') && sentCalls.length === 1, 'changing the buyer email creates a new invite and emails it');
ok(/Invite emailed to clatestportal\+joyce\.new@gmail.com from testportal@clatitle.com/.test(inviteAfterEmailChangeToast(r)), 'the toast says the invite was emailed from testportal');
const pending = (await api.listAgentInvites({ status: 'pending' })).filter((i) => i.contactId === buyer.contactId && i.email === next);
ok(pending.length === 1 && pending[0].inviteKind === 'client', 'the new invite is a buyer/seller (client) invite for the new address');

const skipped = await inviteAfterEmailChange(wrap, { dealId, contactId: buyer.contactId, role: 'Client-Buyer', previousEmail: next, newEmail: next });
ok(skipped.skipped === 'unchanged' && inviteAfterEmailChangeToast(skipped) === '', 'saving the same email does not send another invite');

const tpl = readFileSync('supabase/templates/invite.html', 'utf8');
const subj = readFileSync('supabase/templates/invite-subject.txt', 'utf8');
ok(tpl.includes('index .Data "property_address"') && tpl.includes('Accept invitation') && tpl.includes('{{ .ConfirmationURL }}'), 'the Auth template paste-file names the property and keeps the accept button');
ok(subj.includes('CLA Title & Escrow Has Shared Access to') && subj.includes('property_address'), 'the Auth subject paste-file names the property');
const mig = readFileSync('supabase/migrations/20261119130000_invite_after_email_change.sql', 'utf8');
const rb = readFileSync('supabase/rollbacks/20261119130000_invite_after_email_change.sql', 'utf8');
ok(/invite_after_email_change/.test(mig) && /after an email change/.test(mig) && /drop function if exists public.invite_after_email_change/.test(rb), 'the email-change invite has a migration and a rollback');

const signup = await import('../js/pages/agent-signup.js');
const used = await signup.render({ api, params: { token: 'demo-used-ai-1' }, go() {} });
ok(/already used/i.test(toText(used.body)) && toText(used.body).includes('data-invite-signin'), 'a used invite shows the already-used message and Sign in');

console.log(fail ? `FAIL ${fail}` : 'all FF-073 invite email checks passed');
process.exit(fail ? 1 : 0);
