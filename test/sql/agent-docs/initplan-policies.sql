-- Policy expressions copied from the sanitized catalog, applied to the throwaway role authenticated.

create policy tasks_select on public.tasks for SELECT to authenticated using ((private.can_access_deal(deal_id) AND private.task_visible(owner_profile_id, assigned_role, deal_id) AND (NOT ((assigned_role = 'Client-Buyer'::text) AND private.emd_receipt_title(title) AND private.is_pure_buyer(deal_id)))));
create policy tasks_insert on public.tasks for INSERT to authenticated with check ((private.can_access_deal(deal_id) AND private.is_manager() AND (kind = 'simple'::text) AND (participant_id IS NULL) AND (template_id IS NULL) AND (owner_profile_id IS NULL)));
create policy tasks_update on public.tasks for UPDATE to authenticated using ((private.can_access_deal(deal_id) AND private.is_manager())) with check ((private.can_access_deal(deal_id) AND private.is_manager()));
create policy demo_scope on public.tasks as restrictive for ALL to authenticated using (CASE WHEN (deal_id IS NULL) THEN (NOT private.viewer_is_demo()) ELSE ((SELECT d.is_demo FROM deals d WHERE (d.id = tasks.deal_id)) = private.viewer_is_demo()) END) with check (CASE WHEN (deal_id IS NULL) THEN (NOT private.viewer_is_demo()) ELSE ((SELECT d.is_demo FROM deals d WHERE (d.id = tasks.deal_id)) = private.viewer_is_demo()) END);
create policy tasks_switch_hidden_upd on public.tasks as restrictive for UPDATE to authenticated using (((template_code IS NULL) OR private.task_enabled(template_code) OR private.is_admin()));
create policy deals_select on public.deals for SELECT to authenticated using (private.can_access_deal(id));
create policy deals_insert on public.deals for INSERT to authenticated with check ((private.is_processor() AND (created_by = private.effective_uid()) AND ((NOT private.is_preprocessor()) OR (preprocessor_user_id = private.effective_uid()))));
create policy deals_update on public.deals for UPDATE to authenticated using (private.can_run_deal(id)) with check (private.can_run_deal(id));
create policy demo_scope on public.deals as restrictive for ALL to authenticated using ((is_demo = private.viewer_is_demo())) with check ((is_demo = private.viewer_is_demo()));
create policy participants_select on public.deal_participants for SELECT to authenticated using (private.participant_visible(deal_id, role));
create policy participants_insert on public.deal_participants for INSERT to authenticated with check (private.can_run_deal(deal_id));
create policy participants_delete on public.deal_participants for DELETE to authenticated using (private.can_run_deal(deal_id));
create policy demo_scope on public.deal_participants as restrictive for ALL to authenticated using (CASE WHEN (deal_id IS NULL) THEN (NOT private.viewer_is_demo()) ELSE ((SELECT d.is_demo FROM deals d WHERE (d.id = deal_participants.deal_id)) = private.viewer_is_demo()) END) with check (CASE WHEN (deal_id IS NULL) THEN (NOT private.viewer_is_demo()) ELSE ((SELECT d.is_demo FROM deals d WHERE (d.id = deal_participants.deal_id)) = private.viewer_is_demo()) END);
create policy contacts_select on public.contacts for SELECT to authenticated using (private.contact_visible(id));
create policy contacts_insert on public.contacts for INSERT to authenticated with check (((NOT private.is_preprocessor()) AND private.is_processor()));
create policy contacts_update on public.contacts for UPDATE to authenticated using (((private.me_role() <> 'Preprocessor'::text) AND private.is_processor())) with check (((private.me_role() <> 'Preprocessor'::text) AND private.is_processor()));
create policy demo_scope on public.contacts as restrictive for ALL to authenticated using ((is_demo = private.viewer_is_demo())) with check ((is_demo = private.viewer_is_demo()));
create policy profiles_select on public.profiles for SELECT to authenticated using (((private.me_role() IS NOT NULL) AND private.shares_deal_with(id)));
create policy profiles_update_admin on public.profiles for UPDATE to authenticated using (private.is_admin()) with check (private.is_admin());
create policy profiles_update_self on public.profiles for UPDATE to authenticated using (((id = private.effective_uid()) AND (private.me_role() IS NOT NULL))) with check ((id = private.effective_uid()));
create policy demo_scope on public.profiles as restrictive for ALL to authenticated using ((is_demo = private.viewer_is_demo())) with check ((is_demo = private.viewer_is_demo()));

-- Exact captured preimage USING text (proposal-v2 preimage / rollback body).
create policy tasks_audience_limit on public.tasks as restrictive for select to authenticated
  using (((audiences IS NULL) OR private.is_staffish() OR private.task_outside_audience(id)));
create policy tasks_retired_kept on public.tasks as restrictive for select to authenticated
  using (((template_code IS NULL) OR (NOT private.template_code_retired(template_code)) OR private.is_admin() OR private.is_processor() OR ((status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'blocked'::text])) AND (owner_profile_id = ( SELECT private.effective_uid() AS uid)))));
create policy tasks_switch_hidden on public.tasks as restrictive for select to authenticated
  using (((template_code IS NULL) OR private.task_enabled(template_code) OR private.is_admin()));
