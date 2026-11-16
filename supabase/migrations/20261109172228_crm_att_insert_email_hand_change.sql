-- Hand change, already on TEST, do not apply again.
-- Not a TEST history row. The November 9 check expects this earlier policy.
-- crm_att_insert_email copied exactly from supabase/rollbacks/20261109172229_crm_attachment_email_rls.sql.
-- The same predicate is also in supabase/baseline/test_precondition.sql.
-- crm_nov3b creates the policy with auth.uid() and e.id = entity_id. This puts back
-- e.created_by = private.effective_uid() and e.id = e.entity_id before that check runs.
alter policy crm_att_insert_email on public.crm_attachments
  with check (
    (entity = 'email'::text)
    and private.crm_editor()
    and exists (
      select 1
      from public.crm_emails e
      where e.id = e.entity_id
        and e.created_by = private.effective_uid()
    )
  );
