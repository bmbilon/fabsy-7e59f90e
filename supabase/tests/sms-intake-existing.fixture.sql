-- Pre-existing transport metadata must never be backfilled into an email queue.
select public.claim_sms_vapi_inbound('SM'||repeat('9',32),repeat('9',64),12,0,
  '00000000-0000-4000-8000-000000000010',null);
