-- Extend the isolated dashboard fixture to the existing production ledger shape.
alter table analytics_private.paid_payment_purchases add column product text not null default 'rapid_resolution';
