/* CRM Feedback 27 item 1: edit a note on a lead, client, or company. Fake data only. Notes are not deleted. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const read = (p) => readFileSync(p, 'utf8');
const notesOf = (rec) => (rec.activities || []).filter((a) => a.kind === 'note');
const textOf = (n) => ((n.body && String(n.body).trim()) ? n.body : n.subject);

const storage = mem();
const api = createMockAdapter({ storage, sessionStorage: mem() });
await api.signInDev('u-sp');
const me = await api.crmMe();
const leads = await api.listCrmLeads();
const lead = leads.find((l) => !l.archived && !l.converted);
ok(!!lead, 'a fake lead is available');
const added = await api.addCrmNote('lead', lead.id, 'Pasted on the wrong person');
ok(added.kind === 'note' && added.createdBy === me.id && textOf(added) === 'Pasted on the wrong person', 'the note is stored on that lead');
ok(!(added.modifiedAt && added.createdAt && String(added.modifiedAt) > String(added.createdAt)), 'a new note is not marked edited');

let blank = '';
try { await api.updateCrmNote(added.id, '   '); } catch (e) { blank = e.message; }
ok(blank === 'Write the note first.', 'a blank note is refused');
let long = '';
try { await api.updateCrmNote(added.id, 'x'.repeat(4001)); } catch (e) { long = e.message; }
ok(/4,000 characters/.test(long), 'a note over 4,000 characters is refused in plain words');
const kept = notesOf(await api.getCrmLead(lead.id)).find((n) => n.id === added.id);
ok(textOf(kept) === 'Pasted on the wrong person' && notesOf(await api.getCrmLead(lead.id)).length === 1, 'a refused save keeps the original note and does not add another');

const fixed = await api.updateCrmNote(added.id, 'Called the right person\nAdded the phone number');
ok(textOf(fixed) === 'Called the right person\nAdded the phone number' && fixed.createdBy === me.id, 'the author can add to the note');
ok(String(fixed.modifiedAt) > String(fixed.createdAt), 'an edit records a later time');
const same = await api.updateCrmNote(added.id, 'Called the right person\nAdded the phone number');
ok(same.modifiedAt === fixed.modifiedAt && notesOf(await api.getCrmLead(lead.id)).filter((n) => n.id === added.id).length === 1, 'saving the same words does not create a second note');

const team = createMockAdapter({ storage, sessionStorage: mem() });
await team.signInDev('u-team');
const teamMe = await team.crmMe();
let teamDenied = '';
try { await team.updateCrmNote(added.id, 'Tina rewrites it'); } catch (e) { teamDenied = e.message; }
ok(/wrote this note|admin/.test(teamDenied), 'another CRM user who did not write the note cannot change it');
ok(textOf(notesOf(await api.getCrmLead(lead.id)).find((n) => n.id === added.id)) === textOf(fixed), 'the refused edit leaves the note as the author saved it');

const admin = createMockAdapter({ storage, sessionStorage: mem() });
await admin.signInDev('u-admin');
const adminMe = await admin.crmMe();
const byAdmin = await admin.updateCrmNote(added.id, 'Admin corrected the note');
ok(textOf(byAdmin) === 'Admin corrected the note' && byAdmin.createdBy === me.id && adminMe.isAdmin, 'an admin can correct a note and the author stays the author');

const again = await api.updateCrmNote(added.id, 'Author corrected it after the admin');
ok(textOf(again) === 'Author corrected it after the admin', 'the author can still edit after an admin does');

const proc = createMockAdapter({ storage, sessionStorage: mem() });
await proc.signInDev('u-proc');
const procMe = await proc.crmMe();
let procDenied = '';
try { await proc.updateCrmNote(added.id, 'Processor edit'); } catch (e) { procDenied = e.message; }
ok(!procMe.canEdit && /read-only|Processor/i.test(procDenied), 'a processor still cannot change a note');

const clients = await api.listCrmContacts();
const client = clients.find((c) => !c.archived);
const clientNote = await api.addCrmNote('contact', client.id, 'Note on the client');
const clientFixed = await api.updateCrmNote(clientNote.id, 'Note on the client, corrected');
ok(textOf(notesOf(await api.getCrmContact(client.id)).find((n) => n.id === clientNote.id)) === 'Note on the client, corrected', 'a note on a client can be edited');
ok(clientFixed.id === clientNote.id, 'editing a client note keeps the same note');

const companies = await api.listCrmAccounts();
const company = companies.find((a) => !a.archived);
const companyNote = await api.addCrmNote('account', company.id, 'Note on the company');
await api.updateCrmNote(companyNote.id, 'Note on the company, corrected');
ok(textOf(notesOf(await api.getCrmAccount(company.id)).find((n) => n.id === companyNote.id)) === 'Note on the company, corrected', 'a note on a company can be edited');

const other = leads.find((l) => l.id !== lead.id && !l.archived && !l.converted) || lead;
if (other.id !== lead.id) await api.archiveCrmRecord('lead', other.id, true);
else await api.archiveCrmRecord('lead', lead.id, true);
const archived = await api.getCrmLead(other.id);
const sys = notesOf(archived).find((n) => n.system);
ok(!!sys, 'archiving writes a CRM note');
let sysDenied = '';
try { await api.updateCrmNote(sys.id, 'Change the archive line'); } catch (e) { sysDenied = e.message; }
ok(/cannot be changed/.test(sysDenied), 'a note the CRM wrote cannot be edited');

const { parseHTML } = await import('/tmp/domtest/node_modules/linkedom/worker.js');
const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
globalThis.window = window; globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const { toText } = await import('../js/ui.js');
const { relatedHtml, wireRelated } = await import('../js/pages/crm-forms.js');

const shown = await api.getCrmLead(lead.id);
const host = document.getElementById('app');
host.innerHTML = toText(relatedHtml(shown, { entity: 'lead', entityId: lead.id, me }));
const mine = host.querySelector(`[data-note="${added.id}"]`);
ok(mine && mine.querySelector('[data-note-edit]') && mine.querySelector('[data-note-edited]') && mine.querySelector('textarea').value === 'Author corrected it after the admin', 'the author sees Edit, the edited marker, and the current words');
const buttons = [...host.querySelectorAll('[data-notes] button')].map((b) => b.textContent.trim());
ok(buttons.includes('Edit') && buttons.includes('Save') && buttons.includes('Cancel') && buttons.includes('Add Note') && !buttons.some((t) => /delete/i.test(t)), 'the notes card has Edit and Save, and no Delete');
ok(host.querySelector('[data-notes]').textContent.includes('no delete'), 'the notes card still says notes are kept');

const teamHost = document.createElement('div');
document.body.appendChild(teamHost);
const teamRec = await team.getCrmLead(lead.id);
teamHost.innerHTML = toText(relatedHtml(teamRec, { entity: 'lead', entityId: lead.id, me: teamMe }));
ok(teamHost.querySelector(`[data-note="${added.id}"]`) && !teamHost.querySelector(`[data-note="${added.id}"] [data-note-edit]`), 'someone else sees the note and does not see Edit');
ok(![...teamHost.querySelectorAll('[data-notes] button')].some((b) => /delete/i.test(b.textContent)), 'someone else has no Delete either');

const procHost = document.createElement('div');
document.body.appendChild(procHost);
procHost.innerHTML = toText(relatedHtml(await proc.getCrmLead(lead.id), { entity: 'lead', entityId: lead.id, me: procMe }));
ok(!procHost.querySelector('[data-note-edit]') && !procHost.querySelector('#note-form'), 'a processor does not get Edit or Add Note');

const fresh = await api.addCrmNote('lead', lead.id, 'Pasted on the wrong person');
host.innerHTML = toText(relatedHtml(await api.getCrmLead(lead.id), { entity: 'lead', entityId: lead.id, me }));
let refreshed = false;
wireRelated(host, {
  addCrmNote: async () => { throw new Error('not used'); },
  updateCrmNote: async () => { throw new Error('Only the person who wrote this note, or an admin, can change it.'); },
}, () => { refreshed = true; }, { entity: 'lead', entityId: lead.id, me });
host.querySelector(`[data-note="${fresh.id}"] [data-note-edit]`).click();
const form = host.querySelector(`[data-note="${fresh.id}"] [data-note-form]`);
const box = form.querySelector('textarea');
ok(form.hidden === false && box.value === 'Pasted on the wrong person', 'Edit opens the note with the words already there');
box.value = 'A correction that should stay';
form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 0));
ok(box.value === 'A correction that should stay' && /admin/.test(form.querySelector('[data-note-err]').textContent) && !refreshed, 'a failed save keeps what was typed and says what to do');
form.querySelector('[data-note-cancel]').click();
ok(form.hidden === true && box.value === 'Pasted on the wrong person', 'Cancel puts the original words back');

host.innerHTML = toText(relatedHtml(await api.getCrmLead(lead.id), { entity: 'lead', entityId: lead.id, me }));
wireRelated(host, api, () => { refreshed = true; }, { entity: 'lead', entityId: lead.id, me });
const live = host.querySelector(`[data-note="${fresh.id}"]`);
live.querySelector('[data-note-edit]').click();
const liveBox = live.querySelector('textarea');
liveBox.value = '';
live.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 0));
ok(/Write the note first/.test(live.querySelector('[data-note-err]').textContent) && textOf(notesOf(await api.getCrmLead(lead.id)).find((n) => n.id === fresh.id)) === 'Pasted on the wrong person', 'saving a blank note on the page keeps the saved note');
liveBox.value = 'Fixed from the page';
live.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 20));
ok(refreshed && textOf(notesOf(await api.getCrmLead(lead.id)).find((n) => n.id === fresh.id)) === 'Fixed from the page', 'Save on the page stores the corrected note');

const sysHost = document.createElement('div');
document.body.appendChild(sysHost);
sysHost.innerHTML = toText(relatedHtml(archived, { entity: 'lead', entityId: other.id, me }));
ok(sysHost.querySelector(`[data-note="${sys.id}"]`) && !sysHost.querySelector(`[data-note="${sys.id}"] [data-note-edit]`), 'a CRM note has no Edit button');

const page = read('js/pages/crm.js');
ok(page.includes("relatedHtml(l, { entity: 'lead'") && page.includes("relatedHtml(c, { entity: 'contact'") && page.includes("relatedHtml(a, { entity: 'account'"), 'lead, client, and company records use the same notes list');
ok(!read('js/pages/crm-deals.js').includes('relatedHtml'), 'a CRM deal does not use this notes list');
ok(!read('js/pages/crm-forms.js').includes('deleteCrmNote') && !read('js/data/mock-part-crm.js').includes('deleteCrmNote') && !read('js/data/supabase-crm.js').includes('deleteCrmNote'), 'there is no delete for a note');

console.log(fail ? fail + ' failed' : 'crm note edit passed');
if (fail) process.exit(1);
