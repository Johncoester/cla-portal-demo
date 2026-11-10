/* Agent conversations: the hosted list has no lastBody until it is shaped. No hosted database. */
import { readFileSync } from 'node:fs';
import { presentThread, shapePortalThreads } from '../js/data/portal-threads.js';
import { agentMayInsertDocument } from '../js/data/document-insert-access.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

const raw = shapePortalThreads({
  userId: 'agent',
  threads: [{ id: 'th', dealId: 'deal', subject: 'Commission', createdAt: '2026-11-01T00:00:00Z', staffCoordinated: false }],
  messages: [{ id: 'm', threadId: 'th', authorId: 'proc', body: 'Please confirm the commission form.', createdAt: '2026-11-02T00:00:00Z' }],
  participants: [
    { threadId: 'th', profileId: 'agent', lastReadAt: '' },
    { threadId: 'th', profileId: 'proc', lastReadAt: '' },
  ],
  profiles: [
    { id: 'agent', firstName: 'Bea', lastName: 'Agent', role: 'Outside user' },
    { id: 'proc', firstName: 'Paula', lastName: 'Processor', role: 'Processor' },
  ],
});
ok(raw.length === 1 && raw[0].lastBody.startsWith('Please confirm') && raw[0].participants.map((p) => p.name).join('|') === 'Bea Agent|Paula Processor' && raw[0].unread === 1 && raw[0].count === 1, 'a hosted thread becomes a conversation row with the last message and the people on it');
const shown = presentThread(raw[0], { userId: 'agent' });
ok(shown.lastBody.slice(0, 90) === raw[0].lastBody && shown.participants.length === 2, 'the conversations page can read the shaped row');
const bare = presentThread({ id: 'th', subject: 'Hello', messages: [{ threadId: 'th', authorId: 'proc', body: 'Hello from CLA', createdAt: '2026-11-03T00:00:00Z' }] }, { userId: 'agent' });
ok(bare.lastBody === 'Hello from CLA' && Array.isArray(bare.participants) && bare.lastBody.slice(0, 5) === 'Hello', 'a raw hosted thread does not crash the conversations list');

const roles = ['Buyer Agent', 'Listing Agent', 'Transaction Coordinator', 'Client-Buyer', 'Client-Seller'];
ok(roles.filter((role) => role.endsWith('Agent')).every((role) => agentMayInsertDocument({ role, onThisFile: true, visibility: 'all' })), 'buyer and listing agents may choose everyone on the file');
ok(!agentMayInsertDocument({ role: 'Client-Buyer', onThisFile: true, visibility: 'all' }) && !agentMayInsertDocument({ role: 'Client-Seller', onThisFile: true, visibility: 'all' }) && !agentMayInsertDocument({ role: 'Transaction Coordinator', onThisFile: true, visibility: 'all' }), 'the agent insert helper does not add everyone for a client or a coordinator');

const adapter = readFileSync(new URL('../js/data/supabase-adapter.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../js/pages/dealmsgs.js', import.meta.url), 'utf8');
const list = readFileSync(new URL('../js/data/supabase-nov5.js', import.meta.url), 'utf8');
ok(adapter.includes('a.sendMessage = async') && adapter.includes("body_html: messageText(bodyHtml).clean || ''"), 'a portal reply calls sendMessage and stores message text instead of a null body');
ok(page.includes('presentThread') && page.includes("typeof api.sendMessage !== 'function'") && list.includes('shapePortalThreads'), 'the conversations page shapes the hosted list before it reads the last message');

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('agent portal messages passed');
