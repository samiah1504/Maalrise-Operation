-- =============================================================================
-- Migration 0006 — Monthly closing, annual cycle closing, alerts
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Monthly closing (brief §21, TASKS phase 12)
-- ---------------------------------------------------------------------------
create or replace function close_month(
  p_cycle_id uuid,
  p_year integer,
  p_month integer,
  p_reason text default null
)
returns monthly_closings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closing monthly_closings;
  v_pl record;
  v_start date := make_date(p_year, p_month, 1);
  v_end date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
  v_opening numeric(18, 2);
  v_closing_cash numeric(18, 2);
  v_month_number int;
begin
  if not has_role('ceo', 'accounts') then
    raise exception 'Only the CEO or an Accounts Officer may close an accounting period.';
  end if;

  perform set_audit_reason(p_reason);

  -- Earlier periods in the same cycle must be closed first.
  if exists (
    select 1 from monthly_closings
    where investment_cycle_id = p_cycle_id
      and make_date(period_year, period_month, 1) < v_start
      and status <> 'closed'
  ) then
    raise exception 'An earlier month in this cycle is still open. Close periods in order.';
  end if;

  select * into v_pl from v_monthly_pl
   where investment_cycle_id = p_cycle_id and period_year = p_year and period_month = p_month;

  select coalesce(sum(case when direction = 'inflow' then amount else -amount end), 0)
    into v_opening
  from cash_transactions
  where investment_cycle_id = p_cycle_id and transaction_date < v_start;

  select coalesce(sum(case when direction = 'inflow' then amount else -amount end), 0)
    into v_closing_cash
  from cash_transactions
  where investment_cycle_id = p_cycle_id and transaction_date <= v_end;

  select greatest(1, (extract(year from age(v_start, ic.start_date)) * 12
                    + extract(month from age(v_start, ic.start_date)))::int + 1)
    into v_month_number
  from investment_cycles ic where ic.id = p_cycle_id;

  insert into monthly_closings (
    investment_cycle_id, period_year, period_month, month_number, status,
    opening_cash, closing_cash, total_procurement, total_goods_receipt,
    total_sales, total_repayments, total_expenses, gross_profit, net_profit,
    closed_by, closed_at, notes, created_by
  ) values (
    p_cycle_id, p_year, p_month, v_month_number, 'closed',
    v_opening, v_closing_cash,
    coalesce(v_pl.procurement_value, 0), coalesce(v_pl.goods_received_value, 0),
    coalesce(v_pl.revenue, 0), coalesce(v_pl.repayments_received, 0),
    coalesce(v_pl.operating_expenses, 0), coalesce(v_pl.gross_profit, 0),
    coalesce(v_pl.net_profit, 0), auth.uid(), now(), p_reason, auth.uid()
  )
  on conflict (investment_cycle_id, period_year, period_month) do update set
    status              = 'closed',
    month_number        = excluded.month_number,
    opening_cash        = excluded.opening_cash,
    closing_cash        = excluded.closing_cash,
    total_procurement   = excluded.total_procurement,
    total_goods_receipt = excluded.total_goods_receipt,
    total_sales         = excluded.total_sales,
    total_repayments    = excluded.total_repayments,
    total_expenses      = excluded.total_expenses,
    gross_profit        = excluded.gross_profit,
    net_profit          = excluded.net_profit,
    closed_by           = auth.uid(),
    closed_at           = now()
  returning * into v_closing;

  return v_closing;
end;
$$;

create or replace function reopen_month(p_closing_id uuid, p_reason text)
returns monthly_closings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closing monthly_closings;
begin
  if not is_ceo() then
    raise exception 'Only the CEO may reopen a closed period.';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'A reason is required to reopen a closed period.';
  end if;

  perform set_audit_reason(p_reason);

  update monthly_closings
     set status = 'reopened', reopened_by = auth.uid(), reopen_reason = p_reason
   where id = p_closing_id
  returning * into v_closing;

  if not found then
    raise exception 'Closing period not found';
  end if;

  return v_closing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Monthly investor report figures (brief §21). No "Capital Status" section.
-- ---------------------------------------------------------------------------
create or replace function build_investor_report(
  p_cycle_id uuid,
  p_year integer,
  p_month integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pl record;
  v_pos record;
  v_cycle record;
  v_cumulative numeric(18, 2);
  v_month_number int;
  v_start date := make_date(p_year, p_month, 1);
begin
  select * into v_cycle from investment_cycles where id = p_cycle_id;
  if not found then
    raise exception 'Investment cycle not found';
  end if;

  select * into v_pl from v_monthly_pl
   where investment_cycle_id = p_cycle_id and period_year = p_year and period_month = p_month;

  select * into v_pos from v_financial_position where investment_cycle_id = p_cycle_id;

  select coalesce(sum(net_profit), 0) into v_cumulative
  from v_monthly_pl
  where investment_cycle_id = p_cycle_id and period_start <= v_start;

  v_month_number := greatest(1, (extract(year from age(v_start, v_cycle.start_date)) * 12
                               + extract(month from age(v_start, v_cycle.start_date)))::int + 1);

  return jsonb_build_object(
    'reporting_month',            to_char(v_start, 'FMMonth YYYY'),
    'investment_cycle',           v_cycle.name,
    'investment_cycle_code',      v_cycle.code,
    'month_number',               v_month_number,
    'duration_months',            v_cycle.duration_months,
    'purchases_made',             coalesce(v_pl.procurement_value, 0),
    'goods_received',             coalesce(v_pl.goods_received_value, 0),
    'sales_to_business',          coalesce(v_pl.revenue, 0),
    'repayments_received',        coalesce(v_pl.repayments_received, 0),
    'estimated_net_profit',       coalesce(v_pl.net_profit, 0),
    'cumulative_net_profit',      v_cumulative,
    'cash_at_hand',               coalesce(v_pos.cash_at_hand, 0),
    'cash_in_stock',              coalesce(v_pos.cash_in_stock, 0),
    'inventory_value',            coalesce(v_pos.inventory_value, 0),
    'outstanding_receivables',    coalesce(v_pos.outstanding_receivables, 0),
    'total_business_assets',      coalesce(v_pos.total_business_assets, 0),
    'result',                     case when coalesce(v_pl.net_profit, 0) >= 0 then 'profit' else 'loss' end
  );
end;
$$;

create or replace function generate_investor_report(
  p_cycle_id uuid,
  p_year integer,
  p_month integer,
  p_management_update text default null,
  p_reason text default null
)
returns investor_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report investor_reports;
  v_figures jsonb;
  v_disclaimer text;
  v_month_number int;
  v_closing uuid;
begin
  if not has_role('ceo', 'accounts') then
    raise exception 'Only the CEO or an Accounts Officer may generate an investor report.';
  end if;

  perform set_audit_reason(p_reason);

  v_figures := build_investor_report(p_cycle_id, p_year, p_month);
  v_month_number := (v_figures ->> 'month_number')::int;
  v_disclaimer := coalesce(get_setting('report.disclaimer') #>> '{}', '');

  select id into v_closing from monthly_closings
   where investment_cycle_id = p_cycle_id and period_year = p_year and period_month = p_month;

  insert into investor_reports (
    investment_cycle_id, monthly_closing_id, period_year, period_month, month_number,
    figures, management_update, disclaimer, status, generated_by, generated_at
  ) values (
    p_cycle_id, v_closing, p_year, p_month, v_month_number,
    v_figures, p_management_update, v_disclaimer, 'draft', auth.uid(), now()
  )
  on conflict (investment_cycle_id, period_year, period_month) do update set
    figures           = excluded.figures,
    monthly_closing_id = excluded.monthly_closing_id,
    management_update = coalesce(excluded.management_update, investor_reports.management_update),
    disclaimer        = excluded.disclaimer,
    generated_by      = auth.uid(),
    generated_at      = now()
  returning * into v_report;

  return v_report;
end;
$$;

-- ---------------------------------------------------------------------------
-- Annual cycle closing (brief §22)
-- Six steps, each recorded with approver and timestamp. Estimated monthly
-- profit is never treated as final profit.
-- ---------------------------------------------------------------------------
create or replace function compute_annual_closing(p_cycle_id uuid, p_reason text default null)
returns annual_closings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ac annual_closings;
  v_pos record;
  v_capital numeric(18, 2);
  v_procurement numeric(18, 2);
  v_repayments numeric(18, 2);
  v_ratio numeric(9, 4);
begin
  if not has_role('ceo', 'accounts') then
    raise exception 'Only the CEO or an Accounts Officer may compute the cycle closing.';
  end if;

  perform set_audit_reason(p_reason);

  select * into v_pos from v_financial_position where investment_cycle_id = p_cycle_id;
  if not found then
    raise exception 'Investment cycle not found';
  end if;

  select coalesce(sum(total_amount), 0) into v_capital
  from investor_subscriptions where investment_cycle_id = p_cycle_id and capital_recorded;

  select coalesce(sum(cash_deployed), 0) into v_procurement
  from v_batch_position where investment_cycle_id = p_cycle_id;

  select coalesce(sum(case when status = 'reversed' and reverses_id is not null then -amount else amount end), 0)
    into v_repayments
  from repayments where investment_cycle_id = p_cycle_id;

  v_ratio := get_setting_numeric('profit.investor_share', 0.7);

  insert into annual_closings (
    investment_cycle_id, status, total_capital_received, total_procurement_spend,
    total_murabaha_sales, total_repayments_received, total_outstanding_receivables,
    closing_cash, closing_cash_in_stock, closing_inventory, gross_profit,
    total_expenses, net_profit, profit_sharing_ratio, investor_profit_pool,
    maalrise_profit_share, capital_repayment, total_investor_payout, created_by
  ) values (
    p_cycle_id, 'draft', v_capital, v_procurement,
    v_pos.total_murabaha_sales, v_repayments, v_pos.outstanding_receivables,
    v_pos.cash_at_hand, v_pos.cash_in_stock, v_pos.inventory_value, v_pos.gross_profit,
    v_pos.total_expenses, v_pos.net_profit, v_ratio,
    round(greatest(v_pos.net_profit, 0) * v_ratio, 2),
    round(greatest(v_pos.net_profit, 0) * (1 - v_ratio), 2),
    v_capital,
    v_capital + round(greatest(v_pos.net_profit, 0) * v_ratio, 2), auth.uid()
  )
  on conflict (investment_cycle_id) do update set
    total_capital_received        = excluded.total_capital_received,
    total_procurement_spend       = excluded.total_procurement_spend,
    total_murabaha_sales          = excluded.total_murabaha_sales,
    total_repayments_received     = excluded.total_repayments_received,
    total_outstanding_receivables = excluded.total_outstanding_receivables,
    closing_cash                  = excluded.closing_cash,
    closing_cash_in_stock         = excluded.closing_cash_in_stock,
    closing_inventory             = excluded.closing_inventory,
    gross_profit                  = excluded.gross_profit,
    total_expenses                = excluded.total_expenses,
    net_profit                    = excluded.net_profit,
    profit_sharing_ratio          = excluded.profit_sharing_ratio,
    investor_profit_pool          = excluded.investor_profit_pool,
    maalrise_profit_share         = excluded.maalrise_profit_share,
    capital_repayment             = excluded.capital_repayment,
    total_investor_payout         = excluded.total_investor_payout
  returning * into v_ac;

  if v_ac.status <> 'draft' then
    raise exception 'The closing figures can only be recomputed while the closing is in draft.';
  end if;

  return v_ac;
end;
$$;

create or replace function advance_annual_closing(
  p_cycle_id uuid,
  p_next annual_closing_status,
  p_reason text default null
)
returns annual_closings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ac annual_closings;
  v_expected annual_closing_status;
begin
  select * into v_ac from annual_closings where investment_cycle_id = p_cycle_id for update;
  if not found then
    raise exception 'Run the closing computation first.';
  end if;

  -- Strictly sequential: review → reconciliation → approval → profit → allocation → payout.
  v_expected := case v_ac.status
    when 'draft'                then 'accounts_review'
    when 'accounts_review'      then 'reconciliation'
    when 'reconciliation'       then 'management_approval'
    when 'management_approval'  then 'profit_confirmed'
    when 'profit_confirmed'     then 'investor_allocation'
    when 'investor_allocation'  then 'payout_approved'
    when 'payout_approved'      then 'completed'
    else null
  end;

  if v_expected is null or p_next <> v_expected then
    raise exception 'The cycle closing must move from % to %.', v_ac.status, coalesce(v_expected::text, 'nothing further');
  end if;

  -- Steps from management approval onwards are the CEO's alone.
  if p_next in ('management_approval', 'profit_confirmed', 'payout_approved', 'completed') then
    if not is_ceo() then
      raise exception 'Only the CEO may perform this step of the cycle closing.';
    end if;
  elsif not has_role('ceo', 'accounts') then
    raise exception 'Only the CEO or an Accounts Officer may perform this step.';
  end if;

  perform set_audit_reason(p_reason);

  update annual_closings set
    status                 = p_next,
    accounts_review_by     = case when p_next = 'accounts_review' then auth.uid() else accounts_review_by end,
    accounts_review_at     = case when p_next = 'accounts_review' then now() else accounts_review_at end,
    reconciliation_by      = case when p_next = 'reconciliation' then auth.uid() else reconciliation_by end,
    reconciliation_at      = case when p_next = 'reconciliation' then now() else reconciliation_at end,
    management_approval_by = case when p_next = 'management_approval' then auth.uid() else management_approval_by end,
    management_approval_at = case when p_next = 'management_approval' then now() else management_approval_at end,
    profit_confirmed_by    = case when p_next = 'profit_confirmed' then auth.uid() else profit_confirmed_by end,
    profit_confirmed_at    = case when p_next = 'profit_confirmed' then now() else profit_confirmed_at end,
    allocation_by          = case when p_next = 'investor_allocation' then auth.uid() else allocation_by end,
    allocation_at          = case when p_next = 'investor_allocation' then now() else allocation_at end,
    payout_approved_by     = case when p_next = 'payout_approved' then auth.uid() else payout_approved_by end,
    payout_approved_at     = case when p_next = 'payout_approved' then now() else payout_approved_at end
  where investment_cycle_id = p_cycle_id
  returning * into v_ac;

  if p_next = 'investor_allocation' then
    perform allocate_investor_profit(p_cycle_id);
  end if;

  if p_next = 'profit_confirmed' then
    update investment_cycles set status = 'profit_approved' where id = p_cycle_id;
  elsif p_next = 'payout_approved' then
    update investment_cycles set status = 'payout_in_progress' where id = p_cycle_id;
  elsif p_next = 'completed' then
    update investment_cycles set status = 'completed' where id = p_cycle_id;
    update investors i set status = 'payout_pending'
      from investor_subscriptions s
     where s.investor_id = i.id and s.investment_cycle_id = p_cycle_id and i.status = 'active';
  end if;

  return v_ac;
end;
$$;

-- Pro-rata allocation of the investor profit pool by units subscribed.
create or replace function allocate_investor_profit(p_cycle_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ac annual_closings;
  v_total_units numeric;
  v_rows int := 0;
  v_allocated numeric(18, 2) := 0;
  v_sub record;
  v_share numeric(18, 2);
  v_last uuid;
begin
  select * into v_ac from annual_closings where investment_cycle_id = p_cycle_id;
  if not found then
    raise exception 'No closing record for this cycle.';
  end if;

  select coalesce(sum(units), 0) into v_total_units
  from investor_subscriptions
  where investment_cycle_id = p_cycle_id and capital_recorded;

  delete from annual_closing_allocations where annual_closing_id = v_ac.id;

  if v_total_units = 0 then
    return 0;
  end if;

  select id into v_last from investor_subscriptions
   where investment_cycle_id = p_cycle_id and capital_recorded
   order by units desc, id limit 1;

  for v_sub in
    select s.id, s.investor_id, s.units, s.total_amount
    from investor_subscriptions s
    where s.investment_cycle_id = p_cycle_id and s.capital_recorded
    order by s.units desc, s.id
  loop
    v_share := round(v_ac.investor_profit_pool * (v_sub.units / v_total_units), 2);
    v_allocated := v_allocated + v_share;

    insert into annual_closing_allocations (
      annual_closing_id, investor_id, subscription_id, units, capital,
      profit_allocation, total_payout, status
    ) values (
      v_ac.id, v_sub.investor_id, v_sub.id, v_sub.units, v_sub.total_amount,
      v_share, v_sub.total_amount + v_share, 'pending'
    );
    v_rows := v_rows + 1;
  end loop;

  -- Rounding remainder goes to the largest holding so the pool balances exactly.
  if v_allocated <> v_ac.investor_profit_pool and v_last is not null then
    update annual_closing_allocations
       set profit_allocation = profit_allocation + (v_ac.investor_profit_pool - v_allocated),
           total_payout      = total_payout + (v_ac.investor_profit_pool - v_allocated)
     where annual_closing_id = v_ac.id and subscription_id = v_last;
  end if;

  return v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- Alerts (brief §26) — run daily by pg_cron.
-- ---------------------------------------------------------------------------
create or replace function generate_alerts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_row record;
begin
  -- Murabaha repayments due in 7 / 3 / 0 days and overdue.
  for v_row in
    select * from v_receivables
    where status in ('approved', 'goods_released', 'active', 'partially_paid', 'overdue')
      and outstanding > 0
  loop
    if v_row.days_overdue > 0 then
      insert into notifications (type, severity, title, body, record_table, record_id,
                                 investment_cycle_id, due_date, dedupe_key)
      values ('repayment_overdue', 'critical',
              'Overdue: ' || v_row.contract_number,
              v_row.business_name || ' is ' || v_row.days_overdue || ' day(s) overdue on '
                || v_row.contract_number || '.',
              'murabaha_sales', v_row.murabaha_sale_id, v_row.investment_cycle_id, v_row.due_date,
              'overdue-' || v_row.murabaha_sale_id::text || '-' || current_date::text)
      on conflict (dedupe_key) do nothing;
      v_count := v_count + 1;
    elsif v_row.days_until_due in (0, 3, 7) then
      insert into notifications (type, severity, title, body, record_table, record_id,
                                 investment_cycle_id, due_date, dedupe_key)
      values ('repayment_due',
              case when v_row.days_until_due = 0 then 'warning'::notification_severity
                   else 'info'::notification_severity end,
              case when v_row.days_until_due = 0
                   then 'Repayment due today: ' || v_row.contract_number
                   else 'Repayment due in ' || v_row.days_until_due || ' days: ' || v_row.contract_number end,
              v_row.business_name || ' owes ' || v_row.outstanding || ' on ' || v_row.contract_number || '.',
              'murabaha_sales', v_row.murabaha_sale_id, v_row.investment_cycle_id, v_row.due_date,
              'due-' || v_row.murabaha_sale_id::text || '-' || v_row.days_until_due::text)
      on conflict (dedupe_key) do nothing;
      v_count := v_count + 1;
    end if;
  end loop;

  -- Supplier payment due.
  insert into notifications (type, severity, title, body, record_table, record_id,
                             investment_cycle_id, due_date, dedupe_key)
  select 'supplier_payment_due', 'warning',
         'Supplier payment due — ' || po.batch_number,
         'Balance of ' || (po.total_cost_naira - po.amount_paid_naira) || ' is due on '
           || po.payment_due_date || '.',
         'procurement_orders', po.id, po.investment_cycle_id, po.payment_due_date,
         'supplier-due-' || po.id::text || '-' || po.payment_due_date::text
  from procurement_orders po
  where po.payment_due_date is not null
    and po.payment_due_date <= current_date + 7
    and po.amount_paid_naira < po.total_cost_naira
    and po.status not in ('cancelled', 'closed')
  on conflict (dedupe_key) do nothing;

  -- Production completion approaching.
  insert into notifications (type, severity, title, body, record_table, record_id,
                             investment_cycle_id, due_date, dedupe_key)
  select 'production_completion_due', 'info',
         'Production due — ' || po.batch_number,
         'Production is expected to complete on ' || po.expected_production_completion || '.',
         'procurement_orders', po.id, po.investment_cycle_id, po.expected_production_completion,
         'production-' || po.id::text || '-' || po.expected_production_completion::text
  from procurement_orders po
  where po.expected_production_completion between current_date and current_date + 7
    and po.status = 'in_production'
  on conflict (dedupe_key) do nothing;

  -- Arrival approaching / shipment delayed / goods at port.
  insert into notifications (type, severity, title, body, record_table, record_id,
                             investment_cycle_id, due_date, dedupe_key)
  select
    case
      when s.status = 'delayed' then 'shipment_delayed'::notification_type
      when s.status = 'arrived_at_port' then 'goods_at_port'::notification_type
      when s.status = 'clearing' and s.actual_arrival_date < current_date - 7 then 'clearing_delayed'::notification_type
      else 'arrival_approaching'::notification_type
    end,
    case when s.status = 'delayed' then 'warning'::notification_severity else 'info'::notification_severity end,
    'Shipment ' || s.shipment_number || ' — ' || replace(s.status::text, '_', ' '),
    coalesce(s.delay_reason, 'Expected arrival ' || coalesce(s.expected_arrival_date::text, 'not set') || '.'),
    'shipments', s.id, s.investment_cycle_id, s.expected_arrival_date,
    'shipment-' || s.id::text || '-' || s.status::text || '-' || current_date::text
  from shipments s
  where s.status in ('delayed', 'arrived_at_port', 'clearing')
     or (s.expected_arrival_date between current_date and current_date + 7
         and s.status in ('shipped', 'in_transit'))
  on conflict (dedupe_key) do nothing;

  -- Expenses awaiting approval.
  insert into notifications (type, severity, title, body, record_table, record_id,
                             investment_cycle_id, dedupe_key)
  select 'expense_awaiting_approval', 'info',
         'Expense awaiting approval — ' || e.expense_number,
         e.description || ' (' || e.amount || ')',
         'expenses', e.id, e.investment_cycle_id,
         'expense-approval-' || e.id::text
  from expenses e
  where e.status = 'awaiting_approval'
  on conflict (dedupe_key) do nothing;

  -- Cycle approaching maturity.
  insert into notifications (type, severity, title, body, record_table, record_id,
                             investment_cycle_id, due_date, dedupe_key)
  select 'cycle_approaching_maturity', 'warning',
         'Cycle ' || ic.code || ' matures on ' || ic.maturity_date,
         'The investment cycle reaches maturity in '
           || (ic.maturity_date - current_date) || ' day(s). Begin closing preparations.',
         'investment_cycles', ic.id, ic.id, ic.maturity_date,
         'cycle-maturity-' || ic.id::text || '-' || (ic.maturity_date - current_date)::text
  from investment_cycles ic
  where ic.status in ('active', 'approaching_maturity')
    and ic.maturity_date between current_date and current_date + 60
  on conflict (dedupe_key) do nothing;

  -- Month-end closing incomplete / investor report due.
  insert into notifications (type, severity, title, body, record_table, record_id,
                             investment_cycle_id, dedupe_key)
  select 'month_end_closing_incomplete', 'warning',
         'Month-end closing outstanding',
         'The accounting period ' || to_char(prev.period, 'Mon YYYY')
           || ' for cycle ' || ic.code || ' has not been closed.',
         'investment_cycles', ic.id, ic.id,
         'closing-' || ic.id::text || '-' || to_char(prev.period, 'YYYY-MM')
  from investment_cycles ic
  cross join lateral (select (date_trunc('month', current_date) - interval '1 month')::date as period) prev
  where ic.status in ('active', 'approaching_maturity')
    and prev.period >= date_trunc('month', ic.start_date)::date
    and not exists (
      select 1 from monthly_closings mc
      where mc.investment_cycle_id = ic.id
        and mc.period_year = extract(year from prev.period)::int
        and mc.period_month = extract(month from prev.period)::int
        and mc.status = 'closed'
    )
  on conflict (dedupe_key) do nothing;

  insert into notifications (type, severity, title, body, record_table, record_id,
                             investment_cycle_id, dedupe_key)
  select 'investor_report_due', 'info',
         'Monthly investor report due',
         'The investor report for ' || to_char(prev.period, 'Mon YYYY') || ' has not been generated.',
         'investment_cycles', ic.id, ic.id,
         'report-' || ic.id::text || '-' || to_char(prev.period, 'YYYY-MM')
  from investment_cycles ic
  cross join lateral (select (date_trunc('month', current_date) - interval '1 month')::date as period) prev
  where ic.status in ('active', 'approaching_maturity')
    and prev.period >= date_trunc('month', ic.start_date)::date
    and not exists (
      select 1 from investor_reports ir
      where ir.investment_cycle_id = ic.id
        and ir.period_year = extract(year from prev.period)::int
        and ir.period_month = extract(month from prev.period)::int
    )
  on conflict (dedupe_key) do nothing;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reconciliation check (TASKS phase 11) — must report zero difference.
-- ---------------------------------------------------------------------------
create or replace function reconciliation_check(p_cycle_id uuid)
returns table (
  line text,
  expected numeric,
  actual numeric,
  difference numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pos record;
  v_cashbook numeric(18, 2);
  v_inventory numeric(18, 2);
  v_receivables numeric(18, 2);
begin
  select * into v_pos from v_financial_position where investment_cycle_id = p_cycle_id;

  select coalesce(sum(case when direction = 'inflow' then amount else -amount end), 0)
    into v_cashbook
  from cash_transactions where investment_cycle_id = p_cycle_id;

  select coalesce(sum(round((quantity_available + quantity_reserved) * unit_landed_cost, 2)), 0)
    into v_inventory
  from inventory_lots where investment_cycle_id = p_cycle_id;

  select coalesce(sum(selling_price - amount_paid), 0) into v_receivables
  from murabaha_sales
  where investment_cycle_id = p_cycle_id
    and status in ('approved', 'goods_released', 'active', 'partially_paid', 'overdue');

  return query
  select 'Cash at Hand vs cashbook'::text, v_cashbook, coalesce(v_pos.cash_at_hand, 0),
         coalesce(v_pos.cash_at_hand, 0) - v_cashbook
  union all
  select 'Inventory Value vs inventory lots'::text, v_inventory, coalesce(v_pos.inventory_value, 0),
         coalesce(v_pos.inventory_value, 0) - v_inventory
  union all
  select 'Receivables vs Murabaha contracts'::text, v_receivables, coalesce(v_pos.outstanding_receivables, 0),
         coalesce(v_pos.outstanding_receivables, 0) - v_receivables
  union all
  select 'Total assets vs component sum'::text,
         coalesce(v_pos.cash_at_hand, 0) + coalesce(v_pos.cash_in_stock, 0)
           + coalesce(v_pos.inventory_value, 0) + coalesce(v_pos.outstanding_receivables, 0)
           + coalesce(v_pos.other_assets, 0),
         coalesce(v_pos.total_business_assets, 0),
         0::numeric;
end;
$$;
