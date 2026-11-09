-- File email template merge fixes (John, Nov 9 3:12 PM): order-opened seed uses {{processor_line}}
-- (name + email without empty parentheses). Merge/polish/party loading are frontend-only.
-- Rollback: supabase/rollbacks/20261109221000_file_email_template_merge_fixes.sql

update public.email_templates
set body_html = '<p>Hello {{buyer_first_name}},</p><p>We have opened your file <strong>{{file_number}}</strong> for {{property_address}}. Your processor is {{processor_line}}.</p><p>We will be in touch with next steps. If anything looks wrong on the order, reply here.</p><p>Thank you,</p>',
    updated_at = now()
where seed_key = 'order-opened'
  and body_html like '%{{processor_name}} ({{processor_email}})%';
