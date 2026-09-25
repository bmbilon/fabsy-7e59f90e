do $$
declare c uuid:=gen_random_uuid(); t uuid:=gen_random_uuid(); t2 uuid:=gen_random_uuid(); t3 uuid:=gen_random_uuid();
 intent uuid; order_id uuid; rev bigint;
begin
 insert into clients values(c,'Fixture','Client');
 insert into ticket_submissions(id,client_id,service_type,status,ticket_number) values(t,c,'representation','awaiting_payment','T12345678Z'),(t2,c,'representation','awaiting_payment','T87654321Z'),(t3,c,'representation','awaiting_payment','T22222222Z');
 if exists(select 1 from admin_ticket_case_status) then raise exception 'Unpaid ticket advanced'; end if;
 insert into idr_checkout_intents(ticket_submission_id,client_id,status,checkout_kind) values(t,c,'open','ticket_only') returning id into intent;
 update idr_checkout_intents set status='failed' where id=intent;
 if exists(select 1 from admin_ticket_case_status) then raise exception 'Failed checkout advanced'; end if;
 update idr_checkout_intents set status='paid' where id=intent;
 if exists(select 1 from admin_ticket_case_status) then raise exception 'Missing Stripe proof accepted'; end if;
 select revision into rev from admin_workspace_updates;
 update idr_checkout_intents set stripe_checkout_session_id='cs_fixture' where id=intent;
 if not exists(select 1 from admin_ticket_case_status where ticket_id=t and stage='paid' and version=1) then raise exception 'Verified payment did not advance'; end if;
 if (select revision from admin_workspace_updates)<=rev then raise exception 'No live event'; end if;
 update idr_checkout_intents set status='paid' where id=intent;
 if (select version from admin_ticket_case_status where ticket_id=t)<>1 then raise exception 'Duplicate changed stage version'; end if;
 update admin_ticket_case_status set stage='crown_offer_received',version=2 where ticket_id=t;
 update idr_checkout_intents set status='paid' where id=intent;
 if not exists(select 1 from admin_ticket_case_status where ticket_id=t and stage='crown_offer_received' and version=2) then raise exception 'Crown offer regressed'; end if;
 insert into service_orders(ticket_submission_id,client_id,mode,product,payment_status,paid_at,stripe_session_id,stripe_payment_intent_id)
 values(null,c,'payment','rapid_resolution','paid',now(),'cs_fixture2','pi_fixture2') returning id into order_id;
 if exists(select 1 from admin_ticket_case_status where ticket_id=t2) then raise exception 'Unmatched payment guessed a case'; end if;
 update service_orders set ticket_submission_id=t2 where id=order_id;
 if not exists(select 1 from admin_ticket_case_status where ticket_id=t2 and stage='paid') then raise exception 'Matched service payment did not advance'; end if;
 insert into service_orders(ticket_submission_id,client_id,mode,product,payment_status,paid_at,stripe_session_id,stripe_payment_intent_id)
 values(t3,c,'payment','photo_radar','refunded',now(),'cs_fixture3','pi_fixture3');
 update ticket_submissions set representation_paid_at=now(),representation_checkout_session_id='cs_fixture3' where id=t3;
 if exists(select 1 from admin_ticket_case_status where ticket_id=t3) then raise exception 'Refunded payment advanced'; end if;
 if jsonb_array_length(portal_recent_payments())<>2 then raise exception 'Payment view missing service/refund records'; end if;
 if has_table_privilege('anon','admin_workspace_updates','select') then raise exception 'Anonymous signal access'; end if;
 if has_table_privilege('authenticated','admin_workspace_updates','update') then raise exception 'Browser can forge signal'; end if;
 if has_function_privilege('authenticated','sync_verified_payment_case_stage(uuid)','execute') then raise exception 'Browser can mark paid'; end if;
end $$;
set role authenticated;
do $$ begin
 if exists(select 1 from public.admin_workspace_updates) then raise exception 'Nonstaff read staff signal'; end if;
end $$;
reset role;
select set_config('test.staff','true',false);
set role authenticated;
do $$ begin
 if (select count(*) from public.admin_workspace_updates)<>1 then raise exception 'Staff cannot read signal'; end if;
end $$;
reset role;
