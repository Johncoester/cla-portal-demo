-- Restore the per-row task_readable and document_readable policies.
begin;
set local lock_timeout = '3s';

alter policy tasks_select on public.tasks
using (private.task_readable(id));

alter policy demo_scope on public.tasks
using (
  case
    when deal_id is null then not (select g.is_demo from private.reader_gate() g)
    else private.deal_is_demo(deal_id) = (select g.is_demo from private.reader_gate() g)
  end
)
with check (
  case
    when deal_id is null then not (select g.is_demo from private.reader_gate() g)
    else private.deal_is_demo(deal_id) = (select g.is_demo from private.reader_gate() g)
  end
);

alter policy tasks_audience_limit on public.tasks
using (
  audiences is null
  or (select g.staffish from private.reader_gate() g)
  or private.task_outside_audience(id)
);

alter policy tasks_retired_kept on public.tasks
using (
  template_code is null
  or (select g.is_admin or g.is_processor from private.reader_gate() g)
  or not private.template_code_retired(template_code)
  or (
    status = any (array['todo', 'in_progress', 'blocked'])
    and owner_profile_id = (select g.uid from private.reader_gate() g)
  )
);

alter policy tasks_switch_hidden on public.tasks
using (
  template_code is null
  or (select g.is_admin from private.reader_gate() g)
  or private.task_enabled(template_code)
);

alter policy templates_select on public.task_templates
using (
  (select g.is_admin or coalesce(g.role in ('Processor', 'Preprocessor', 'Transaction Coordinator'), false)
     from private.reader_gate() g)
  or id in (
    select t.template_id
    from public.tasks t
    where t.template_id is not null
      and private.task_readable(t.id)
  )
);

alter policy documents_select on public.documents
using (private.document_readable(id));

alter policy demo_scope on public.documents
using (
  case
    when deal_id is null then not private.viewer_is_demo()
    else private.deal_is_demo(deal_id) = private.viewer_is_demo()
  end
)
with check (
  case
    when deal_id is null then not private.viewer_is_demo()
    else private.deal_is_demo(deal_id) = private.viewer_is_demo()
  end
);

drop function if exists private.readable_document_ids();
drop function if exists private.outside_readable_task_ids();
drop function if exists private.demo_visible_deal_ids();
drop function if exists private.reader_deal_ids();

do $post$
declare
  q text;
begin
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_select';
  if q is distinct from 'private.task_readable(id)' then
    raise exception 'rollback did not restore tasks_select (%)', q;
  end if;
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_select';
  if q is distinct from 'private.document_readable(id)' then
    raise exception 'rollback did not restore documents_select (%)', q;
  end if;
  if to_regprocedure('private.readable_document_ids()') is not null
     or to_regprocedure('private.outside_readable_task_ids()') is not null then
    raise exception 'rollback left a set helper';
  end if;
end
$post$;

commit;
