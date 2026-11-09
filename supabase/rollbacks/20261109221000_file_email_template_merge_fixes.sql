-- Rollback seed body for order-opened to the prior processor_name/email form.
update public.email_templates
set body_html = '<p>Hello {{buyer_first_name}},</p><p>We have opened your file <strong>{{file_number}}</strong> for {{property_address}}. Your processor is {{processor_name}} ({{processor_email}}).</p><p>We will be in touch with next steps. If anything looks wrong on the order, reply here.</p><p>Thank you,</p>',
    updated_at = now()
where seed_key = 'order-opened';
