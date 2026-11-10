/* Wire recipients must name columns. select * from message_recipients broke when email was added. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const migration = readFileSync(new URL('../supabase/migrations/20261111090500_wire_recipients_explicit_cols.sql', import.meta.url));
const rollback = readFileSync(new URL('../supabase/rollbacks/20261111090500_wire_recipients_explicit_cols.sql', import.meta.url));
const migHash = createHash('sha256').update(migration).digest('hex');
const rollHash = createHash('sha256').update(rollback).digest('hex');
console.log('wire-cols-migration-sha256', migHash);
console.log('wire-cols-rollback-sha256', rollHash);

const mig = migration.toString();
ok(/select r\.id, r\.first_name, r\.last_name, r\.role, r\.side from public\.message_recipients/.test(mig), 'the migration lists the five wire columns');
ok(mig.includes('33b9e6a64366ceef465e48224a438415') && mig.includes('db3cee809e18a40f2cffbcbb850225d4'), 'the migration records the body already applied on TEST');
ok(!/select\s+(?:r\.)?\*\s+from\s+(?:public\.)?message_recipients\b/i.test(mig), 'the migration does not select every column of message_recipients');

function sqlFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sqlFiles(path, out);
    else if (name.endsWith('.sql')) out.push(path);
  }
  return out;
}

const directStar = /select\s+(?:r\.)?\*\s+from\s+(?:public\.)?message_recipients\b/gi;
const rpcStar = /select\s+\*\s+from\s+private\.rpc_message_recipients\b/gi;
const returnsOf = (head) => {
  const m = /returns table\(([^)]*)\)/i.exec(head);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
};
const hits = [];
for (const path of sqlFiles(join(root, 'supabase'))) {
  const text = readFileSync(path, 'utf8');
  const rel = path.slice(root.length + 1);
  if (rel.endsWith('supabase/rollbacks/20261111090500_wire_recipients_explicit_cols.sql')) continue;
  let m;
  const direct = new RegExp(directStar.source, directStar.flags);
  while ((m = direct.exec(text))) hits.push(`${rel}: ${m[0]}`);
  const rpcDefs = [...text.matchAll(/create(?: or replace)? function private\.rpc_message_recipients[\s\S]*?returns table\(([^)]*)\)/gi)].map((x) => x[1].replace(/\s+/g, ' ').trim());
  const rpc = new RegExp(rpcStar.source, rpcStar.flags);
  while ((m = rpc.exec(text))) {
    const at = text.lastIndexOf('create ', m.index);
    const wrapper = returnsOf(text.slice(Math.max(0, at), m.index));
    const rpcReturn = rpcDefs.length ? rpcDefs[rpcDefs.length - 1] : '';
    if (!wrapper || !rpcReturn || wrapper !== rpcReturn) hits.push(`${rel}: ${m[0]} (${wrapper || 'no return'} vs ${rpcReturn || 'no rpc'})`);
  }
}
ok(hits.length === 0, hits.length ? `star select over message_recipients:\n${hits.join('\n')}` : 'no other select * wrapper reads message_recipients');

console.log(fail ? fail + ' failed' : 'wire recipient columns passed');
if (fail) process.exit(1);
