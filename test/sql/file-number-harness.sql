-- Disposable local Postgres only: the minimum of the TEST schema the file-number migration touches.
create schema if not exists private;
create sequence public.file_number_seq start 97220;
create table public.deals (id uuid primary key default gen_random_uuid(), file_number text not null default ('MD-26-'::text || nextval('file_number_seq'::regclass)) unique,
  street text not null default '1 Main', city text not null default 'X', state text not null, status text not null default 'Open');
create table public.deal_emails (id uuid primary key default gen_random_uuid(), deal_id uuid references public.deals(id), direction text, to_emails text[], cc_emails text[], bcc_emails text[]);
create table public.outbox (id uuid primary key default gen_random_uuid(), deal_id uuid references public.deals(id), status text, sent_at timestamptz, to_email text, cc_emails text[], bcc_emails text[]);
create table public.activity_log (id bigserial primary key, deal_id uuid, action text, detail text);
create function private.log_activity(p_deal uuid, p_action text, p_entity text, p_id uuid, p_detail text) returns void language sql as
  $$ insert into public.activity_log (deal_id, action, detail) values (p_deal, p_action, p_detail) $$;
