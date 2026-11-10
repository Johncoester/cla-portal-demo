/* Client Activity is documents, messages, and the person's own tasks. No network and no activity_log. */
import { readFileSync } from 'node:fs';
import { clientActivityFrom } from '../js/data/client-activity.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const buyer = { id: 'u-buyer', firstName: 'Ben', lastName: 'Buyer', role: 'Client-Buyer' };
const names = new Map([['u-proc', 'Paula Processor'], ['u-bagent', 'Bianca Agent']]);
const feed = clientActivityFrom({
  user: buyer,
  documents: [
    { id: 'd1', name: 'id.pdf', uploadedBy: 'u-buyer', createdAt: '2026-11-09T12:00:00Z' },
    { id: 'd2', name: 'commitment.pdf', uploadedBy: 'u-proc', createdAt: '2026-11-09T13:00:00Z', uploadedByRole: 'Processor' },
  ],
  threads: [{
    id: 't1', subject: 'Earnest money',
    messages: [
      { id: 'm1', authorId: 'u-buyer', body: 'Sent the receipt', createdAt: '2026-11-09T14:00:00Z' },
      { id: 'm2', authorId: 'u-proc', body: 'Received', createdAt: '2026-11-09T15:00:00Z' },
    ],
  }],
  tasks: [
    { id: 'mine', title: 'Photo ID', mine: true, status: 'done', completedAt: '2026-11-09T16:00:00Z', assignedRole: 'Client-Buyer' },
    { id: 'saved', title: 'Personal information', mine: true, status: 'in_progress', savedAt: '2026-11-09T11:00:00Z', assignedRole: 'Client-Buyer' },
    { id: 'open', title: 'Still open', mine: true, status: 'todo' },
    { id: 'theirs', title: 'Agent commission', mine: false, status: 'done', completedAt: '2026-11-09T17:00:00Z' },
  ],
  names,
});

ok(feed.map((row) => row.id).join() === 'task:mine:done,msg:m2,msg:m1,doc:d2,doc:d1,task:saved:saved', 'newest first, and another person\'s task stays out');
ok(feed.find((row) => row.id === 'doc:d1').mine && feed.find((row) => row.id === 'doc:d1').detail === 'Uploaded id.pdf' && feed.find((row) => row.id === 'doc:d1').actorName === 'Ben Buyer', 'your upload is yours');
ok(!feed.find((row) => row.id === 'doc:d2').mine && feed.find((row) => row.id === 'doc:d2').detail === 'Shared commitment.pdf' && feed.find((row) => row.id === 'doc:d2').actorName === 'Paula Processor', 'a file someone else shared keeps their name');
ok(feed.find((row) => row.id === 'msg:m2').detail === 'Earnest money: Received' && feed.find((row) => row.id === 'msg:m1').mine, 'a thread the caller can open becomes replies');
ok(feed.find((row) => row.id === 'task:mine:done').action === 'task.completed' && feed.find((row) => row.id === 'task:saved:saved').action === 'task.saved', 'a finished task and a saved task are both listed');
ok(clientActivityFrom().length === 0 && clientActivityFrom({ documents: [null, {}], threads: [{ messages: [null] }], tasks: [{ id: 'x' }] }).length === 0, 'nothing available is an empty list');

const page = readFileSync(new URL('../js/pages/dealactivity.js', import.meta.url), 'utf8');
ok(page.includes('Nothing yet') && page.includes('catch') && !page.includes('is not a function'), 'the tab renders an empty state instead of throwing');
const adapter = readFileSync(new URL('../js/data/supabase-adapter.js', import.meta.url), 'utf8');
ok(adapter.includes('async listMyActivity(dealId)') && adapter.includes('return clientActivityFrom('), 'hosted client activity is built in the adapter');
ok(adapter.includes("from('activity_log')"), 'staff activity still reads the log');
ok(adapter.includes('a.listDocuments(dealId)') && adapter.includes('a.listThreads(dealId)') && adapter.includes('a.listTasks(dealId)'), 'the hosted feed uses documents, threads, and tasks the caller can already read');

console.log(fail ? fail + ' failed' : 'client activity passed');
if (fail) process.exit(1);
