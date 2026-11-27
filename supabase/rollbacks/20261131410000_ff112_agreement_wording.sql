-- Rollback for 20261131410000_ff112_agreement_wording.sql
begin;
set local lock_timeout = '3s';

update public.agreements
   set title = 'Privacy notice'
 where code = 'privacy' and version = 1 and title is distinct from 'Privacy notice';

update public.agreements
   set title = 'Consent to electronic records and signatures'
 where code = 'e_consent' and version = 1 and title is distinct from 'Consent to electronic records and signatures';

commit;
