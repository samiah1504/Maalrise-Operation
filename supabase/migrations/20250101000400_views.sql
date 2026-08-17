-- =============================================================================
-- Migration 0005 — Reporting views
-- The dashboard and every report read from these views. Nothing aggregates
-- financial data in the client.
--
-- Double-counting rules encoded here (brief §5):
--   * Cash at Hand      — cashbook balances only.
--   * Cash in Stock     — money spent on a batch that has NOT yet become
--                         inventory. Clears to zero once the batch is received.
--   * Inventory Value   — landed cost of goods physically held and unsold
--                         (available + reserved; reserved has no receivable yet).
--   * Receivables       — only after a Murabaha sale is approved, at which
--                         point the goods have already left inventory.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Cash
-- ---------------------------------------------------------------------------
create or replace view v_account_balances as
select
  ba.id                as bank_account_id,
  ba.name,
  ba.account_type,
  ba.bank_name,
  ba.account_number,
  ba.currency,
  ba.is_active,
  ba.opening_balance,
  coalesce(sum(case when ct.direction = 'inflow' then ct.amount else -ct.amount end), 0) as movement,
  ba.opening_balance
    + coalesce(sum(case when ct.direction = 'inflow' then ct.amount else -ct.amount end), 0) as balance
from bank_accounts ba
left join cash_transactions ct on ct.bank_account_id = ba.id
group by ba.id;

-- ---------------------------------------------------------------------------
-- Per-batch capital position — the basis for Cash in Stock
-- ---------------------------------------------------------------------------
create or replace view v_batch_position as
with paid as (
  select procurement_order_id, sum(amount_naira) as supplier_paid
  from supplier_payments group by 1
),
costs as (
  select procurement_order_id, sum(amount_naira) as direct_costs
  from shipment_costs group by 1
),
lots as (
  select
    procurement_order_id,
    sum(quantity_received * unit_landed_cost)                        as capitalised_value,
    sum((quantity_available + quantity_reserved) * unit_landed_cost) as on_hand_value,
    sum(quantity_sold * unit_landed_cost)                            as sold_value,
    sum((quantity_damaged + quantity_lost) * unit_landed_cost)       as written_off_value,
    min(received_date)                                               as first_receipt_date,
    max(received_date)                                               as last_receipt_date
  from inventory_lots group by 1
),
ordered as (
  select
    procurement_order_id,
    sum(quantity)          as quantity_ordered,
    sum(quantity_received) as quantity_received,
    sum(landed_cost_total) as landed_cost_total
  from procurement_items group by 1
)
select
  po.id                                        as procurement_order_id,
  po.batch_number,
  po.investment_cycle_id,
  po.supplier_id,
  po.status,
  po.procurement_date,
  po.total_cost_naira,
  coalesce(paid.supplier_paid, 0)              as supplier_paid,
  coalesce(costs.direct_costs, 0)              as direct_costs,
  coalesce(paid.supplier_paid, 0) + coalesce(costs.direct_costs, 0) as cash_deployed,
  greatest(po.total_cost_naira - coalesce(paid.supplier_paid, 0), 0) as supplier_balance,
  coalesce(ordered.quantity_ordered, 0)        as quantity_ordered,
  coalesce(ordered.quantity_received, 0)       as quantity_received,
  coalesce(ordered.landed_cost_total, 0)       as landed_cost_total,
  coalesce(lots.capitalised_value, 0)          as capitalised_value,
  coalesce(lots.on_hand_value, 0)              as on_hand_value,
  coalesce(lots.sold_value, 0)                 as sold_value,
  coalesce(lots.written_off_value, 0)          as written_off_value,
  lots.first_receipt_date,
  lots.last_receipt_date,
  -- Cash in Stock: what has been spent but has not yet become inventory.
  case
    when po.status in ('received', 'closed', 'cancelled') then 0
    else greatest(
      coalesce(paid.supplier_paid, 0) + coalesce(costs.direct_costs, 0)
        - coalesce(lots.capitalised_value, 0), 0)
  end                                          as cash_in_stock,
  -- Money committed to the batch that never became inventory: goods missing,
  -- damaged on arrival, or rejected, plus the sub-naira residual from rounding
  -- the unit landed cost. Recognised in the P&L once the batch is received so
  -- that assets and the cashbook stay in step to the kobo.
  case
    when po.status in ('received', 'closed')
      then po.total_cost_naira + coalesce(costs.direct_costs, 0) - coalesce(lots.capitalised_value, 0)
    else 0
  end                                          as cost_variance
from procurement_orders po
left join paid    on paid.procurement_order_id = po.id
left join costs   on costs.procurement_order_id = po.id
left join lots    on lots.procurement_order_id = po.id
left join ordered on ordered.procurement_order_id = po.id;

-- ---------------------------------------------------------------------------
-- Inventory valuation
-- ---------------------------------------------------------------------------
create or replace view v_inventory_valuation as
select
  il.id                      as inventory_lot_id,
  il.investment_cycle_id,
  il.product_id,
  p.name                     as product_name,
  p.product_code,
  p.category                 as product_category,
  il.procurement_order_id,
  po.batch_number,
  il.warehouse_id,
  w.name                     as warehouse_name,
  il.received_date,
  (current_date - il.received_date) as stock_age_days,
  il.quantity_received,
  il.quantity_available,
  il.quantity_reserved,
  il.quantity_sold,
  il.quantity_damaged,
  il.quantity_lost,
  il.unit_landed_cost,
  round((il.quantity_available + il.quantity_reserved) * il.unit_landed_cost, 2) as stock_value,
  round(il.quantity_available * il.unit_landed_cost, 2)                          as available_value
from inventory_lots il
join products p           on p.id = il.product_id
join procurement_orders po on po.id = il.procurement_order_id
left join warehouses w    on w.id = il.warehouse_id;

-- ---------------------------------------------------------------------------
-- Receivables (brief §16)
-- ---------------------------------------------------------------------------
create or replace view v_receivables as
select
  ms.id                  as murabaha_sale_id,
  ms.contract_number,
  ms.investment_cycle_id,
  ms.business_id,
  b.name                 as business_name,
  ms.procurement_order_id,
  ms.sale_date,
  ms.due_date,
  ms.total_cost,
  ms.markup_amount,
  ms.selling_price,
  ms.amount_paid,
  round(ms.selling_price - ms.amount_paid, 2) as outstanding,
  ms.status,
  (ms.due_date - current_date)                as days_until_due,
  greatest(current_date - ms.due_date, 0)     as days_overdue,
  case
    when ms.amount_paid >= ms.selling_price then 'paid'
    when ms.status in ('draft', 'awaiting_approval', 'cancelled') then 'not_due'
    when current_date > ms.due_date then 'overdue'
    when current_date = ms.due_date then 'due_today'
    when ms.amount_paid > 0 then 'partially_paid'
    when ms.due_date - current_date <= 7 then 'due_soon'
    else 'not_due'
  end::repayment_schedule_status as schedule_status
from murabaha_sales ms
join businesses b on b.id = ms.business_id;

-- ---------------------------------------------------------------------------
-- Financial position — the "where is every naira?" view (brief §5)
-- ---------------------------------------------------------------------------
create or replace view v_financial_position as
with cycles as (
  select id as investment_cycle_id from investment_cycles
),
cash as (
  select
    c.investment_cycle_id,
    coalesce((
      select sum(case when ct.direction = 'inflow' then ct.amount else -ct.amount end)
      from cash_transactions ct
      join bank_accounts ba on ba.id = ct.bank_account_id
      where ct.investment_cycle_id = c.investment_cycle_id and ba.is_active
    ), 0) as cash_at_hand
  from cycles c
),
stock as (
  select investment_cycle_id,
         sum(cash_in_stock)            as cash_in_stock,
         sum(supplier_balance)         as supplier_balance,
         sum(cash_deployed)            as cash_deployed,
         sum(cost_variance)            as cost_variance
  from v_batch_position group by 1
),
inventory as (
  select investment_cycle_id,
         sum(round((quantity_available + quantity_reserved) * unit_landed_cost, 2)) as inventory_value,
         sum(round((quantity_damaged + quantity_lost) * unit_landed_cost, 2))       as written_off_value
  from inventory_lots group by 1
),
receivables as (
  select investment_cycle_id, sum(outstanding) as outstanding_receivables
  from v_receivables
  where status in ('approved', 'goods_released', 'active', 'partially_paid', 'overdue')
  group by 1
),
sales as (
  select investment_cycle_id,
         sum(selling_price) as total_sales,
         sum(total_cost)    as total_cogs,
         sum(markup_amount) as gross_profit
  from murabaha_sales
  where status in ('approved', 'goods_released', 'active', 'partially_paid', 'fully_paid', 'overdue')
  group by 1
),
opex as (
  select e.investment_cycle_id, sum(e.amount) as operating_expenses
  from expenses e
  join expense_categories ec on ec.id = e.category_id
  where e.status in ('approved', 'paid') and not ec.is_direct_cost
  group by 1
),
capital as (
  select investment_cycle_id, sum(total_amount) as capital_introduced
  from investor_subscriptions where capital_recorded group by 1
),
others as (
  select investment_cycle_id, sum(value) as other_assets
  from other_assets where is_active group by 1
)
select
  c.investment_cycle_id,
  coalesce(cash.cash_at_hand, 0)                    as cash_at_hand,
  coalesce(stock.cash_in_stock, 0)                  as cash_in_stock,
  coalesce(inventory.inventory_value, 0)            as inventory_value,
  coalesce(receivables.outstanding_receivables, 0)  as outstanding_receivables,
  coalesce(others.other_assets, 0)                  as other_assets,
  coalesce(cash.cash_at_hand, 0)
    + coalesce(stock.cash_in_stock, 0)
    + coalesce(inventory.inventory_value, 0)
    + coalesce(receivables.outstanding_receivables, 0)
    + coalesce(others.other_assets, 0)              as total_business_assets,
  coalesce(stock.supplier_balance, 0)               as supplier_balance,
  coalesce(sales.total_sales, 0)                    as total_murabaha_sales,
  coalesce(sales.total_cogs, 0)                     as cost_of_goods_sold,
  coalesce(sales.gross_profit, 0)                   as gross_profit,
  coalesce(opex.operating_expenses, 0)
    + coalesce(inventory.written_off_value, 0)
    + coalesce(stock.cost_variance, 0)                as total_expenses,
  coalesce(sales.gross_profit, 0)
    - coalesce(opex.operating_expenses, 0)
    - coalesce(inventory.written_off_value, 0)
    - coalesce(stock.cost_variance, 0)                as net_profit,
  coalesce(capital.capital_introduced, 0)           as capital_introduced,
  coalesce(stock.cash_deployed, 0)                  as capital_deployed
from cycles c
left join cash        on cash.investment_cycle_id = c.investment_cycle_id
left join stock       on stock.investment_cycle_id = c.investment_cycle_id
left join inventory   on inventory.investment_cycle_id = c.investment_cycle_id
left join receivables on receivables.investment_cycle_id = c.investment_cycle_id
left join sales       on sales.investment_cycle_id = c.investment_cycle_id
left join opex        on opex.investment_cycle_id = c.investment_cycle_id
left join capital     on capital.investment_cycle_id = c.investment_cycle_id
left join others      on others.investment_cycle_id = c.investment_cycle_id;

-- ---------------------------------------------------------------------------
-- Monthly profit & loss (brief §20)
-- ---------------------------------------------------------------------------
create or replace view v_monthly_pl as
with months as (
  select
    ic.id as investment_cycle_id,
    generate_series(
      date_trunc('month', ic.start_date),
      date_trunc('month', least(ic.maturity_date, current_date + interval '1 month')),
      interval '1 month'
    )::date as period_start
  from investment_cycles ic
),
sales as (
  select investment_cycle_id, date_trunc('month', sale_date)::date as period_start,
         sum(selling_price) as revenue, sum(total_cost) as cogs, sum(markup_amount) as gross_profit
  from murabaha_sales
  where status in ('approved', 'goods_released', 'active', 'partially_paid', 'fully_paid', 'overdue')
  group by 1, 2
),
opex as (
  select e.investment_cycle_id, date_trunc('month', e.expense_date)::date as period_start,
         sum(e.amount) as operating_expenses
  from expenses e
  join expense_categories ec on ec.id = e.category_id
  where e.status in ('approved', 'paid') and not ec.is_direct_cost
  group by 1, 2
),
procurement as (
  select investment_cycle_id, date_trunc('month', procurement_date)::date as period_start,
         sum(total_cost_naira) as procurement_value, count(*) as procurement_count
  from procurement_orders where status <> 'cancelled'
  group by 1, 2
),
repay as (
  select investment_cycle_id, date_trunc('month', payment_date)::date as period_start,
         sum(case when status = 'reversed' and reverses_id is not null then -amount else amount end) as repayments
  from repayments
  group by 1, 2
),
receipts as (
  select investment_cycle_id, date_trunc('month', received_date)::date as period_start,
         sum(quantity_received * unit_landed_cost) as goods_received_value
  from inventory_lots group by 1, 2
)
select
  m.investment_cycle_id,
  m.period_start,
  extract(year from m.period_start)::int  as period_year,
  extract(month from m.period_start)::int as period_month,
  to_char(m.period_start, 'Mon YYYY')     as period_label,
  coalesce(sales.revenue, 0)               as revenue,
  coalesce(sales.cogs, 0)                  as cost_of_goods_sold,
  coalesce(sales.gross_profit, 0)          as gross_profit,
  coalesce(opex.operating_expenses, 0)     as operating_expenses,
  coalesce(sales.gross_profit, 0) - coalesce(opex.operating_expenses, 0) as net_profit,
  coalesce(procurement.procurement_value, 0) as procurement_value,
  coalesce(procurement.procurement_count, 0) as procurement_count,
  coalesce(repay.repayments, 0)              as repayments_received,
  coalesce(receipts.goods_received_value, 0) as goods_received_value
from months m
left join sales       on sales.investment_cycle_id = m.investment_cycle_id and sales.period_start = m.period_start
left join opex        on opex.investment_cycle_id = m.investment_cycle_id and opex.period_start = m.period_start
left join procurement on procurement.investment_cycle_id = m.investment_cycle_id and procurement.period_start = m.period_start
left join repay       on repay.investment_cycle_id = m.investment_cycle_id and repay.period_start = m.period_start
left join receipts    on receipts.investment_cycle_id = m.investment_cycle_id and receipts.period_start = m.period_start;

-- ---------------------------------------------------------------------------
-- Cycle summary (brief §6)
-- ---------------------------------------------------------------------------
create or replace view v_cycle_summary as
select
  ic.id as investment_cycle_id,
  ic.name,
  ic.code,
  ic.status,
  ic.start_date,
  ic.maturity_date,
  ic.duration_months,
  ic.target_capital,
  coalesce(sub.capital_received, 0)  as capital_received,
  coalesce(sub.investor_count, 0)    as investor_count,
  coalesce(sub.units_subscribed, 0)  as units_subscribed,
  greatest(least(
    (extract(year from age(current_date, ic.start_date)) * 12
     + extract(month from age(current_date, ic.start_date)))::int,
    ic.duration_months), 0)          as months_completed,
  greatest(ic.duration_months - greatest(least(
    (extract(year from age(current_date, ic.start_date)) * 12
     + extract(month from age(current_date, ic.start_date)))::int,
    ic.duration_months), 0), 0)      as months_remaining,
  fp.cash_at_hand,
  fp.cash_in_stock,
  fp.inventory_value,
  fp.outstanding_receivables,
  fp.other_assets,
  fp.total_business_assets,
  fp.total_murabaha_sales,
  fp.gross_profit,
  fp.total_expenses,
  fp.net_profit
from investment_cycles ic
left join (
  select investment_cycle_id,
         sum(total_amount) filter (where capital_recorded) as capital_received,
         count(distinct investor_id)                       as investor_count,
         sum(units)                                        as units_subscribed
  from investor_subscriptions group by 1
) sub on sub.investment_cycle_id = ic.id
left join v_financial_position fp on fp.investment_cycle_id = ic.id;

-- ---------------------------------------------------------------------------
-- Capital recycling tracker (brief §17)
-- ---------------------------------------------------------------------------
create or replace view v_batch_capital_cycle as
with sale as (
  select
    ms.procurement_order_id,
    min(ms.sale_date)      as sale_date,
    sum(ms.selling_price)  as sale_value,
    sum(ms.total_cost)     as sale_cost,
    sum(ms.markup_amount)  as gross_profit,
    sum(ms.amount_paid)    as amount_repaid
  from murabaha_sales ms
  where ms.status in ('approved', 'goods_released', 'active', 'partially_paid', 'fully_paid', 'overdue')
    and ms.procurement_order_id is not null
  group by 1
),
repaid as (
  select ms.procurement_order_id, max(r.payment_date) as last_repayment_date
  from repayment_allocations ra
  join repayments r        on r.id = ra.repayment_id and r.status <> 'reversed'
  join murabaha_sales ms   on ms.id = ra.murabaha_sale_id
  where ms.procurement_order_id is not null
  group by 1
),
direct as (
  select procurement_order_id, sum(amount_naira) as direct_expenses
  from shipment_costs group by 1
)
select
  bp.procurement_order_id,
  bp.batch_number,
  bp.investment_cycle_id,
  bp.supplier_id,
  s.name                                   as supplier_name,
  bp.status,
  bp.procurement_date,
  bp.first_receipt_date                    as arrival_date,
  sale.sale_date,
  repaid.last_repayment_date               as repayment_date,
  bp.cash_deployed,
  coalesce(direct.direct_expenses, 0)      as direct_expenses,
  coalesce(sale.sale_value, 0)             as murabaha_sale_value,
  coalesce(sale.gross_profit, 0)           as gross_profit,
  coalesce(sale.gross_profit, 0)           as net_profit,
  coalesce(sale.amount_repaid, 0)          as amount_repaid,
  case when bp.cash_deployed > 0
       then round(coalesce(sale.gross_profit, 0) / bp.cash_deployed * 100, 2)
       else 0 end                          as return_on_capital_pct,
  (repaid.last_repayment_date - bp.procurement_date)  as capital_cycle_days,
  (bp.first_receipt_date - bp.procurement_date)       as procurement_to_arrival_days,
  (sale.sale_date - bp.first_receipt_date)            as arrival_to_sale_days,
  (repaid.last_repayment_date - sale.sale_date)       as sale_to_repayment_days,
  coalesce(sale.amount_repaid, 0)          as amount_available_for_redeployment
from v_batch_position bp
left join suppliers s on s.id = bp.supplier_id
left join sale        on sale.procurement_order_id = bp.procurement_order_id
left join repaid      on repaid.procurement_order_id = bp.procurement_order_id
left join direct      on direct.procurement_order_id = bp.procurement_order_id;

-- ---------------------------------------------------------------------------
-- Supplier performance & product profitability
-- ---------------------------------------------------------------------------
create or replace view v_supplier_performance as
select
  s.id as supplier_id,
  s.name,
  s.country,
  s.status,
  s.rating,
  count(distinct po.id)                              as batch_count,
  coalesce(sum(po.total_cost_naira), 0)              as total_purchase_value,
  coalesce(avg(bcc.procurement_to_arrival_days), 0)::numeric(10, 1) as avg_days_to_arrival,
  coalesce(avg(bcc.capital_cycle_days), 0)::numeric(10, 1)          as avg_capital_cycle_days,
  coalesce(sum(bcc.gross_profit), 0)                 as total_gross_profit,
  case when coalesce(sum(bcc.cash_deployed), 0) > 0
       then round(sum(bcc.gross_profit) / sum(bcc.cash_deployed) * 100, 2)
       else 0 end                                    as return_on_capital_pct
from suppliers s
left join procurement_orders po on po.supplier_id = s.id and po.status <> 'cancelled'
left join v_batch_capital_cycle bcc on bcc.procurement_order_id = po.id
group by s.id;

create or replace view v_product_profitability as
select
  p.id as product_id,
  p.product_code,
  p.name,
  p.category,
  p.supplier_id,
  coalesce(sum(msi.quantity), 0)            as quantity_sold,
  coalesce(sum(msi.total_cost), 0)          as total_cost,
  coalesce(sum(msi.total_selling_price), 0) as total_revenue,
  coalesce(sum(msi.total_selling_price - msi.total_cost), 0) as gross_profit,
  case when coalesce(sum(msi.total_cost), 0) > 0
       then round(sum(msi.total_selling_price - msi.total_cost) / sum(msi.total_cost) * 100, 2)
       else 0 end                           as margin_pct
from products p
left join murabaha_sale_items msi on msi.product_id = p.id
left join murabaha_sales ms on ms.id = msi.murabaha_sale_id
  and ms.status in ('approved', 'goods_released', 'active', 'partially_paid', 'fully_paid', 'overdue')
group by p.id;

-- ---------------------------------------------------------------------------
-- Procurement pipeline counters for the dashboard (brief §4)
-- ---------------------------------------------------------------------------
create or replace view v_procurement_pipeline as
select
  po.investment_cycle_id,
  count(*) filter (where po.status in ('draft', 'awaiting_approval', 'approved'))             as new_orders,
  count(*) filter (where po.status = 'in_production')                                          as in_production,
  count(*) filter (where po.status in ('production_completed', 'ready_for_shipment'))          as ready_for_shipment,
  count(*) filter (where po.status in ('shipped', 'in_transit'))                               as in_transit,
  count(*) filter (where po.status = 'at_port')                                                as at_port,
  count(*) filter (where po.status = 'clearing')                                               as awaiting_clearing,
  count(*) filter (where po.status in ('received', 'partially_received', 'closed'))            as received,
  count(*) filter (
    where po.expected_arrival_date < current_date
      and po.status not in ('received', 'closed', 'cancelled')
  )                                                                                            as delayed
from procurement_orders po
group by po.investment_cycle_id;
