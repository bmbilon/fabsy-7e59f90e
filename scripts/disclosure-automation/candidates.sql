-- Read only. Run with the authenticated Supabase CLI, never with --debug:
-- supabase db query --linked --file scripts/disclosure-automation/candidates.sql
-- This is a bounded review queue, NOT authorization to submit every returned row.
-- No licence number, date of birth, bearer token, client email or raw mail is returned.
-- query.py safely changes only the two integer pagination settings. Continue
-- while page_has_more is true. A bounded page is never the whole queue by default.
with pagination as (
  select /* automation_batch_limit */ 50::integer as batch_limit,
         /* automation_batch_offset */ 0::integer as batch_offset
), candidates as (
  select t.*,count(*) over() as active_representation_count,
    regexp_replace(upper(t.ticket_number),'[^A-Z0-9]','','g') as normalized_ticket
  from public.ticket_submissions t
  where t.service_type='representation'
    and t.deleted_at is null
    and t.status in ('pending','in_progress') and t.case_outcome is null
  order by t.created_at,t.id
  limit (select batch_limit from pagination)
  offset (select batch_offset from pagination)
)
select t.id as submission_id,t.normalized_ticket as ticket_number,
  t.active_representation_count,
  (select batch_offset from pagination) as page_offset,
  (select batch_limit from pagination) as page_limit,
  t.active_representation_count > (select batch_offset+batch_limit from pagination) as page_has_more,
  concat_ws(' ',c.first_name,c.last_name) as client_name,
  t.created_at,t.status,t.ticket_type,
  -- Later staff stages stay visible for reconciliation, never automatic refiling.
  -- This shared resolver includes converted-draft inheritance and version data.
  public.disclosure_approval_staff_state(t.id) as staff_workflow,
  (public.disclosure_approval_staff_state(t.id)->'allows_new_request'='true'::jsonb)
    as staff_workflow_allows_new_request,
  public.disclosure_approval_case_eligible(t.id) as approval_source_requirements_met,
  to_jsonb(t)->>'intake_mode' as intake_mode,
  to_jsonb(t)->>'intake_review_status' as intake_review_status,
  t.ticket_document_path,t.consent_form_path,
  split_part(replace(coalesce(t.defense_strategy,''),E'\r',''),E'\n',1) as selected_strategy,
  (strpos(replace(coalesce(t.defense_strategy,''),E'\r',''),E'\n\nExplanation:')>0
    and strpos(replace(coalesce(t.defense_strategy,''),E'\r',''),E'\n\nCircumstances:')>0)
    as has_detailed_intake_strategy_format,
  jsonb_strip_nulls(jsonb_build_object(
    'version',to_jsonb(t)->'intake_consent'->'version',
    'accepted',to_jsonb(t)->'intake_consent'->'accepted',
    'method',to_jsonb(t)->'intake_consent'->'method',
    'acceptedAt',to_jsonb(t)->'intake_consent'->'acceptedAt',
    'authorization',to_jsonb(t)->'intake_consent'->'authorization',
    'pleadNotGuilty',to_jsonb(t)->'intake_consent'->'pleadNotGuilty',
    'pleaLabel',to_jsonb(t)->'intake_consent'->'pleaLabel',
    'pleaInstruction',to_jsonb(t)->'intake_consent'->'pleaInstruction'
  )) as intake_consent_evidence,
  coalesce(to_jsonb(t)->'intake_consent'->>'version'='photo-upload-consent-v3'
    and to_jsonb(t)->'intake_consent'->'pleadNotGuilty'='true'::jsonb,false)
    as explicit_quick_intake_not_guilty,
  -- This indicator requires the operator to verify detailed-form origin. It
  -- never overrides an explicit false choice or a photo-only intake record.
  (coalesce(to_jsonb(t)->>'intake_mode','') <> 'photo_only'
    and not coalesce((to_jsonb(t)->'intake_consent') ? 'pleadNotGuilty',false)
    and split_part(replace(coalesce(t.defense_strategy,''),E'\r',''),E'\n',1)='not_guilty')
    as legacy_not_guilty_strategy_requires_origin_check,
  t.representation_paid_at,
  (t.representation_paid_at is not null or exists(
    select 1 from public.idr_checkout_intents i
    where i.ticket_submission_id=t.id and i.client_id=t.client_id and i.status='paid'
      and i.checkout_kind in ('ticket_only','ticket_with_addon','photo_radar')
  )) as representation_payment_recorded,
  (select coalesce(jsonb_agg(x),'[]'::jsonb) from (
    select i.id,i.status,i.checkout_kind,i.client_id=t.client_id as client_matches,
      i.stripe_checkout_session_id is not null as has_stripe_session
    from public.idr_checkout_intents i where i.ticket_submission_id=t.id
    order by i.id limit 10
  ) x) as checkout_evidence,
  jsonb_strip_nulls(jsonb_build_object(
    'refunded_at',to_jsonb(t)->>'referral_refunded_at',
    'disputed_at',to_jsonb(t)->>'referral_disputed_at',
    'matching_payment_hold_count',(select count(*) from public.referral_payment_holds h
      where h.payment_intent_id=to_jsonb(t)->>'referral_payment_intent_id'),
    'linked_order_hold_count',(select count(*) from public.referral_payment_holds h
      where exists(select 1 from public.idr_orders o where o.ticket_submission_id=t.id
        and o.stripe_payment_intent_id=h.payment_intent_id))
  )) as payment_hold_evidence,
  (select count(*) from public.ticket_submissions other
    where other.service_type='representation'
      and regexp_replace(upper(other.ticket_number),'[^A-Z0-9]','','g')=t.normalized_ticket)
    as representation_records_for_ticket,
  (select count(*) from public.disclosure_confirmations d where d.submission_id=t.id
    or regexp_replace(upper(d.ticket_number),'[^A-Z0-9]','','g')=t.normalized_ticket)
    as existing_confirmation_count,
  (select count(*) from public.disclosure_request_receipts r
    where r.submission_id=t.id or r.ticket_number=t.normalized_ticket) as existing_request_receipt_count,
  (select jsonb_build_object('id',r.id,'submission_id',r.submission_id,'ticket_number',r.ticket_number,
    'source',r.source,'confirmed_at',r.confirmed_at,'portal_session_id',r.portal_session_id,
    'status_sync',r.status_sync,'staff_stage_before',r.staff_stage_before,
    'staff_version_before',r.staff_version_before,'staff_version_after',r.staff_version_after)
    from public.disclosure_request_receipts r
    where r.submission_id=t.id or r.ticket_number=t.normalized_ticket order by r.recorded_at,r.id limit 1)
    as existing_request_receipt,
  case when exists(select 1 from public.disclosure_confirmations d
    where d.status in ('matched','duplicate') and (d.submission_id=t.id
      or regexp_replace(upper(d.ticket_number),'[^A-Z0-9]','','g')=t.normalized_ticket))
    then 'already_acknowledged'
    when exists(select 1 from public.disclosure_request_receipts r
      where r.submission_id=t.id or r.ticket_number=t.normalized_ticket)
    then 'request_confirmed'
    when exists(select 1 from public.disclosure_confirmations d where d.submission_id=t.id
      or regexp_replace(upper(d.ticket_number),'[^A-Z0-9]','','g')=t.normalized_ticket)
    then 'needs_reconciliation' else 'not_recorded' end as disclosure_request_state,
  -- A disclosure acknowledgement proves only disclosure, never a plea/trial
  -- request or full automatic workflow eligibility.
  (select coalesce(jsonb_agg(x),'[]'::jsonb) from (
    select d.id,d.submission_id,d.status,d.confirmed_at,d.received_at
    from public.disclosure_confirmations d where d.submission_id=t.id
      or regexp_replace(upper(d.ticket_number),'[^A-Z0-9]','','g')=t.normalized_ticket
    order by d.received_at desc,d.id limit 10
  ) x) as existing_confirmations,
  (select coalesce(jsonb_agg(x),'[]'::jsonb) from (
    select i.id,i.status,i.signed_at,i.signature_method,i.pdf_path,i.pdf_sha256,
      i.manual_scan_pdf_path,
      coalesce((select r.status from public.representation_consent_manual_reviews r
        where r.invite_id=i.id),i.manual_scan_review_status) as manual_scan_review_status,
      i.access_revoked_at,
      -- Scope only; the entire signed PDF must still be checked before upload.
      left(split_part(split_part(coalesce(i.signed_consent_text,''),
        'AUTHORIZATION AND SCOPE',2),'CLIENT ACKNOWLEDGEMENTS',1),2000) as authorization_scope
    from public.representation_consent_invites i
    where to_jsonb(i)->>'ticket_submission_id'=t.id::text
      or (lower(trim(i.client_email))=lower(trim(c.email)) and exists(
        select 1 from unnest(array_append(coalesce(i.ticket_numbers,array[]::text[]),i.ticket_number)) n
        where regexp_replace(upper(n),'[^A-Z0-9]','','g')=t.normalized_ticket
      ))
    order by i.signed_at desc nulls last,i.id limit 5
  ) x) as standalone_consent_evidence
from candidates t left join public.clients c on c.id=t.client_id
order by t.created_at,t.id;
