/* MF-056 Scheduling Details. Fake rows only. No network and no email is sent. */
import { readFileSync } from 'node:fs';
import { toText } from '../js/ui.js';
import {
  SCHEDULE_TIMES, cleanScheduleAnswers, defaultSchedule, scheduleNavLines, schedulePatch, scheduleTaskTitle,
  settlementAgentChoices, resolveSettlementAgent, INVITE_FROM,
} from '../js/data/scheduling-details.js';
import { schedulingPanelHtml } from '../js/pages/scheduling-panel.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const boom = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };

ok(SCHEDULE_TIMES[0] === '09:00' && SCHEDULE_TIMES[SCHEDULE_TIMES.length - 1] === '18:00' && !SCHEDULE_TIMES.includes('08:00') && !SCHEDULE_TIMES.includes('18:30'), 'times run from 9:00 AM through 6:00 PM');
ok(defaultSchedule({ closingDate: '2026-12-02' }, 'buyer', 'off-rockville').date === '2026-12-02', 'the date starts from the contract closing date');
ok(defaultSchedule({ closingDate: null }, 'buyer', '').date === '', 'a contract with no closing date leaves the settlement date blank');
ok(boom(() => cleanScheduleAnswers({ askParty: 'no', date: '', time: '10:00', placeKind: 'office', officeId: 'off-1' }, { side: 'buyer' })).includes('no closing date'), 'a blank date is required when the contract has none');
ok(boom(() => cleanScheduleAnswers({ date: '2026-12-20', time: '08:00', placeKind: 'office', officeId: 'off-1' }, { side: 'buyer' })).includes('9:00 AM'), 'a time before 9:00 AM is refused');
ok(boom(() => cleanScheduleAnswers({ date: '2026-12-20', time: '18:30', placeKind: 'office', officeId: 'off-1' }, { side: 'buyer' })).includes('6:00 PM'), 'a time after 6:00 PM is refused');
const day = cleanScheduleAnswers({ date: '2026-12-20', time: '18:00', placeKind: 'office', officeId: 'off-1', notes: 'Buyer is traveling' }, { side: 'buyer' });
ok(day.time === '18:00' && day.notes === 'Buyer is traveling', '6:00 PM and a note are saved');
ok(boom(() => cleanScheduleAnswers({ date: '2026-12-20', time: '10:00', placeKind: 'ron' }, { side: 'buyer' })).includes('seller side'), 'remote online notarization is refused on the buyer side');
const ron = cleanScheduleAnswers({ date: '2026-12-21', time: '11:00', placeKind: 'ron' }, { side: 'seller' });
ok(ron.preferRon && ron.placeKind === 'ron' && !ron.officeId, 'the seller can choose remote online notarization');
const asked = cleanScheduleAnswers({ askParty: 'yes' }, { side: 'buyer' });
ok(asked.askParty && asked.date === '', 'asking the buyer does not require a date');
ok(!Object.keys(schedulePatch(day, { by: 'agent', officeName: 'Rockville' })).some((k) => k === 'closingDate'), 'a side save does not carry the file closing date');
ok(scheduleTaskTitle({ street: '10 Oak Lane', city: 'Rockville', state: 'MD', zip: '20850' }) === 'Schedule the Settlement for 10 Oak Lane, Rockville, MD 20850', 'the task names the property');
ok(settlementAgentChoices([{ id: 'p1', role: 'Processor', firstName: 'Pat', lastName: 'Proc', status: 'active' }]).length === 0, 'today\'s staff roles are not a settlement-agent list, so the box stays free text');
const closers = settlementAgentChoices([{ id: 'c1', role: 'Closer', firstName: 'Casey', lastName: 'Close', status: 'active' }]);
ok(closers.length === 1 && closers[0].name === 'Casey Close', 'a closer role becomes the settlement agent list');
ok(resolveSettlementAgent('Pat Notary', []).settlementAgentProfileId == null && resolveSettlementAgent('Pat Notary', []).settlementAgentName === 'Pat Notary', 'with no list, a typed name is kept');
ok(boom(() => resolveSettlementAgent('Someone Else', closers)).includes('from the list'), 'when a list exists, a name that is not on it is refused');

const lines = scheduleNavLines({ schedBuyerDate: '2026-12-20', schedBuyerTime: '10:00', schedBuyerPlace: 'office', schedBuyerOfficeName: 'Rockville', schedBuyerAsk: false });
ok(lines[0] === 'Buyer: 2026-12-20, 10:00 AM, CLA office: Rockville', 'the button shows the buyer date, time and office');
ok(scheduleNavLines({ schedBuyerAsk: true, schedBuyerPlace: 'office' })[0] === 'Buyer: asked to schedule', 'asking the buyer shows on the button until they answer');

const free = toText(schedulingPanelHtml({ deal: { settlementAgentName: '' }, staff: true, choices: [], links: [] }));
ok(free.includes('data-scheduling-details') && free.includes('Settlement agent/notary') && free.includes('Confirmed') && free.includes('data-processor-notes') && free.includes('data-settlement-agent') && free.includes('placeholder="Type the settlement agent/notary name"') && !free.includes('Save settlement agent'), 'the processor card names the settlement agent/notary, confirms it, and no longer has a Save button');
const listed = toText(schedulingPanelHtml({ deal: {}, staff: true, choices: closers, links: [{ side: 'buyer', path: '#/schedule-party/abc' }] }));
ok(listed.includes('<select') && listed.includes('Casey Close') && listed.includes('#/schedule-party/abc'), 'when a closer role exists, the processor picks from that list and can copy the queued link');
ok(!toText(schedulingPanelHtml({ deal: {}, staff: false, choices: [], links: [] })).includes('data-processor-notes'), 'a buyer or agent does not get the processor notes button');

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const mig = readFileSync(new URL('../supabase/migrations/20261124150000_scheduling_details.sql', import.meta.url), 'utf8');
const back = readFileSync(new URL('../supabase/rollbacks/20261124150000_scheduling_details.sql', import.meta.url), 'utf8');
ok(app.includes("link('closing', 'Scheduling Details', 'task')") && app.includes('data-nav-schedule') && app.includes('function closingNavMeta'), 'the file button is Scheduling Details and still shows the closing date');
ok(app.includes("'schedule-party'") && app.includes('testportal') === false, 'the party link is a public page');
ok(mig.includes('testportal@clatitle.com') && mig.includes('sched_buyer_date') && !mig.includes('drop column closer_name') && !mig.includes('closing_date ='), 'the database file queues from the test portal mailbox and does not remove the closer or write the file closing date');
const postClosingOutbox = '(post_closing_type IS NOT NULL) AND (char_length(to_email) > 3)';
ok(mig.includes(postClosingOutbox) && mig.includes("kind = 'scheduling'"), 'the outbox check keeps the post-closing rule and adds scheduling');
const backCheck = back.slice(back.indexOf('outbox_recipient_check check'));
ok(back.includes(postClosingOutbox) && !backCheck.includes("kind = 'scheduling'"), 'the rollback puts the post-closing outbox rule back');
ok(back.includes('drop column if exists sched_buyer_date') && back.includes('agent_home_warranty') && !back.includes('drop column closer_name') && !back.includes('drop column if exists closer_name'), 'the rollback removes the scheduling columns and keeps the closer');
ok(INVITE_FROM === 'testportal@clatitle.com', 'scheduling mail is from the test portal mailbox');

const { createMockAdapter } = await import('../js/data/mock-adapter.js');
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-bagent');
const mine = (await api.listTasks('deal-1')).find((t) => t.templateCode === 'agent_schedule_settlement' && t.mine);
ok(mine && mine.title === 'Schedule the Settlement for 145 Main Street, Rockville, MD 20850', 'the buyer agent on 145 Main Street gets the address task');
let blank = '';
try { await api.submitAgentTask(mine.id, { askParty: 'no', date: '', time: '10:00', placeKind: 'office', officeId: 'off-rockville' }); } catch (e) { blank = e.message; }
ok(blank.includes('no closing date'), 'submitting 145 Main Street without a date tells the agent to type one');
await api.submitAgentTask(mine.id, { askParty: 'no', date: '2026-12-20', time: '10:00', placeKind: 'office', officeId: 'off-rockville', notes: 'Buyer is traveling' });
let file = await api.getDeal('deal-1');
ok(file.closingDate == null && file.schedBuyerDate === '2026-12-20' && file.schedBuyerTime === '10:00', 'the buyer date is saved and the empty file closing date stays empty');
await api.submitAgentTask(mine.id, { askParty: 'yes' });
await api.signInDev('u-proc');
const box = (await api.listOutbox()).filter((o) => o.toEmail === 'ben.buyer@example.test' && o.body.includes('#/schedule-party/'));
ok(box.length === 1 && box[0].fromEmail === 'testportal@clatitle.com' && box[0].sentAt == null && box[0].status === 'queued', 'the buyer link is queued from testportal@clatitle.com and is not sent');
const token = box[0].body.match(/#\/schedule-party\/([A-Za-z0-9]+)/)[1];
const opened = await api.getPartySchedule(token);
ok(opened.side === 'buyer' && opened.street === '145 Main Street' && !opened.closingDate, 'the buyer opens the link without a contract date');
await api.submitPartySchedule(token, { date: '2026-12-21', time: '14:00', placeKind: 'office', officeId: 'off-rockville', notes: 'Afternoon' });
file = await api.getDeal('deal-1');
ok(file.closingDate == null && file.schedBuyerDate === '2026-12-21' && file.schedBuyerAsk === false, 'the buyer answer shows on the file and still does not set the file closing date');

await api.signInDev('u-lagent');
const sellerTask = (await api.listTasks('deal-2')).find((t) => t.templateCode === 'agent_schedule_settlement' && t.mine);
ok(sellerTask && sellerTask.title.includes('22 Elm Court'), 'the listing agent gets the seller task for that property');
let buyerRon = '';
try { await api.submitAgentTask(sellerTask.id, { askParty: 'no', date: '2026-12-09', time: '10:00', placeKind: 'ron' }); } catch (e) { buyerRon = e.message; }
ok(buyerRon === '', 'the listing agent can choose remote online notarization');
const elm = await api.getDeal('deal-2');
ok(elm.closingDate === '2026-12-02' && elm.schedSellerDate === '2026-12-09' && elm.schedSellerPlace === 'ron', 'the seller date is not locked to the file closing date');

await api.signInDev('u-proc');
const beforeCloser = (await api.getDeal('deal-2')).closerName;
await api.saveSettlementAgent('deal-2', { name: 'Pat Notary', confirmed: true });
await api.saveSchedulingNotes('deal-2', 'Bring the extra notary stamp.');
const saved = await api.getDeal('deal-2');
ok(saved.settlementAgentName === 'Pat Notary' && saved.settlementAgentConfirmed === true && saved.schedulingProcessorNotes === 'Bring the extra notary stamp.' && saved.closerName === beforeCloser && saved.closingDate === '2026-12-02', 'the processor confirms a typed settlement agent and separate notes without changing the closer or the file closing date');
let confirmed = '';
try { await api.saveSettlementAgent('deal-2', { name: '   ', confirmed: true }); } catch (e) { confirmed = e.message; }
ok(confirmed.includes('before confirming'), 'confirming with a blank name tells the processor to enter one');
let notes = '';
try { await api.saveSchedulingNotes('deal-2', 'x'.repeat(2001)); } catch (e) { notes = e.message; }
ok(notes.includes('2,000') && (await api.getDeal('deal-2')).schedulingProcessorNotes === 'Bring the extra notary stamp.', 'notes that are too long stay as they were');

console.log(fail ? fail + ' failed' : 'scheduling details passed');
process.exit(fail ? 1 : 0);
