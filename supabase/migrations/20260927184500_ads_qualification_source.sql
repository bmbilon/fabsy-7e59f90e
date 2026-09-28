begin;
alter table public.ads_draft_attribution add column contact_hash text check(contact_hash ~ '^[a-f0-9]{64}$'), add column readable_document_hash text check(readable_document_hash ~ '^[a-f0-9]{64}$');
alter table public.ads_attribution add column contact_hash text check(contact_hash ~ '^[a-f0-9]{64}$'), add column readable_document_hash text check(readable_document_hash ~ '^[a-f0-9]{64}$');
commit;
