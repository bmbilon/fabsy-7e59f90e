-- Keep explicitly tagged verification traffic in the private ledger while
-- excluding it consistently from business funnel and behavior aggregates.
-- This policy does not classify customers or filter the signed cash ledger.
-- Missing source labels may be recovered only from already-stored click proof.
-- A Meta click identifies its source, but does not establish paid traffic.

begin;

create or replace function analytics_private.is_paid_funnel_verification(
  p_source text,
  p_medium text,
  p_campaign text
)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select lower(coalesce(p_source, '')) = 'qa'
    or lower(coalesce(p_medium, '')) = 'qa'
    or lower(coalesce(p_campaign, '')) ~ '^(qa_|fabsy_aeo_verification_)';
$$;

revoke all on function analytics_private.is_paid_funnel_verification(text, text, text)
  from public, anon, authenticated, service_role;

comment on function analytics_private.is_paid_funnel_verification(text, text, text) is
  'Reserved verification tags only: exact source or medium qa, campaign prefix qa_ or fabsy_aeo_verification_, case-insensitive. No content matching, customer inference, deletion or cash-ledger filtering.';

create or replace function public.paid_funnel_report(
  p_since timestamptz,
  p_until timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  report jsonb;
  financials jsonb;
begin
  if p_since is null or p_until is null or p_since >= p_until or
      p_since < p_until - interval '90 days' or p_until > clock_timestamp() + interval '5 minutes' then
    raise exception 'FUNNEL_REPORT_WINDOW_INVALID';
  end if;

  with source as (
    select events.*,
      case
        when utm_source is not null then utm_source
        when click_id_hash is not null and click_id_kind in ('gclid','gbraid','wbraid') then 'google'
        when click_id_hash is not null and click_id_kind = 'fbclid' then 'meta'
        else null
      end as reporting_source,
      case
        when utm_medium is not null then utm_medium
        when utm_source is null and click_id_hash is not null
          and click_id_kind in ('gclid','gbraid','wbraid') then 'cpc'
        else null
      end as reporting_medium
    from analytics_private.paid_funnel_events events
    where occurred_at >= p_since and occurred_at < p_until
      and not analytics_private.is_paid_funnel_verification(utm_source, utm_medium, utm_campaign)
  ), event_totals as (
    select event_name, count(*)::bigint as event_count, count(distinct session_id)::bigint as sessions
    from source
    group by event_name
  ), campaign_totals as (
    select
      coalesce(reporting_source, '(direct)') as source,
      coalesce(reporting_medium, '(none)') as medium,
      coalesce(utm_campaign, '(none)') as campaign,
      coalesce(utm_content, '(none)') as content,
      count(distinct session_id) filter (where event_name = 'landing_view')::bigint as landing_sessions,
      count(distinct session_id) filter (where event_name = 'primary_cta_click')::bigint as cta_sessions,
      count(distinct session_id) filter (where event_name = 'phone_click')::bigint as phone_sessions,
      count(distinct session_id) filter (where event_name = 'intake_started')::bigint as intake_sessions,
      count(distinct session_id) filter (where event_name = 'ticket_uploaded')::bigint as upload_sessions,
      count(distinct session_id) filter (where event_name = 'lead_saved')::bigint as lead_sessions,
      count(distinct session_id) filter (where event_name = 'checkout_started')::bigint as checkout_sessions,
      count(distinct session_id) filter (where event_name = 'checkout_canceled')::bigint as canceled_sessions,
      count(distinct session_id) filter (where event_name = 'purchase')::bigint as purchase_sessions
    from source
    group by coalesce(reporting_source, '(direct)'), coalesce(reporting_medium, '(none)'),
      coalesce(utm_campaign, '(none)'), coalesce(utm_content, '(none)')
  ), daily_totals as (
    select
      (occurred_at at time zone 'America/Edmonton')::date as day,
      count(distinct session_id) filter (where event_name = 'landing_view')::bigint as landing_sessions,
      count(distinct session_id) filter (where event_name = 'lead_saved')::bigint as lead_sessions,
      count(distinct session_id) filter (where event_name = 'purchase')::bigint as purchase_sessions
    from source
    group by (occurred_at at time zone 'America/Edmonton')::date
  )
  select jsonb_build_object(
    'generated_at', clock_timestamp(),
    'since', p_since,
    'until', p_until,
    'consented_sessions_only', true,
    'verification_traffic_excluded', true,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_name', event_name,
        'event_count', event_count,
        'sessions', sessions
      ) order by event_name)
      from event_totals
    ), '[]'::jsonb),
    'campaigns', coalesce((
      select jsonb_agg(to_jsonb(campaign_totals) order by landing_sessions desc, source, campaign, content)
      from campaign_totals
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(to_jsonb(daily_totals) order by day)
      from daily_totals
    ), '[]'::jsonb)
  ) into report;

  with purchases as (
    select * from analytics_private.paid_payment_purchases
    where occurred_at >= p_since and occurred_at < p_until
  ), refunds as (
    select * from analytics_private.paid_payment_refunds
    where status_observed_at >= p_since and status_observed_at < p_until
  ), purchase_groups as (
    select product, currency, count(*)::bigint as purchase_count,
      sum(amount_cents)::bigint as gross_purchase_amount_cents,
      sum(tax_cents)::bigint as purchase_tax_amount_cents
    from purchases group by product, currency
  ), refund_status_groups as (
    select coalesce(product, '(unmatched)') as product, currency, status,
      count(*)::bigint as refund_count,
      sum(amount_cents)::bigint as refund_amount_cents
    from refunds group by coalesce(product, '(unmatched)'), currency, status
  ), cashflow_rows as (
    select product, currency, amount_cents as purchase_cents, 0::bigint as refund_cents
    from purchases
    union all
    select coalesce(product, '(unmatched)') as product, currency, 0::bigint, amount_cents
    from refunds where status = 'succeeded'
  ), cashflow_groups as (
    select product, currency,
      sum(purchase_cents)::bigint as gross_purchase_amount_cents,
      sum(refund_cents)::bigint as gross_refund_amount_cents,
      (sum(purchase_cents) - sum(refund_cents))::bigint as refund_adjusted_cashflow_cents
    from cashflow_rows group by product, currency
  ), affected_payments as (
    select distinct payment_intent_hash
    from refunds where status = 'succeeded'
  ), lifetime_refunds as (
    select refund.payment_intent_hash, count(*)::bigint as refund_count,
      sum(refund.amount_cents)::bigint as refunded_cents
    from analytics_private.paid_payment_refunds refund
    join affected_payments affected using (payment_intent_hash)
    where refund.status = 'succeeded'
    group by refund.payment_intent_hash
  ), refund_outcomes as (
    select
      count(*) filter (where lifetime.refunded_cents < purchase.amount_cents)::bigint as partial_purchase_count,
      count(*) filter (where lifetime.refunded_cents = purchase.amount_cents)::bigint as full_purchase_count,
      count(*) filter (where lifetime.refunded_cents > purchase.amount_cents)::bigint as over_refunded_purchase_count,
      count(*) filter (where lifetime.refund_count > 1)::bigint as multiple_refund_purchase_count
    from lifetime_refunds lifetime
    join analytics_private.paid_payment_purchases purchase using (payment_intent_hash)
  ), cohort_refunds as (
    select purchase.checkout_session_hash, purchase.product, purchase.currency,
      count(refund.refund_hash)::bigint as refund_count,
      coalesce(sum(refund.amount_cents), 0)::bigint as refunded_cents
    from purchases purchase
    left join analytics_private.paid_payment_refunds refund
      on refund.payment_intent_hash = purchase.payment_intent_hash
      and refund.status = 'succeeded'
    group by purchase.checkout_session_hash, purchase.product, purchase.currency
  ), cohort_summary as (
    select
      count(*)::bigint as purchase_count,
      count(*) filter (where cohort.refund_count > 0)::bigint as refunded_purchase_count,
      coalesce(sum(purchase.amount_cents), 0)::bigint as gross_purchase_amount_cents,
      coalesce(sum(purchase.amount_cents - purchase.tax_cents), 0)::bigint as service_amount_before_refunds_cents,
      coalesce(sum(cohort.refunded_cents), 0)::bigint as succeeded_refund_amount_cents,
      (coalesce(sum(purchase.amount_cents), 0) - coalesce(sum(cohort.refunded_cents), 0))::bigint
        as gross_refund_adjusted_amount_cents
    from purchases purchase
    join cohort_refunds cohort using (checkout_session_hash)
  ), cohort_groups as (
    select purchase.product, purchase.currency,
      count(*)::bigint as purchase_count,
      count(*) filter (where cohort.refund_count > 0)::bigint as refunded_purchase_count,
      case when count(*) = 0 then null else
        round(count(*) filter (where cohort.refund_count > 0)::numeric / count(*)::numeric, 6)
      end as any_refund_purchase_rate,
      sum(purchase.amount_cents)::bigint as gross_purchase_amount_cents,
      sum(purchase.amount_cents - purchase.tax_cents)::bigint as service_amount_before_refunds_cents,
      sum(cohort.refunded_cents)::bigint as succeeded_refund_amount_cents,
      (sum(purchase.amount_cents) - sum(cohort.refunded_cents))::bigint as gross_refund_adjusted_amount_cents
    from purchases purchase
    join cohort_refunds cohort using (checkout_session_hash)
    group by purchase.product, purchase.currency
  )
  select jsonb_build_object(
    'scope', 'all_customer_purchases_from_signed_stripe_webhooks',
    'amount_basis', 'gross_customer_cash_including_tax',
    'refund_events_sent_to_ad_providers', false,
    'purchase_count', (select count(*)::bigint from purchases),
    'currently_attributed_purchase_count', (
      select count(*)::bigint
      from purchases purchase
      where purchase.funnel_session_id is not null
        and not exists (
          select 1 from analytics_private.paid_funnel_checkout_withdrawals withdrawal
          where withdrawal.checkout_session_hash = purchase.checkout_session_hash
        )
    ),
    'unattributed_or_withdrawn_purchase_count', (
      select count(*)::bigint
      from purchases purchase
      where purchase.funnel_session_id is null
        or exists (
          select 1 from analytics_private.paid_funnel_checkout_withdrawals withdrawal
          where withdrawal.checkout_session_hash = purchase.checkout_session_hash
        )
    ),
    'succeeded_refund_count', (select count(*)::bigint from refunds where status = 'succeeded' and product is not null),
    'succeeded_refund_amount_cents', coalesce((select sum(amount_cents)::bigint from refunds where status = 'succeeded' and product is not null), 0),
    'unmatched_succeeded_refund_count', (select count(*)::bigint from refunds where status = 'succeeded' and product is null),
    'unmatched_succeeded_refund_amount_cents', coalesce((select sum(amount_cents)::bigint from refunds where status = 'succeeded' and product is null), 0),
    'purchases_by_product_currency', coalesce((
      select jsonb_agg(to_jsonb(purchase_groups) order by product, currency) from purchase_groups
    ), '[]'::jsonb),
    'refunds_by_product_currency_status', coalesce((
      select jsonb_agg(to_jsonb(refund_status_groups) order by product, currency, status) from refund_status_groups
    ), '[]'::jsonb),
    'cashflow_by_product_currency', coalesce((
      select jsonb_agg(to_jsonb(cashflow_groups) order by product, currency) from cashflow_groups
    ), '[]'::jsonb),
    'refund_outcomes', coalesce((select to_jsonb(refund_outcomes) from refund_outcomes), jsonb_build_object(
      'partial_purchase_count', 0,
      'full_purchase_count', 0,
      'over_refunded_purchase_count', 0,
      'multiple_refund_purchase_count', 0
    )),
    'purchase_cohort', jsonb_build_object(
      'basis', 'purchases_in_window_with_all_succeeded_refunds_known_at_generated_at',
      'rate_basis', 'share_of_purchases_with_any_succeeded_refund',
      'business_reason_status', 'not_classified_by_stripe_webhook',
      'purchase_count', (select purchase_count from cohort_summary),
      'refunded_purchase_count', (select refunded_purchase_count from cohort_summary),
      'any_refund_purchase_rate', case
        when (select purchase_count from cohort_summary) = 0 then null
        else round(
          (select refunded_purchase_count from cohort_summary)::numeric /
          (select purchase_count from cohort_summary)::numeric,
          6
        )
      end,
      'gross_purchase_amount_cents', (select gross_purchase_amount_cents from cohort_summary),
      'service_amount_before_refunds_cents', (select service_amount_before_refunds_cents from cohort_summary),
      'succeeded_refund_amount_cents', (select succeeded_refund_amount_cents from cohort_summary),
      'gross_refund_adjusted_amount_cents', (select gross_refund_adjusted_amount_cents from cohort_summary),
      'by_product_currency', coalesce((
        select jsonb_agg(to_jsonb(cohort_groups) order by product, currency) from cohort_groups
      ), '[]'::jsonb)
    ),
    'net_retained_customer_status', 'not_measurable_without_qualifying_crown_rejection',
    'new_vs_returning_customer_status', 'not_implemented_without_canonical_customer_order_identity'
  ) into financials;

  return report || jsonb_build_object('financials', financials);
end;
$$;

revoke all on function public.paid_funnel_report(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.paid_funnel_report(timestamptz, timestamptz)
  to service_role;

comment on function public.paid_funnel_report(timestamptz, timestamptz) is
  'Returns consented funnel aggregates excluding reserved verification tags, plus separate all-customer PII-free purchase/refund cash facts from verified signed Stripe webhooks. Net-retained and new/returning customer status remain explicitly unmeasurable.';

create or replace function public.paid_funnel_behavior_report(
  p_since timestamptz,
  p_until timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  report jsonb;
begin
  if p_since is null or p_until is null or p_since >= p_until or
      p_since < p_until - interval '90 days' or p_until > clock_timestamp() + interval '5 minutes' then
    raise exception 'FUNNEL_REPORT_WINDOW_INVALID';
  end if;

  with source as (
    select events.*,
      case
        when utm_source is not null then utm_source
        when click_id_hash is not null and click_id_kind in ('gclid','gbraid','wbraid') then 'google'
        when click_id_hash is not null and click_id_kind = 'fbclid' then 'meta'
        else null
      end as reporting_source,
      case
        when utm_medium is not null then utm_medium
        when utm_source is null and click_id_hash is not null
          and click_id_kind in ('gclid','gbraid','wbraid') then 'cpc'
        else null
      end as reporting_medium
    from analytics_private.paid_funnel_events events
    where occurred_at >= p_since and occurred_at < p_until
      and not analytics_private.is_paid_funnel_verification(utm_source, utm_medium, utm_campaign)
  ), campaign_totals as (
    select
      coalesce(reporting_source, '(direct)') as source,
      coalesce(reporting_medium, '(none)') as medium,
      coalesce(utm_campaign, '(none)') as campaign,
      coalesce(utm_content, '(none)') as content,
      count(distinct session_id) filter (where event_name = 'primary_cta_viewed')::bigint as cta_viewed_sessions,
      count(distinct session_id) filter (where event_name = 'engaged_10s')::bigint as engaged_10s_sessions,
      count(distinct session_id) filter (where event_name = 'engaged_30s')::bigint as engaged_30s_sessions,
      count(distinct session_id) filter (where event_name = 'engaged_60s')::bigint as engaged_60s_sessions,
      count(distinct session_id) filter (where event_name = 'scroll_25')::bigint as scroll_25_sessions,
      count(distinct session_id) filter (where event_name = 'scroll_50')::bigint as scroll_50_sessions,
      count(distinct session_id) filter (where event_name = 'scroll_75')::bigint as scroll_75_sessions,
      count(distinct session_id) filter (where event_name = 'scroll_90')::bigint as scroll_90_sessions,
      count(distinct session_id) filter (where event_name = 'ticket_upload_started')::bigint as upload_started_sessions,
      count(distinct session_id) filter (where event_name = 'ticket_upload_failed')::bigint as upload_failed_sessions,
      count(distinct session_id) filter (where event_name = 'intake_validation_blocked')::bigint as validation_blocked_sessions
    from source
    group by coalesce(reporting_source, '(direct)'), coalesce(reporting_medium, '(none)'),
      coalesce(utm_campaign, '(none)'), coalesce(utm_content, '(none)')
  ), step_totals as (
    select step,
      count(distinct session_id) filter (where event_name = 'intake_step_viewed')::bigint as viewed_sessions,
      count(distinct session_id) filter (where event_name = 'intake_validation_blocked')::bigint as blocked_sessions,
      count(distinct session_id) filter (where event_name = 'intake_step_completed')::bigint as completed_sessions
    from source
    where event_name in ('intake_step_viewed','intake_validation_blocked','intake_step_completed')
    group by step
  )
  select jsonb_build_object(
    'verification_traffic_excluded', true,
    'campaigns', coalesce((
      select jsonb_agg(to_jsonb(campaign_totals) order by source, campaign, content)
      from campaign_totals
    ), '[]'::jsonb),
    'steps', coalesce((
      select jsonb_agg(to_jsonb(step_totals) order by step)
      from step_totals
    ), '[]'::jsonb)
  ) into report;
  return report;
end;
$$;

revoke all on function public.paid_funnel_behavior_report(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.paid_funnel_behavior_report(timestamptz, timestamptz)
  to service_role;

comment on function public.paid_funnel_behavior_report(timestamptz, timestamptz) is
  'Returns only aggregate consented behavior checkpoints excluding reserved verification tags by campaign and intake step. It exposes no row-level identifiers, form values or free text.';

commit;
