-- Read-only, aggregate-only report for an authorised database operator.
-- No provider calls, spend changes, transfers, functions, or persisted views.
-- Cohort: all currently paid representation checkouts at the new product prices.
-- Legacy/missing/conflicting quotes are counted separately, never price-imputed.
--
-- Revenue is the immutable pre-GST checkout subtotal less its upfront discount.
-- A bundle is one order; do NOT add its idr_orders allocation a second time.
-- A succeeded later PRO refund reduces revenue by discount_cents only (its GST
-- refund is tax_cents). Parent discount flags are NOT subtracted again.
-- General refund/dispute amounts are not retained locally. Any such history,
-- including a known PRO refund which could coexist with another refund, makes
-- complete_net_service_arpu_cad NULL until finance reconciles provider totals.
-- The partial measure is explicitly BEFORE other refunds, not net revenue.
--
-- Business watch only: the user's >30% officer pro-verified share and roughly
-- $150 CAC review point are planning assumptions, not a derived profitability
-- result or permission to change advertising spend. Camera-heavy mix needs a
-- separate acquisition model. No client/payee identifiers leave this report.
with paid_core as (
  select i.*,
    count(*) over (partition by i.ticket_submission_id) as paid_intent_count,
    row_number() over (partition by i.ticket_submission_id order by i.id) as order_row
  from public.idr_checkout_intents i
  where i.status = 'paid'
    and i.checkout_kind in ('ticket_only','ticket_with_addon','photo_radar')
    and i.ticket_submission_id is not null
), order_facts as (
  select t.id,t.ticket_type,t.pro_verified,i.paid_intent_count,
    case
      when i.paid_intent_count <> 1 then null
      when t.ticket_type = 'officer_issued'
        and i.checkout_kind in ('ticket_only','ticket_with_addon')
        and i.pro_subtotal_cents in (19800,22900)
        then i.pro_subtotal_cents - i.pro_discount_cents
      when t.ticket_type = 'photo_radar' and i.checkout_kind = 'photo_radar'
        and i.expected_amount_cents = 7900 and i.pro_coupon is null
        and i.pro_discount_cents = 0 then 7900
      else null
    end as booked_service_cents,
    case when p.status = 'succeeded' and p.checkout_intent_id = i.id
      and i.pro_discount_cents = 0 then p.discount_cents else 0 end as known_pro_refund_cents,
    (p.ticket_submission_id is not null and
      (p.checkout_intent_id <> i.id or i.pro_discount_cents <> 0)) as refund_snapshot_conflict,
    (t.referral_refunded_at is not null or t.referral_disputed_at is not null
      or p.ticket_submission_id is not null
      or exists(select 1 from public.referral_payment_holds h
        where h.payment_intent_id = coalesce(t.referral_payment_intent_id,t.representation_payment_intent_id)))
      as refund_or_dispute_history
  from paid_core i
  join public.ticket_submissions t on t.id = i.ticket_submission_id
  left join public.pro_discount_refunds p on p.ticket_submission_id = t.id
  where i.order_row = 1 and t.service_type = 'representation'
), current_prices as (
  select * from order_facts where booked_service_cents is not null
), revenue as (
  select count(*) as current_paid_service_orders,
    count(*) filter (where ticket_type = 'officer_issued') as current_paid_officer_orders,
    count(*) filter (where ticket_type = 'officer_issued' and pro_verified) as pro_verified_officer_orders,
    count(*) filter (where ticket_type = 'photo_radar') as current_paid_camera_orders,
    count(*) filter (where refund_or_dispute_history) as orders_needing_refund_reconciliation,
    count(*) filter (where refund_snapshot_conflict) as refund_snapshot_conflicts,
    coalesce(sum(booked_service_cents),0)::numeric / 100 as booked_service_after_upfront_discount_cad,
    coalesce(sum(known_pro_refund_cents),0)::numeric / 100 as recorded_pro_service_refunds_cad,
    coalesce(sum(booked_service_cents-known_pro_refund_cents),0)::numeric / 100
      as recorded_service_before_other_refunds_cad,
    round(avg(booked_service_cents-known_pro_refund_cents)::numeric / 100,2)
      as recorded_service_arpu_before_other_refunds_cad,
    case when count(*) filter (where refund_or_dispute_history or refund_snapshot_conflict) = 0
      then round(avg(booked_service_cents-known_pro_refund_cents)::numeric / 100,2)
      else null end as complete_net_service_arpu_cad
  from current_prices
), excluded as (
  select count(*) filter (where booked_service_cents is null) as legacy_or_unpriced_paid_orders,
    count(*) filter (where paid_intent_count <> 1) as orders_with_duplicate_paid_intents
  from order_facts
), camera_referrals as (
  select count(*) as camera_referred_orders,
    count(*) filter (where t.referral_fleet_account is true) as camera_fleet_excluded_orders,
    count(*) filter (where t.referral_fleet_account is null) as camera_account_review_outstanding,
    count(*) filter (where r.refund_review_required) as camera_paid_rewards_needing_review
  from public.referrals r
  join public.ticket_submissions t on t.id = r.order_id
  where r.ticket_type = 'camera'
)
select now() as report_generated_at,r.*,
  round(100.0 * r.pro_verified_officer_orders / nullif(r.current_paid_officer_orders,0),2)
    as officer_pro_verified_share_percent,
  r.pro_verified_officer_orders::numeric / nullif(r.current_paid_officer_orders,0) > 0.30
    as officer_share_exceeds_business_review_threshold,
  e.*,c.*
from revenue r cross join excluded e cross join camera_referrals c;
