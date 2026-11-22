/* The CRM visibility rollback puts each function back by find-and-replace.
   Every find text has to occur once in the definition the forward file installs,
   or the rollback stops and leaves the function half changed. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const sqlString = (src, at) => {
  if (src[at] !== "'") throw new Error('expected a quote');
  let i = at + 1;
  let out = '';
  while (i < src.length) {
    if (src[i] === "'") {
      if (src[i + 1] === "'") { out += "'"; i += 2; continue; }
      return { text: out, next: i + 1 };
    }
    out += src[i];
    i += 1;
  }
  throw new Error('unclosed string');
};

const sqlArray = (src, at) => {
  const open = src.indexOf('[', at);
  const items = [];
  let i = open + 1;
  while (i < src.length) {
    while (' \n\t,'.includes(src[i])) i += 1;
    if (src[i] === ']') return { items, next: i + 1 };
    const one = sqlString(src, i);
    items.push(one.text);
    i = one.next;
  }
  throw new Error('unclosed array');
};

const swapRows = (src) => {
  const start = src.indexOf('select * from (values');
  const end = src.indexOf(') as v(sig, expect, olds, news)');
  const block = src.slice(start, end);
  const rows = [];
  const marks = block.matchAll(/\('([^']+)'::text/g);
  for (const mark of marks) {
    let i = mark.index + mark[0].length;
    while (block[i] !== "'") i += 1;
    const expect = sqlString(block, i);
    i = block.indexOf('array', expect.next);
    const olds = sqlArray(block, i);
    i = block.indexOf('array', olds.next);
    const news = sqlArray(block, i);
    rows.push({ sig: mark[1], expect: expect.text, olds: olds.items, news: news.items });
  }
  return rows;
};

const argTypes = (args) => {
  const parts = [];
  let cur = '';
  let depth = 0;
  let quote = false;
  for (let i = 0; i < args.length; i += 1) {
    const ch = args[i];
    if (quote) {
      cur += ch;
      if (ch === "'" && args[i + 1] === "'") { cur += args[i + 1]; i += 1; continue; }
      if (ch === "'") quote = false;
      continue;
    }
    if (ch === "'") { quote = true; cur += ch; continue; }
    if (ch === '(') { depth += 1; cur += ch; continue; }
    if (ch === ')') { depth -= 1; cur += ch; continue; }
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts.filter(Boolean).map((part) => {
    const bare = part.split(/\s+DEFAULT\s+/i)[0].trim();
    const toks = bare.split(/\s+/);
    return toks[toks.length - 1];
  }).join(', ');
};

const beforeDefs = () => {
  const schema = read('supabase/baseline/test_schema.sql');
  const map = new Map();
  const header = /^CREATE OR REPLACE FUNCTION\s+(\S+)\s*\(([^)]*)\)/gm;
  for (const mark of schema.matchAll(header)) {
    const asAt = schema.indexOf('AS $function$', mark.index);
    const close = schema.indexOf('$function$', asAt + 4);
    const body = schema.slice(mark.index, close + '$function$'.length);
    map.set(`${mark[1]}(${argTypes(mark[2])})`, body);
  }
  return map;
};

const count = (hay, needle) => {
  if (!needle) return 0;
  let n = 0;
  let from = 0;
  while (from <= hay.length) {
    const at = hay.indexOf(needle, from);
    if (at < 0) break;
    n += 1;
    from = at + needle.length;
  }
  return n;
};

const forward = swapRows(read('supabase/migrations/20261125330000_crm_visibility_edit_own.sql'));
const rollback = swapRows(read('supabase/rollbacks/20261125330000_crm_visibility_edit_own.sql'));
const defs = beforeDefs();

ok(forward.length === 13 && rollback.length === 13, 'both files name the same thirteen functions');

const bySig = new Map(rollback.map((row) => [row.sig, row]));
for (const row of forward) {
  const before = defs.get(row.sig);
  ok(!!before, `the saved definition is present for ${row.sig}`);
  if (!before) continue;
  let installed = before;
  let forwardOk = true;
  row.olds.forEach((needle, i) => {
    const n = count(installed, needle);
    if (n !== 1) forwardOk = false;
    ok(n === 1, `forward find text occurs once in ${row.sig}: ${needle.slice(0, 80)}`);
    if (n === 1) installed = installed.replace(needle, row.news[i]);
  });
  const back = bySig.get(row.sig);
  ok(!!back, `the rollback names ${row.sig}`);
  if (!back || !forwardOk) continue;
  let restored = installed;
  back.olds.forEach((needle, i) => {
    const n = count(restored, needle);
    ok(n === 1, `rollback find text occurs once in ${row.sig}: ${needle.slice(0, 80)}`);
    if (n === 1) restored = restored.replace(needle, back.news[i]);
  });
  ok(restored === before, `the rollback puts ${row.sig} back to the saved definition`);
}

const accountList = rollback.find((row) => row.sig === 'private.rpc_crm_account_list()');
ok(accountList && accountList.olds[1].includes("'contacts'") && accountList.olds[1].includes('private.crm_in_pool(c.id)'),
  'the company list anchor is the contacts count, not every pool check');
const accountDetail = rollback.find((row) => row.sig === 'private.rpc_crm_account_detail(uuid)');
ok(accountDetail && accountDetail.olds[1].includes("'contactList'") && accountDetail.olds[1].includes('private.crm_in_pool(c.id)'),
  'the company detail anchor is the contact list, not the order count');
const followUps = rollback.find((row) => row.sig.startsWith('private.rpc_crm_follow_ups'));
ok(followUps && followUps.olds[0].includes("coalesce(p_owner, private.effective_uid()))), '[]'::jsonb)"),
  'the follow-up anchor still closes the select list');

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('crm visibility rollback anchors passed');
