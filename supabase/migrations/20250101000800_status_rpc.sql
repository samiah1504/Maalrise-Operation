-- =============================================================================
-- Migration 0009 — Status transitions and notification helpers
--
-- A status change and its audit reason must happen in ONE transaction: the
-- reason is carried in a transaction-local GUC that the audit trigger reads,
-- so setting it in a separate round trip would lose it.
-- =============================================================================

create or replace function change_record_status(
  p_table text,
  p_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed constant text[] := array[
    'procurement_orders', 'shipments', 'goods_receipts', 'investment_cycles',
    'suppliers', 'businesses', 'investors', 'products', 'murabaha_sales'
  ];
  v_current text;
begin
  if not (p_table = any(v_allowed)) then
    raise exception 'Status changes are not permitted on %', p_table;
  end if;

  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'A reason is required; it is written to the audit trail.';
  end if;

  -- The cycle is the CEO's to steer; everything else is open to operating staff.
  if p_table = 'investment_cycles' then
    if not is_ceo() then
      raise exception 'Only the CEO may change the status of an investment cycle.';
    end if;
  elsif not can_write() then
    raise exception 'You do not have permission to change this record.';
  end if;

  perform set_audit_reason(p_reason);

  execute format('select status::text from %I where id = $1', p_table)
    into v_current using p_id;

  if v_current is null then
    raise exception 'Record not found';
  end if;

  -- An approved Murabaha contract is settled by repayments, not by hand.
  if p_table = 'murabaha_sales' and p_status in ('fully_paid', 'partially_paid') then
    raise exception 'Payment status is set by recording a repayment, not by editing the contract.';
  end if;

  -- A completed cycle is closed for good.
  if p_table = 'investment_cycles' and v_current = 'completed' then
    raise exception 'This cycle is completed and can no longer be changed.';
  end if;

  execute format('update %I set status = $1::%s where id = $2',
                 p_table,
                 case p_table
                   when 'procurement_orders' then 'procurement_status'
                   when 'shipments'          then 'shipment_status'
                   when 'goods_receipts'     then 'goods_receipt_status'
                   when 'investment_cycles'  then 'cycle_status'
                   when 'suppliers'          then 'supplier_status'
                   when 'businesses'         then 'business_status'
                   when 'investors'          then 'investor_status'
                   when 'products'           then 'product_status'
                   when 'murabaha_sales'     then 'murabaha_status'
                 end)
  using p_status, p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create or replace function mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update notifications
     set is_read = true, read_at = now()
   where is_read = false
     and (p_ids is null or id = any(p_ids));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Daily jobs. Scheduled with pg_cron where the extension is available; the
-- app also exposes them through /api/cron for platforms without it.
-- ---------------------------------------------------------------------------
create or replace function run_daily_jobs()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alerts int;
  v_overdue int;
begin
  v_overdue := flag_overdue_sales();
  v_alerts := generate_alerts();

  -- Cycles within 60 days of maturity are flagged for the closing process.
  update investment_cycles
     set status = 'approaching_maturity'
   where status = 'active'
     and maturity_date <= current_date + 60;

  update investment_cycles
     set status = 'matured'
   where status in ('active', 'approaching_maturity')
     and maturity_date <= current_date;

  return jsonb_build_object('alerts_created', v_alerts, 'sales_flagged_overdue', v_overdue);
end;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('maalrise-daily-jobs', '0 6 * * *', 'select run_daily_jobs()');
  end if;
exception when others then
  raise notice 'pg_cron not scheduled: %. Use the /api/cron route instead.', sqlerrm;
end;
$$;
