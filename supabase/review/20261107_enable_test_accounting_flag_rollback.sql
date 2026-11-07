-- Rollback for 20261107_enable_test_accounting_flag.sql.
-- Turns TEST Accounting off again. Does not drop contract-figure rows and does not change other features.

update private.features set enabled = false where name = 'accounting';
