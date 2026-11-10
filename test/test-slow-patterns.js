/* Fails when a new migration or the hosted adapter reintroduces a known-slow read. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

const CHAIN = ['me_role(', 'is_staffish(', 'is_admin(', 'effective_uid(', 'can_access_deal(', 'viewer_is_demo('];

export function slowPolicy(sql) {
  const text = String(sql || '');
  const policies = text.match(/(create|alter)\s+policy[\s\S]*?;/gi) || [];
  const hits = [];
  for (const policy of policies) {
    const using = policy.match(/using\s*\(([\s\S]*)\)\s*(?:with\s+check|;)/i);
    const body = using ? using[1] : policy;
    const found = CHAIN.filter((name) => body.includes(name));
    if (found.length >= 2) hits.push(found.join('+'));
  }
  return hits;
}

export function repeatedRpc(source) {
  const text = String(source || '');
  const roles = text.split("rpc('my_file_roles_full')").length - 1;
  const parties = text.split("rpc('agent_parties')").length - 1;
  const cached = text.includes('function sessionCache') && text.includes("sessionCache('roles'") && text.includes("sessionCache('parties'");
  return { roles, parties, cached };
}

const sample = `
create policy tasks_select on public.tasks for select using (
  private.me_role() is not null and private.can_access_deal(deal_id) and private.is_staffish()
);
`;
ok(slowPolicy(sample).length === 1, 'a per-row helper chain in a policy is rejected');
ok(slowPolicy("create policy ok on public.tasks for select using (private.task_readable(id));").length === 0, 'a one-pass policy is allowed');
ok(repeatedRpc("const fileRoles = () => sessionCache('roles', async () => sb.rpc('my_file_roles_full'));\nfunction sessionCache(){}\nconst parties = () => sessionCache('parties', async () => sb.rpc('agent_parties'));").cached, 'the sample cache helper is recognized');

const kept = repeatedRpc("function sessionCache(){}\nsessionCache('roles', () => sb.rpc('my_file_roles_full'));\nsessionCache('parties', () => sb.rpc('agent_parties'));");
ok(kept.roles === 1 && kept.parties === 1 && kept.cached, 'one cached call of each repeated RPC is allowed');
const bare = repeatedRpc("sb.rpc('my_file_roles_full'); sb.rpc('my_file_roles_full');");
ok(bare.roles === 2 && !bare.cached, 'two uncached role reads are rejected');

const floor = '20261111160000';
const migDir = join(root, 'supabase/migrations');
const fresh = [];
for (const name of readdirSync(migDir)) {
  if (!name.endsWith('.sql')) continue;
  const stamp = name.slice(0, 14);
  if (stamp >= floor) fresh.push(...slowPolicy(readFileSync(join(migDir, name), 'utf8')).map((hit) => name + ' ' + hit));
}
ok(fresh.length === 0, 'migrations from ' + floor + ' do not add a multi-helper policy' + (fresh.length ? ': ' + fresh.join('; ') : ''));

const adapter = readFileSync(join(root, 'js/data/supabase-adapter.js'), 'utf8');
const live = repeatedRpc(adapter);
ok(live.roles === 1 && live.parties === 1 && live.cached, 'my_file_roles_full and agent_parties are each read once and kept for the session');

if (fail) {
  console.log(fail + ' failed');
  process.exit(1);
}
console.log('slow-pattern checks passed');
