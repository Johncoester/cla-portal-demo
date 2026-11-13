/* FF-072 #24 / FF-054(b) / MF-049(2) (Janine's video, Nov 12; Francis confirm-back Nov 12 6:14 PM ET): the processor's recipient lists show
   the parties on the current file, not contacts from other files. */
import { readFileSync } from 'node:fs';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mig = readFileSync(new URL('../supabase/migrations/20261117030000_recipients_this_file.sql', import.meta.url), 'utf8');
const back = readFileSync(new URL('../supabase/rollbacks/20261117030000_recipients_this_file.sql', import.meta.url), 'utf8');
const mailed = mig.slice(mig.indexOf('mailed as ('), mig.indexOf('select * from portal'));
ok(/where v\.staff and v\.ok and dp\.deal_id = p_deal/.test(mailed), 'contacts with no portal login come from this file only');
ok(mig.includes("<> '419cfebe34e89f1fbdd777ab4990873f'") && mig.includes('readback: rpc_message_recipients did not take the file filter'), 'refuses to run on an unexpected version and reads the change back');
ok(!/create policy|alter policy|grant |revoke /i.test(mig), 'no policy or grant changes (create or replace keeps who may call it)');
ok(back.includes('create or replace function private.rpc_message_recipients') && !back.includes('dp.deal_id = p_deal   --'), 'the rollback puts back the previous version');
ok(mig.replace(/\s+/g, ' ').includes(back.slice(back.indexOf('create or replace function')).replace(/\s+/g, ' ').slice(0, 400)), 'the function head is unchanged from the live version');
const email = readFileSync(new URL('../js/pages/dealemail.js', import.meta.url), 'utf8');
ok((email.match(/autocomplete="off" data-mail-(to|cc|bcc)/g) || []).length === 3, 'the email To / Cc / Bcc boxes do not offer addresses the browser remembers from other files');
console.log(fail ? `FAIL ${fail}` : 'all this-file recipient checks passed');
process.exit(fail ? 1 : 0);
