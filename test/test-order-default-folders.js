/* FF-104b (Francis Santos, Nov 19 2026, 1:15 PM ET, confirmed 2:35 PM ET).
   New orders get eight folders. Orders already stored keep theirs.
   Title does not add a second copy of a name the order already has. No network. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { DEAL_FOLDERS, ORDER_DEFAULT_FOLDERS } from '../js/data/seed.js';
import { TITLE_FOLDERS } from '../js/data/title.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const names = (rows) => rows.filter((f) => !f.virtual).map((f) => f.name);

ok(ORDER_DEFAULT_FOLDERS.length === 8, 'there are eight default folders');
ok(ORDER_DEFAULT_FOLDERS[4] === '450 Final Closing Documents', '450 is Final Closing Documents');
ok(ORDER_DEFAULT_FOLDERS[6] === '600 Funds, Agent Commission Wire Instructions', '600 is one folder with the full name');
ok(!ORDER_DEFAULT_FOLDERS.includes('450 Prior Closing Documents'), 'the order default is not the Title prior-closing folder');
ok(DEAL_FOLDERS.join('|') === 'Contract & addenda|IDs & personal|Lender & payoff|HOA|Closing', 'the five names used by sample orders stay in the seed list');
const shared = ORDER_DEFAULT_FOLDERS.filter((n) => TITLE_FOLDERS.includes(n));
ok(shared.length === 6 && shared.includes('100 Processing') && shared.includes('700 Recorded Documents and Policies'), 'six names are shared with the Title module');
ok(TITLE_FOLDERS.includes('450 Prior Closing Documents') && TITLE_FOLDERS.includes('200 Title › SEARCH'), 'Title still has its own extra folder names');

const sql = readFileSync(new URL('../supabase/migrations/20261125350000_order_default_folders.sql', import.meta.url), 'utf8');
const back = readFileSync(new URL('../supabase/rollbacks/20261125350000_order_default_folders.sql', import.meta.url), 'utf8');
ok(ORDER_DEFAULT_FOLDERS.every((n) => sql.includes("'" + n + "'")), 'the database file names all eight folders');
ok(!sql.includes('Contract & addenda') && !/delete\s+from\s+public\.folders/i.test(sql) && !/update\s+public\.folders/i.test(sql), 'the database file does not rename, update or delete folders');
ok(/create or replace function private\.trg_deal/i.test(sql) && /not exists/i.test(sql) && /tg_op = 'INSERT'/i.test(sql), 'only a new order insert adds folders, and a name already there is skipped');
ok(back.includes('Contract & addenda') && !/delete\s+from\s+public\.folders/i.test(back), 'the rollback restores the five names and does not delete folders');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { title: true } });
await api.signInDev('u-proc');
const before = await api.listDealFolders('deal-1');
const beforeNames = names(before);
const beforeKey = before.filter((f) => !f.virtual).map((f) => f.id + '\t' + f.name).sort().join('\n');
ok(DEAL_FOLDERS.every((n) => beforeNames.includes(n)) && !ORDER_DEFAULT_FOLDERS.some((n) => beforeNames.includes(n)), 'an order that already exists still has the five folders');

const made = await api.createDeal({ street: '104 Folder Lane', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-19', transactionType: 'Purchase', processorId: 'u-proc' });
const fresh = names(await api.listDealFolders(made.id));
ok(fresh.length === 8 && ORDER_DEFAULT_FOLDERS.every((n) => fresh.includes(n)), 'a new order gets the eight folders');
ok(!DEAL_FOLDERS.some((n) => fresh.includes(n)), 'a new order does not also get the five older names');
const after = await api.listDealFolders('deal-1');
ok(after.filter((f) => !f.virtual).map((f) => f.id + '\t' + f.name).sort().join('\n') === beforeKey, 'opening a new order does not change folders already on another order');

await api.ensureTitleFolders(made.id);
const withTitle = names(await api.listDealFolders(made.id));
ok(shared.every((n) => withTitle.filter((x) => x === n).length === 1), 'Title does not add a second copy of a shared folder name');
ok(withTitle.includes('450 Prior Closing Documents') && withTitle.includes('450 Final Closing Documents'), 'Final Closing Documents and Prior Closing Documents are both kept');
ok(withTitle.includes('200 Title › SEARCH') && withTitle.includes('200 Title › BK Search'), 'Title still adds the folders that are not in the eight');

console.log(fail ? fail + ' failed' : 'order default folders passed');
if (fail) process.exit(1);
