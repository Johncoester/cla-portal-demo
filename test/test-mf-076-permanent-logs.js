/* MF-076 (Matt Landsberg, confirmed Nov 26 2026): every action by every party is logged, including messages sent and
   documents viewed, and nobody can edit or delete entries in activity_log or wire_audit_log. Answer B: "for now, no one
   can modify logs" (no admin exception). */
import { readFileSync as read } from 'node:fs';
import { nov5Supabase } from '../js/data/supabase-nov5.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

// ---- hosted: opening a document logs it first, and a logging error stops the open ----
const DOC = '11111111-2222-4333-8444-555555555555';
const fake = (rpcResult) => {
  const steps = [];
  const sb = {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from() { const q = { select() { return q; }, eq() { return q; }, single: async () => ({ data: { id: DOC, name: 'a.pdf', storage_path: 'p/a.pdf', mime_type: 'application/pdf' }, error: null }) }; return q; },
    rpc: async (fn, args) => { steps.push(['rpc', fn, args.p_document]); return rpcResult; },
    storage: { from: () => ({ download: async () => { steps.push(['download']); return { data: new Blob(['x']), error: null }; } }) },
  };
  const camel = (o) => o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v])) : o;
  const okr = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
  return { steps, api: nov5Supabase({ sb, ok: okr, camel, me: async () => ({ id: 'u1' }) }) };
};
let f = fake({ data: null, error: null });
await f.api.getDocumentContent(DOC);
ok(f.steps[0][0] === 'rpc' && f.steps[0][1] === 'log_document_view' && f.steps[0][2] === DOC && f.steps[1][0] === 'download', 'the open is logged (log_document_view) before the file is downloaded');
f = fake({ data: null, error: { code: '42501', message: 'nope' } });
let threw = ''; try { await f.api.getDocumentContent(DOC); } catch (e) { threw = e.message; }
ok(threw === 'nope' && !f.steps.some((s) => s[0] === 'download'), 'if the open cannot be logged, the file is not downloaded');
f = fake({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
await f.api.getDocumentContent(DOC);
ok(f.steps.some((s) => s[0] === 'download'), 'a database without the function yet (PGRST202) still opens files, so the app can ship before the SQL');

// ---- demo mode already logs the same two actions ----
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
const docs = await api.listDocuments('deal-1');
if (docs && docs.length) { await api.getDocumentContent(docs[0].id); }
const got = await api.listActivity('deal-1'); const acts = Array.isArray(got) ? got : (got.rows || got.items || got.entries || got.activity || []);
ok(docs.length > 0 && acts.some((a) => a.action === 'document.viewed'), 'demo mode logs document.viewed, the same action the database writes');

// ---- the migration ----
const mig = read(new URL('../supabase/migrations/20261131310000_mf076_permanent_logs.sql', import.meta.url), 'utf8');
const undo = read(new URL('../supabase/rollbacks/20261131310000_mf076_permanent_logs.sql', import.meta.url), 'utf8');
for (const t of ['activity_log', 'wire_audit_log']) {
  ok(new RegExp(`create trigger zz_log_permanent before update or delete on public\\.${t}\\s+for each row execute function private\\.log_rows_are_permanent\\(\\)`).test(mig), `${t}: every UPDATE and DELETE raises, for every role`);
  ok(new RegExp(`create trigger zz_log_no_truncate before truncate on public\\.${t}\\s+for each statement`).test(mig), `${t}: TRUNCATE raises`);
  ok(new RegExp(`revoke update, delete, truncate on public\\.${t} from anon, authenticated, service_role`).test(mig), `${t}: no client role is granted UPDATE, DELETE or TRUNCATE`);
}
ok(/raise exception 'Log entries are permanent/.test(mig) && !/is_admin|Super admin/.test(mig.split('create or replace function private.log_rows_are_permanent')[1].split('$fn$;')[0]), 'Answer B: the guard has no admin exception');
ok(/drop policy if exists wire_update on public\.wire_audit_log;/.test(mig), 'the staff update path on the wire log is gone');
ok(/after insert on public\.messages\s+for each row execute function private\.trg_message_log\(\)/.test(mig) && /'message\.posted', 'thread'/.test(mig), 'a message send is logged as message.posted on its thread');
ok(!/new\.body/.test(mig), 'the message body is not copied into the log');
ok(/create or replace function public\.log_document_view\(p_document uuid\)[\s\S]*security definer[\s\S]*private\.document_readable\(p_document\)/.test(mig), 'document views are logged through a SECURITY DEFINER function that checks the caller can read the document');
ok(/interval '60 seconds'/.test(mig), 'the same person opening the same document within a minute is logged once (volume)');
ok(/revoke all on function public\.log_document_view\(uuid\) from public, anon;\s*grant execute on function public\.log_document_view\(uuid\) to authenticated;/.test(mig), 'only signed-in users can call log_document_view');
ok(!/create policy|alter policy/.test(mig), 'no read policy changes: parties only see the rows they already could');
ok(/create policy wire_update on public\.wire_audit_log/.test(undo) && /drop trigger if exists zz_log_permanent on public\.activity_log/.test(undo), 'the rollback restores the old state');
ok(!/delete from public\.(activity_log|wire_audit_log)/.test(undo), 'the rollback deletes no log rows');

if (fail) { console.log(`${fail} failed`); process.exit(1); }
console.log('MF-076 permanent logs: all passed');
