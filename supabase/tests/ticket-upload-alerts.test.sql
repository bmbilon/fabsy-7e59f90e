\set ON_ERROR_STOP on
begin;
insert into public.ticket_intake_drafts (id,access_token_hash,email,phone,draft_data,ticket_document_path)
values ('00000000-0000-4000-8000-000000000001',repeat('a',64),'lead@example.com','4035550123','{"firstName":"Original"}', '00000000-0000-4000-8000-000000000001/first.pdf');
do $$ begin
 if exists(select 1 from public.ticket_upload_alerts) then raise exception 'unconfirmed upload alerted'; end if;
end $$;
-- Exercise the actual existing production confirmation function, not a test copy.
select public.confirm_ticket_intake_draft_upload('00000000-0000-4000-8000-000000000001',repeat('a',64),1);
select public.confirm_ticket_intake_draft_upload('00000000-0000-4000-8000-000000000001',repeat('a',64),2);
select public.enqueue_ticket_upload_alert('00000000-0000-4000-8000-000000000001');
do $$ begin
 if (select count(*) from public.ticket_upload_alerts) <> 1 then raise exception 'confirmation replay duplicated email'; end if;
end $$;
update public.ticket_intake_drafts set email='updated@example.com', draft_data='{"firstName":"Changed"}', revision=3,
 pending_ticket_document_path='00000000-0000-4000-8000-000000000001/replacement.pdf',
 pending_ticket_document_content_type='application/pdf',pending_ticket_document_size_bytes=1200
where id='00000000-0000-4000-8000-000000000001';
select public.confirm_ticket_intake_draft_upload('00000000-0000-4000-8000-000000000001',repeat('a',64),3);
do $$ begin
 if (select count(*) from public.ticket_upload_alerts) <> 2 then raise exception 'replacement did not enqueue a distinct alert'; end if;
 if not exists(select 1 from public.ticket_upload_alerts where contact_snapshot->>'email'='lead@example.com') then raise exception 'snapshot mutated after contact edit'; end if;
 if has_table_privilege('anon','public.ticket_upload_alerts','select') or has_table_privilege('authenticated','public.ticket_upload_alerts','insert') then raise exception 'private queue exposed'; end if;
 if has_function_privilege('anon','public.enqueue_ticket_upload_alert(uuid)','execute') or has_function_privilege('authenticated','public.claim_ticket_upload_alerts(integer)','execute') then raise exception 'privileged RPC exposed'; end if;
end $$;
create temporary table claims as select * from public.claim_ticket_upload_alerts(10);
do $$
declare a public.ticket_upload_alerts%rowtype; frozen jsonb;
begin
 if (select count(*) from claims) <> 2 then raise exception 'claims missing'; end if;
 if exists(select 1 from public.claim_ticket_upload_alerts(10)) then raise exception 'live claims were concurrently reclaimed'; end if;
 select * into a from claims order by id limit 1;
 frozen := public.freeze_ticket_upload_alert_email(a.id,a.claim_id,'{"to":["brett@execom.ca"],"html":"original","subject":"upload"}');
 frozen := public.freeze_ticket_upload_alert_email(a.id,a.claim_id,'{"to":["brett@execom.ca"],"html":"changed","subject":"upload"}');
 if frozen->>'html' <> 'original' then raise exception 'provider payload not immutable'; end if;
 if public.finish_ticket_upload_alert(a.id,gen_random_uuid(),'sent','wrong',null) then raise exception 'wrong claim completed'; end if;
 if not public.finish_ticket_upload_alert(a.id,a.claim_id,'sent','provider-id',null) then raise exception 'send not persisted'; end if;
end $$;
-- Recover interrupted work under the same event ID and payload.
update public.ticket_upload_alerts set claim_expires_at=now()-interval '1 minute' where status='sending';
create temporary table retries as select * from public.claim_ticket_upload_alerts(10);
do $$
declare a public.ticket_upload_alerts%rowtype;
begin
 if (select count(*) from retries) <> 1 then raise exception 'expired claim recovery incorrect'; end if;
 select * into a from retries;
 if a.attempt_count <> 2 then raise exception 'attempt count not incremented'; end if;
 if not public.finish_ticket_upload_alert(a.id,a.claim_id,'retry',null,'provider_network_error') then raise exception 'retry not queued'; end if;
 if exists(select 1 from public.claim_ticket_upload_alerts(10)) then raise exception 'retry delay ignored'; end if;
end $$;
update public.ticket_upload_alerts set first_attempt_at=now()-interval '24 hours',next_attempt_at=now()-interval '1 minute' where status='retry';
do $$ begin
 if exists(select 1 from public.claim_ticket_upload_alerts(10)) then raise exception 'unsafe resend outside provider window'; end if;
 if (select count(*) from public.ticket_upload_alerts where status='indeterminate') <> 1 then raise exception 'expired provider fence not flagged'; end if;
 if (select count(*) from public.ticket_upload_alerts where status='sent') <> 1 then raise exception 'sent fence lost'; end if;
end $$;
-- No parent case may be lost because a provider call fails; email work is separate.
select public.enqueue_ticket_upload_alert('00000000-0000-4000-8000-000000000001');
do $$ begin
 if (select count(*) from public.ticket_upload_alerts) <> 2 then raise exception 'terminal event re-enqueued'; end if;
end $$;
delete from public.ticket_intake_drafts where id='00000000-0000-4000-8000-000000000001';
do $$ begin
 if exists(select 1 from public.ticket_upload_alerts) then raise exception 'private email payload survives intake deletion'; end if;
 raise notice 'ticket upload alert database tests passed';
end $$;
rollback;
