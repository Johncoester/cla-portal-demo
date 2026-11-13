/* FF-055 / MF-048 (Francis, Nov 11; John, Nov 13): Share Files to someone on the file who has no portal login yet.
 * The page spots that person, says what will happen, and the data layer invites them and holds the share. No network. */
import { readFileSync } from 'node:fs';
import { SHARE_INVITE_ROLES, NO_LOGIN_TAG, NO_INVITE_TAG, canShareInvite, noLoginContactId, noLoginNote, ensureShareInvite, shareInviteToast, waitingParticipant } from '../js/data/share-invite.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const parts = [
  { id: 'dp1', contactId: 'c-agent', role: 'Buyer Agent', contact: { id: 'c-agent', profileId: null, firstName: 'Pat', lastName: 'Agent', email: 'pat@example.com' } },
  { id: 'dp2', contactId: 'c-buyer', role: 'Client-Buyer', contact: { id: 'c-buyer', profileId: 'p-buyer', firstName: 'Bea', lastName: 'Buyer' } },
  { id: 'dp3', contactId: 'c-gone', role: 'Listing Agent', removed: true, contact: { id: 'c-gone', profileId: null } },
];

// spotting the person with no login
ok(noLoginContactId({ id: 'c-agent' }, parts) === 'c-agent', 'a file contact with no portal login is spotted by its contact id');
ok(noLoginContactId({ id: 'p-buyer' }, parts) === '', 'someone picked by their portal login is not treated as having no login');
ok(noLoginContactId({ id: 'c-buyer' }, parts) === '', 'a contact that is linked to a login is not invited again');
ok(noLoginContactId({ id: 'c-gone' }, parts) === '', 'a contact removed from the file is not matched');
ok(noLoginContactId({ id: 'p-staff' }, parts) === '' && noLoginContactId(null, parts) === '' && noLoginContactId({ id: 'c-agent' }) === '', 'an id that is not on the file, or no file contacts at all, matches nobody');
ok(noLoginContactId({ id: 'contact:c9' }, []) === 'c9', 'the demo data marks these people "contact:<id>"');
ok(SHARE_INVITE_ROLES.join('|') === 'Client-Buyer|Client-Seller|Buyer Agent|Listing Agent', 'the same four file roles as Invite to portal can be invited');

// who can be invited from Share Files
const lender = [{ id: 'dp9', contactId: 'c-lender', role: 'Lender', contact: { id: 'c-lender', profileId: null } }];
ok(canShareInvite({ id: 'c-agent' }, parts) === true, 'a Buyer Agent with no login can be invited');
ok(canShareInvite({ id: 'c-lender' }, lender) === false && NO_INVITE_TAG === 'no portal login; cannot be invited', 'a lender contact with no login cannot be invited, and the list says so');
ok(canShareInvite({ id: 'c-lender' }, [...lender, { id: 'dp10', contactId: 'c-lender', role: 'Client-Buyer', contact: { id: 'c-lender', profileId: null } }]) === true, 'someone who is also the buyer on the file can be');
ok(canShareInvite({ id: 'p-buyer' }, parts) === false, 'someone with a login is not an invite case');
ok(canShareInvite({ id: 'contact:c9', role: 'Client-Seller' }, []) === true && canShareInvite({ id: 'contact:c9', role: 'Lender' }, []) === false, 'the demo rows go by the role on the row');

// what the person sharing is told
ok(NO_LOGIN_TAG.includes('no portal login yet') && NO_LOGIN_TAG.includes('invited'), 'the To list says the person has no login yet and will be invited');
const note = noLoginNote({ firstName: 'Pat', lastName: 'Agent', email: 'pat@example.com' });
ok(note.startsWith('Pat Agent (pat@example.com) has no portal login yet.') && note.includes('emails them an invite') && note.includes('after they sign in'), 'picking them explains the invite and the hold before Send');
ok(shareInviteToast({ name: 'Pat Agent', email: 'pat@example.com', sent: true }, 2) === 'Invite emailed to Pat Agent (pat@example.com). Pat Agent will see these files after they sign in.', 'after Send: the invite was emailed and the files are waiting');
ok(shareInviteToast({ name: 'Pat Agent', sent: true }, 1).endsWith('Pat Agent will see this file after they sign in.') && shareInviteToast({ name: 'Pat Agent', sent: true }, 0).endsWith('will see this message after they sign in.'), 'the wording fits one file, several files, or a message only');
ok(/already has an invite waiting, so no new email was sent\. Pat Agent will see/.test(shareInviteToast({ name: 'Pat Agent', already: true }, 1)), 'someone already invited is not emailed a second link');
const notSent = shareInviteToast({ name: 'Pat Agent', error: 'Gmail is not connected.' }, 1);
ok(notSent.startsWith('Held for Pat Agent, but the invite was not emailed: Gmail is not connected. Use Invite to portal on File Contacts'), 'if the email did not go out, it says why and what to do, with one period');

// making the invite, or finding the one already waiting
const made = await ensureShareInvite({ createPortalInvite: async (a) => ({ link: '#/agent-invite/' + 'a'.repeat(64), firstName: 'Pat', lastName: 'Agent', email: 'pat@example.com', seen: a }) }, { dealId: 'd1', contactId: 'c-agent' });
ok(made.link.startsWith('#/agent-invite/') && made.already === false && made.name === 'Pat Agent' && made.email === 'pat@example.com', 'a new invite comes back with its one-time link');
const pend = await ensureShareInvite({ createPortalInvite: async () => { throw new Error('There is already a pending invite for that email. Use Resend on Agent Invites.'); } }, { dealId: 'd1', contactId: 'c-agent' });
ok(pend.already === true && pend.link === '', 'an invite that is already pending is kept (no new link, so the emailed one still works)');
let threw = '';
try { await ensureShareInvite({ createPortalInvite: async () => { throw new Error('Enter a valid email for this person.'); } }, { dealId: 'd1', contactId: 'c-agent' }); } catch (e) { threw = e.message; }
ok(threw === 'Enter a valid email for this person.', 'any other invite problem is passed on in its own words');
threw = '';
try { await ensureShareInvite({}, {}); } catch (e) { threw = e.message; }
ok(/Reload the page/.test(threw), 'a page opened before the update says to reload');

// the conversation shows who it is waiting for
const w = waitingParticipant({ contact_id: 'c-agent', display_name: 'Pat Agent', role: 'Buyer Agent' });
ok(w.name === 'Pat Agent' && w.role === 'Buyer Agent, invited, not signed in yet' && w.wireOk === false && w.waiting === true && w.id === 'contact:c-agent', 'the conversation lists the invited person as "invited, not signed in yet", and never as wire-safe');
ok(waitingParticipant({}).name === 'Invited contact', 'a held person with no name still shows');

// wiring: the page
const page = read('js/pages/compose.js');
ok(page.includes('noLoginContactId(p, (deal && deal.participants) || [])') && page.includes('staff ? noLoginContactId'), 'only CLA staff get the invite path, from the file contacts already loaded');
ok(page.includes('data-no-login') && page.includes('NO_LOGIN_TAG') && page.includes('data-invite-note'), 'the To list marks people with no login and a note explains it once picked');
ok(page.includes('inviteContactId: invitee') && page.includes("autoSendInvite(api, 'agent', inv.link)") && page.includes('shareInviteToast(inv, kept)'), 'Send holds the share, emails the invite through the portal mailbox, and says what happened');
ok(/toSel\.value = ''; \}\); syncInvite\(\); \};/.test(page), 'wire-instruction mode clears a picked person with no login and hides the note');
ok(page.includes("raw('disabled data-no-invite')") && page.includes("o.disabled = bad || o.hasAttribute('data-no-invite')"), 'a person who cannot be invited is listed but cannot be picked, in or out of wire mode');

// the Inbox "Start a conversation" box: a person with no login cannot be ticked there, and is pointed to Share Files
const inbox = read('js/pages/dealmsgs.js');
ok(inbox.includes("noLogin(p) ? raw('disabled data-no-login') : ''") && inbox.includes('No portal login yet. Use Share Files to invite them.'), 'Start a conversation lists a person with no login, greyed out, with where to go');

// wiring: the data layer
const ad = read('js/data/supabase-adapter.js');
ok(ad.includes("sb.rpc('create_thread_invited', { p_deal: dealId, p_subject: title, p_contact: inviteContactId, p_body: text || '(file shared)' })"), 'the data layer holds the conversation with create_thread_invited');
ok(ad.includes("ids.length !== 1 || ids[0] !== inviteContactId") && ad.includes('assertRecipients(to, allowed)'), 'the person still has to be on the allowed list, and is the only one in the conversation');
ok(ad.includes('Wire instructions cannot be held for someone who has no portal login yet.'), 'wire instructions are never held for someone with no login');
ok(ad.indexOf("sb.rpc('create_thread_invited'") < ad.indexOf('ensureShareInvite(a, { dealId, contactId: inviteContactId })'), 'the conversation is held first, then the invite is made');
ok(ad.includes('holding files for them is not turned on for this site yet'), 'a site without the database change says so in plain words');
ok(ad.includes("sb.rpc('thread_invitees_list', { p_threads: [id] })") && ad.includes('...waiting.map(waitingParticipant)'), 'opening the conversation shows who it is still waiting for');
ok(ad.includes('...(invited ? { invited, heldForInvite: true } : {})'), 'the result says the share is held and for whom');

// the database change is there, with its rollback
const sql = read('supabase/migrations/20261119030000_share_invited_hold.sql');
ok(sql.includes('create table if not exists public.thread_invitees') && sql.includes('after update of profile_id on public.contacts') && sql.includes('Not applied by this commit.'), 'the migration adds the held list and opens it when the contact gets a login');
ok(!/create or replace function private\.rpc_create_thread\(/.test(sql) && !/create or replace function private\.rpc_message_recipients\(/.test(sql), 'it does not replace the existing conversation or recipient functions');
ok(read('supabase/rollbacks/20261119030000_share_invited_hold.sql').includes('drop table if exists public.thread_invitees'), 'there is a rollback');

console.log(fail ? fail + ' failed' : 'share with an invited contact passed');
if (fail) process.exit(1);
