-- Let an active agent who is already on a file add their own document.
-- This adds one insert permission. It does not drop, replace, or turn off any existing policy.
-- CLA staff only, or the agent's own side, is allowed. The other side and wire files are not.
-- A disabled, removed, view-only, or other-world account is refused. Another file is refused.
-- Apply only after a separate approval.

create policy documents_assigned_agent_insert
  on public.documents
  for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and coalesce(wire_instructions, false) = false
    and deal_id is not null
    and exists (
      select 1
      from public.profiles as pr
      where pr.id = auth.uid()
        and pr.status = 'active'
        and pr.role = 'Outside user'
        and coalesce(pr.is_demo, false) is not distinct from coalesce((select d.is_demo from public.deals as d where d.id = documents.deal_id), false)
    )
    and exists (
      select 1
      from public.deal_participants as p
      join public.contacts as c on c.id = p.contact_id
      where p.deal_id = documents.deal_id
        and c.profile_id = auth.uid()
        and (
          (p.role = 'Listing Agent' and documents.visibility in ('staff', 'seller'))
          or (p.role = 'Buyer Agent' and documents.visibility in ('staff', 'buyer'))
        )
    )
  );
