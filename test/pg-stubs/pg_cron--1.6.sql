-- Scratch stand-in. The real pg_cron runs jobs. This only records them.
create schema if not exists cron;

create table cron.job (
  jobid bigint generated always as identity primary key,
  schedule text not null,
  command text not null,
  jobname text
);

create function cron.schedule(job_name text, schedule text, command text) returns bigint
language plpgsql
as $$
declare i bigint;
begin
  insert into cron.job (schedule, command, jobname) values (schedule, command, job_name) returning jobid into i;
  return i;
end $$;

create function cron.unschedule(job_id bigint) returns boolean
language plpgsql
as $$
begin
  delete from cron.job where jobid = job_id;
  return found;
end $$;
