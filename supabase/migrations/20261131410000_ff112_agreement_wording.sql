-- FF-112 (Francis Santos, confirmed Yes Nov 27 2026 11:40 AM ET, Gmail 1a21de1d2f8fc9d5, item 9):
-- Fix capital letters on the three agreement acknowledgement titles.
-- Version stays 1 so existing acknowledgements still count.
-- Does not change who can read or write, and adds no functions.
-- Rollback: supabase/rollbacks/20261131410000_ff112_agreement_wording.sql
begin;
set local lock_timeout = '3s';

do $ff112$
declare
  n integer;
  privacy_title text;
  consent_title text;
  wire_title text;
begin
  select count(*) into n from public.agreements where version = 1 and code in ('wire_fraud', 'privacy', 'e_consent');
  if n is distinct from 3 then
    raise exception 'drift: expected the three version-1 agreements (wire_fraud, privacy, e_consent)';
  end if;

  update public.agreements
     set title = 'Privacy Notice'
   where code = 'privacy' and version = 1 and title is distinct from 'Privacy Notice';

  update public.agreements
     set title = 'Consent to Electronic Records and Signatures'
   where code = 'e_consent' and version = 1 and title is distinct from 'Consent to Electronic Records and Signatures';

  select title into wire_title from public.agreements where code = 'wire_fraud' and version = 1;
  select title into privacy_title from public.agreements where code = 'privacy' and version = 1;
  select title into consent_title from public.agreements where code = 'e_consent' and version = 1;

  if wire_title is distinct from 'Wire Fraud Warning'
     or privacy_title is distinct from 'Privacy Notice'
     or consent_title is distinct from 'Consent to Electronic Records and Signatures' then
    raise exception 'drift: agreement titles were not the expected FF-112 wording';
  end if;

  if exists (select 1 from public.agreements where code in ('wire_fraud', 'privacy', 'e_consent') and version is distinct from 1) then
    raise exception 'drift: these agreements must stay at version 1 so existing acknowledgements still count';
  end if;
end
$ff112$;

commit;
