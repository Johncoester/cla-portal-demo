-- Rollback for 20261116140000_thread_people.sql
begin;
drop function if exists public.thread_people(uuid[]);
commit;
