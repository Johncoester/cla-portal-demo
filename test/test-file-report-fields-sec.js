/* RPT-1-SEC (John, Nov 23 2026): static checks on the security file that stops
 * demo Processors seeing real files on the CRM Deals report. The behaviour is
 * proved in test-file-report-fields-sec-sql.sh. */
import { readFileSync } from 'node:fs';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const sql = readFileSync(new URL('../supabase/migrations/20261129060000_crm_deal_report_fields_sec.sql', import.meta.url), 'utf8');
const start = sql.indexOf('create function public.crm_deal_report_fields()');
const fn = sql.slice(start, sql.indexOf('end $$;', start));

ok(start >= 0 && /security definer/.test(fn) && !/security invoker/.test(fn),
  'the report function stays SECURITY DEFINER');
ok(sql.includes('if not private.crm_user() then raise exception') && sql.includes('join private.crm_visible_deal_ids()'),
  'the staff check and the visible-files helper stay in the report function');
ok(sql.includes('d.is_demo = w.is_demo') && sql.includes('private.viewer_is_demo()'),
  'the helper separates demo accounts from real files and works out the caller once');
ok((fn.match(/c\.is_demo = private\.viewer_is_demo\(\)/g) || []).length === 5,
  'all five contacts joins filter c.is_demo = private.viewer_is_demo()');
ok(!/private\.business_source_label\(/.test(fn),
  'the report function does not call business_source_label, which would skip contact demo_scope');
ok(sql.includes("revoke all on function public.crm_deal_report_fields() from public, anon") &&
  sql.includes('readback: crm_deal_report_fields is not SECURITY DEFINER'),
  'anon is revoked and the readback fails if the function is not DEFINER');

console.log(fail ? fail + ' failed' : 'file report fields sec passed');
process.exit(fail ? 1 : 0);
