/* RPT-3b (John, Nov 22 2026): a schedule on a saved CRM report.
 * John's rules: "Scheduling stays with admins." It can send to anybody (any email address). The full list of recipients always shows.
 * This stores the schedule and shows it. It sends nothing (the sending job is RPT-3c). */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { cleanSchedule, scheduleText, parseRecipients, badRecipients, cleanTime, timeLabel, canSchedule, outsideRecipients, SCHEDULE_MAX_RECIPIENTS } from '../js/data/crm-report-schedule.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const refused = async (fn) => { try { await fn(); return ''; } catch (e) { return e.message || 'refused'; } };
const bad = (input) => { try { cleanSchedule(input); return ''; } catch (e) { return e.message; } };

// ---- the rule book ----
ok(parseRecipients(' John@CLAtitle.com, john@clatitle.com;\nagent@Outside.com ').join() === 'john@clatitle.com,agent@outside.com' && badRecipients('a@b.co, nope, x@y').join() === 'nope,x@y', 'addresses are lower-cased, counted once, and anything that is not an email address is named');
ok(cleanTime('7') === '07:00' && cleanTime('16:30') === '16:30' && cleanTime('25:00') === '' && cleanTime('') === '' && timeLabel('07:00') === '7:00 AM' && timeLabel('16:30:00') === '4:30 PM' && timeLabel('00:05') === '12:05 AM', 'a time of day is read and shown in plain words');
const wk = cleanSchedule({ frequency: 'weekly', weekday: '5', time: '16:30', recipients: 'a@b.co', monthDay: 9 });
ok(wk.weekday === 5 && wk.monthDay === null && wk.active === true && scheduleText(wk) === 'Every Friday at 4:30 PM ET', 'a weekly schedule keeps its day and drops the day of the month');
ok(scheduleText(cleanSchedule({ frequency: 'weekdays', time: '7:00', recipients: ['a@b.co'] })) === 'Every weekday at 7:00 AM ET' && scheduleText(cleanSchedule({ frequency: 'daily', time: '12:00', recipients: ['a@b.co'] })) === 'Every day at 12:00 PM ET'
  && scheduleText(cleanSchedule({ frequency: 'monthly', monthDay: 15, time: '9:00', recipients: ['a@b.co'] })) === 'On day 15 of every month at 9:00 AM ET', 'each kind of schedule reads in plain words, in Eastern Time');
ok(/how often/.test(bad({ time: '7:00', recipients: 'a@b.co' })) && /time of day/.test(bad({ frequency: 'daily', time: 'noon', recipients: 'a@b.co' })) && /day of the week/.test(bad({ frequency: 'weekly', time: '7:00', recipients: 'a@b.co' }))
  && /1 to 28/.test(bad({ frequency: 'monthly', monthDay: 31, time: '7:00', recipients: 'a@b.co' })) && /at least one/.test(bad({ frequency: 'daily', time: '7:00', recipients: ' , ' })) && /not an email address: nope/.test(bad({ frequency: 'daily', time: '7:00', recipients: 'a@b.co, nope' })),
  'a schedule with something missing or wrong is refused in plain words');
ok(new RegExp(`at most ${SCHEDULE_MAX_RECIPIENTS}`).test(bad({ frequency: 'daily', time: '7:00', recipients: Array.from({ length: SCHEDULE_MAX_RECIPIENTS + 1 }, (_, i) => `p${i}@b.co`) })), 'a schedule sends to a limited number of addresses');
ok(canSchedule({ isAdmin: true }) && !canSchedule({ role: 'Processor' }) && !canSchedule({ role: 'Sales Person' }) && !canSchedule(null), 'only an Admin or Super admin may schedule');
ok(outsideRecipients(['john@clatitle.com', 'agent@outside.com', 'x@notclatitle.com']).join() === 'agent@outside.com,x@notclatitle.com', 'addresses outside CLA are picked out');

// ---- through the demo portal ----
const api = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { accounting: true, crm: true } });
const users = await api.listDevUsers(); const admin = users.find((u) => u.role === 'Super admin'); const proc = users.find((u) => u.role === 'Processor'); const sp = users.find((u) => u.role === 'Sales Person');
await api.signInDev(admin.id);
const rep = (await api.listCrmReports()).find((r) => !r.personal); const none = await api.getCrmReportSchedule(rep.id);
ok(none.available === true && none.canEdit === true && none.schedule === null && (await api.listCrmReportSchedules()).length === 0, 'a report starts with no schedule; an Admin may set one up');
const saved = await api.saveCrmReportSchedule(rep.id, { frequency: 'weekdays', time: '07:00', recipients: 'John@clatitle.com\nagent@outside.com, john@clatitle.com' });
ok(saved.schedule.text === 'Every weekday at 7:00 AM ET' && saved.schedule.recipients.join() === 'john@clatitle.com,agent@outside.com' && saved.schedule.active === true && saved.schedule.lastSentAt === null, 'an Admin schedules a report to any email address, inside or outside CLA');
ok(/not an email address/.test(await refused(() => api.saveCrmReportSchedule(rep.id, { frequency: 'daily', time: '07:00', recipients: 'nope' }))) && (await api.getCrmReportSchedule(rep.id)).schedule.frequency === 'weekdays', 'a bad address is refused and the saved schedule stays');
const changed = await api.saveCrmReportSchedule(rep.id, { frequency: 'weekly', weekday: 1, time: '16:30', recipients: ['john@clatitle.com'], active: false });
ok(changed.schedule.id === saved.schedule.id && changed.schedule.text === 'Every Monday at 4:30 PM ET' && changed.schedule.active === false && (await api.listCrmReportSchedules()).length === 1, 'changing a schedule keeps one schedule per report; it can be switched off');
await api.saveCrmReportSchedule(rep.id, { frequency: 'weekdays', time: '07:00', recipients: ['john@clatitle.com', 'agent@outside.com'] });

for (const [who, u] of [['Processor', proc], ['Sales Person', sp]]) {
  await api.signInDev(u.id); const seen = await api.getCrmReportSchedule(rep.id);
  ok(seen.canEdit === false && seen.schedule.recipients.join() === 'john@clatitle.com,agent@outside.com' && seen.schedule.text === 'Every weekday at 7:00 AM ET', `a ${who} who can open the report sees the schedule and the full list of who gets it`);
  ok(/Admin/.test(await refused(() => api.saveCrmReportSchedule(rep.id, { frequency: 'daily', time: '07:00', recipients: 'thief@evil.com' }))) && (await api.getCrmReportSchedule(rep.id)).schedule.recipients.length === 2, `a ${who} cannot set up or change a schedule`);
}
await api.signInDev(proc.id);
const own = await api.createCrmReport({ name: 'Processor own', module: 'deals', columns: ['fileNumber'] });
ok(/Admin/.test(await refused(() => api.saveCrmReportSchedule(own.id, { frequency: 'daily', time: '07:00', recipients: 'me@clatitle.com' }))), 'a Processor cannot schedule even their own report');
await api.signInDev(admin.id);
const old = await api.createCrmReport({ name: 'To retire', module: 'deals', columns: ['fileNumber'], folderId: rep.folderId }); await api.retireCrmReport(old.id, true);
ok(/retired/.test(await refused(() => api.saveCrmReportSchedule(old.id, { frequency: 'daily', time: '07:00', recipients: 'a@b.co' }))), 'a retired report cannot be scheduled');

// ---- the page, the hosted site and the database file ----
const page = read('../js/pages/crm-reports.js'); const host = read('../js/data/supabase-crm-surface.js');
ok(page.includes('data-schedule-recipients>${s.recipients.join(\', \')}') && page.includes('data-schedule-count') && page.includes('<div data-report-schedule>${scheduleHtml(sch)}</div>'), 'the report page shows every recipient, not a count alone');
ok(page.includes("const canSched = !!(sch.available && sch.canEdit && !rep.retired);") && page.includes("${canSched ? html`<option value=\"schedule\">"), 'only someone who may schedule gets the Schedule choice');
ok(page.includes('data-schedule-warning') && page.includes('outside CLA') && page.includes('data-schedule-not-sending'), 'the form warns that people outside CLA get the rows, and the panel says emails are not sending yet');
ok(host.includes("from('crm_report_schedules')") && host.includes("if (res.error) return { available: false, canEdit: false, schedule: null };") && host.includes("if (!canSchedule(u)) throw new Error('Only an Admin or Super admin can schedule a report.')"),
  'the hosted site reads and saves the schedule, refuses a non-Admin, and stays quiet before the database file is applied');
const sql = read('../supabase/migrations/20261130023000_crm_report_schedules.sql'); const code = sql.replace(/--.*$/gm, '');
ok(code.includes('enable row level security') && code.includes('revoke all on public.crm_report_schedules from public, anon, authenticated') && /grant select, insert, update on public\.crm_report_schedules to authenticated/.test(code) && !/grant[^;]*\bdelete\b/i.test(code) && !/to anon/i.test(code),
  'the schedule table is locked down: no signed-out access and no delete');
ok((code.match(/private\.is_admin\(\)/g) || []).length >= 3 && code.includes('for select to authenticated\n  using (private.crm_report_visible(report_id))') && code.includes('report_id uuid not null unique'), 'only an Admin writes a schedule; whoever can see the report can see it; one schedule per report');
ok(!/cron\.schedule|net\.http|insert into public\.outbox/i.test(code) && code.includes('readback'), 'the database file adds no job and sends nothing, and it reads itself back');
ok(/drop table if exists public\.crm_report_schedules/.test(read('../supabase/rollbacks/20261130023000_crm_report_schedules.sql')), 'the rollback removes only the schedule table and its guard');

console.log(fail ? `${fail} failed` : 'report schedules passed'); process.exit(fail ? 1 : 0);
