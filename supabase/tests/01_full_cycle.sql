-- =============================================================================
-- End-to-end acceptance test (TASKS phase 8)
--   buy → pay supplier → costs → receive → sell → repay
-- Asserts that Total Business Assets = capital + gross profit − expenses with
-- no double counting, and that the reconciliation report shows zero difference.
-- Run with:  psql -v ON_ERROR_STOP=1 -f supabase/tests/01_full_cycle.sql
-- =============================================================================

\set QUIET on
\set ceo        '11111111-1111-4111-8111-111111111111'
\set operations '22222222-2222-4222-8222-222222222222'
\set accounts   '33333333-3333-4333-8333-333333333333'
\set auditor    '44444444-4444-4444-8444-444444444444'
\set cycle      '55555555-5555-4555-8555-555555555555'
\set warehouse  '66666666-6666-4666-8666-666666666666'
\set ngn        '77777777-7777-4777-8777-777777777777'
\set business   '88888888-8888-4888-8888-888888888888'
\set supplier   '99999999-9999-4999-8999-999999999991'

begin;

create temporary table t_ids (k text primary key, v uuid);

-- --- Operations creates the procurement batch -------------------------------
set local role postgres;
select set_config('request.jwt.claim.sub', :'operations', true);

insert into procurement_orders (
  investment_cycle_id, supplier_id, procurement_date, currency, exchange_rate,
  payment_due_date, expected_arrival_date, allocation_method, status, created_by
) values (
  :'cycle', :'supplier', current_date - 60, 'USD', 1600,
  current_date - 55, current_date - 20, 'value', 'awaiting_approval', :'operations'
);

insert into t_ids values ('po', (select id from procurement_orders order by created_at desc limit 1));

insert into procurement_items (procurement_order_id, product_id, quantity, unit_price_foreign)
select (select v from t_ids where k = 'po'), p.id, q.qty, q.price
from (values ('MR-P-0001', 20, 210.00), ('MR-P-0002', 40, 62.00)) as q(code, qty, price)
join products p on p.product_code = q.code;

-- 20 × 210 + 40 × 62 = 6,680 USD @ 1600 = ₦10,688,000
do $$
declare v_total numeric;
begin
  select total_cost_naira into v_total from procurement_orders
   where id = (select v from t_ids where k = 'po');
  assert v_total = 10688000.00, format('Expected order total 10688000, got %s', v_total);
end;
$$;

-- --- CEO approves (maker ≠ checker) -----------------------------------------
select set_config('request.jwt.claim.sub', :'ceo', true);
select approve_procurement((select v from t_ids where k = 'po'), 'Supplier quote verified');

-- --- Accounts pays the supplier in full -------------------------------------
select set_config('request.jwt.claim.sub', :'accounts', true);
select record_supplier_payment(
  (select v from t_ids where k = 'po'), 6680.00, 1600, :'ngn',
  (current_date - 58)::date, 'SWIFT/2026/0001', 'Full payment', 'Proforma settled');

do $$
declare v_status procurement_status; v_paid numeric;
begin
  select status, amount_paid_naira into v_status, v_paid
  from procurement_orders where id = (select v from t_ids where k = 'po');
  assert v_status = 'fully_paid', format('Expected fully_paid, got %s', v_status);
  assert v_paid = 10688000.00, format('Expected paid 10688000, got %s', v_paid);
end;
$$;

-- Cash at Hand fell and Cash in Stock rose by exactly the same amount.
do $$
declare v_cash numeric; v_stock numeric;
begin
  select cash_at_hand, cash_in_stock into v_cash, v_stock
  from v_financial_position where investment_cycle_id = '55555555-5555-4555-8555-555555555555';
  assert v_cash = 10000000.00 - 10688000.00, format('Cash at hand wrong: %s', v_cash);
  assert v_stock = 10688000.00, format('Cash in stock wrong: %s', v_stock);
end;
$$;

-- --- Shipment and direct procurement costs ----------------------------------
select set_config('request.jwt.claim.sub', :'operations', true);

insert into shipments (
  procurement_order_id, investment_cycle_id, method, shipping_company,
  container_number, bill_of_lading_number, port_of_departure, port_of_arrival,
  shipment_date, expected_arrival_date, actual_arrival_date, status, created_by
) values (
  (select v from t_ids where k = 'po'), :'cycle', 'sea_freight', 'COSCO',
  'CSNU1234567', 'BL-2026-0001', 'Nansha, Guangzhou', 'Apapa, Lagos',
  current_date - 45, current_date - 20, current_date - 22, 'delivered_to_warehouse', :'operations'
);
insert into t_ids values ('shp', (select id from shipments order by created_at desc limit 1));

select record_procurement_cost(
  (select v from t_ids where k = 'po'), c.kind::procurement_cost_type, c.amt,
  (current_date - 30)::date, c.label, (select v from t_ids where k = 'shp'),
  :'ngn', null, 'Batch cost')
from (values
  ('international_shipping', 1850000.00, 'Sea freight — 1 x 40ft container'),
  ('customs',                 980000.00, 'Customs duty'),
  ('clearing',                420000.00, 'Clearing agent'),
  ('port_charges',            265000.00, 'Terminal handling'),
  ('local_transport',         185000.00, 'Apapa to warehouse')
) as c(kind, amt, label);

-- Allocation must reconcile to the kobo for every method.
do $$
declare
  m allocation_method;
  v_costs numeric;
  v_alloc numeric;
begin
  select coalesce(sum(amount_naira), 0) into v_costs
  from shipment_costs where procurement_order_id = (select v from t_ids where k = 'po');

  foreach m in array array['quantity', 'weight', 'volume', 'value', 'manual']::allocation_method[]
  loop
    if m = 'manual' then
      update procurement_items set manual_allocation = quantity * 3
       where procurement_order_id = (select v from t_ids where k = 'po');
    end if;

    update procurement_orders set allocation_method = m
     where id = (select v from t_ids where k = 'po');
    perform allocate_procurement_costs((select v from t_ids where k = 'po'));

    select coalesce(sum(allocated_cost_naira), 0) into v_alloc
    from procurement_items where procurement_order_id = (select v from t_ids where k = 'po');

    assert v_alloc = v_costs,
      format('Allocation by %s totalled %s but costs are %s', m, v_alloc, v_costs);
  end loop;

  update procurement_orders set allocation_method = 'value'
   where id = (select v from t_ids where k = 'po');
  perform allocate_procurement_costs((select v from t_ids where k = 'po'));
end;
$$;

-- --- Accounts finalises landed cost -----------------------------------------
select set_config('request.jwt.claim.sub', :'accounts', true);
select finalise_landed_cost((select v from t_ids where k = 'po'), 'All batch costs received');

-- --- Goods receipt ----------------------------------------------------------
select set_config('request.jwt.claim.sub', :'operations', true);

insert into goods_receipts (
  procurement_order_id, investment_cycle_id, warehouse_id, received_date,
  receiving_officer, status, created_by
) values (
  (select v from t_ids where k = 'po'), :'cycle', :'warehouse', current_date - 18,
  :'operations', 'pending_inspection', :'operations'
);
insert into t_ids values ('grn', (select id from goods_receipts order by created_at desc limit 1));

insert into goods_receipt_items (
  goods_receipt_id, procurement_item_id, product_id, expected_quantity, quantity_received
)
select (select v from t_ids where k = 'grn'), pi.id, pi.product_id, pi.quantity, pi.quantity
from procurement_items pi
where pi.procurement_order_id = (select v from t_ids where k = 'po');

select confirm_goods_receipt((select v from t_ids where k = 'grn'), 'Inspected, all in good order');

-- After a full receipt: Cash in Stock is zero and Inventory Value equals the
-- landed cost of the sellable quantity.
do $$
declare v_stock numeric; v_inventory numeric; v_landed numeric;
begin
  select cash_in_stock, inventory_value into v_stock, v_inventory
  from v_financial_position where investment_cycle_id = '55555555-5555-4555-8555-555555555555';

  select coalesce(sum(landed_cost_total), 0) into v_landed
  from procurement_items where procurement_order_id = (select v from t_ids where k = 'po');

  assert v_stock = 0, format('Cash in stock should be 0 after full receipt, got %s', v_stock);
  assert v_inventory = v_landed,
    format('Inventory value %s should equal landed cost %s', v_inventory, v_landed);
end;
$$;

-- --- Murabaha sale ----------------------------------------------------------
select create_murabaha_sale(
  :'business', :'cycle', (current_date - 15)::date, 0.15, 45,
  (select jsonb_agg(jsonb_build_object('inventory_lot_id', id, 'quantity', quantity_available))
   from inventory_lots where procurement_order_id = (select v from t_ids where k = 'po')),
  'Full batch sold to MaalGrow', 'Batch ready for sale');

insert into t_ids values ('sale', (select id from murabaha_sales order by created_at desc limit 1));

select set_config('request.jwt.claim.sub', :'ceo', true);
select approve_murabaha_sale((select v from t_ids where k = 'sale'), 'Contract signed');

-- The approved price is fixed and cannot be increased.
do $$
declare v_failed boolean := false;
begin
  begin
    update murabaha_sales set selling_price = selling_price * 1.1
     where id = (select v from t_ids where k = 'sale');
  exception when others then
    v_failed := true;
  end;
  assert v_failed, 'A frozen Murabaha price must not be changeable';
end;
$$;

-- Inventory has left the books; a receivable exists in its place.
do $$
declare v_inventory numeric; v_receivable numeric; v_price numeric;
begin
  select inventory_value, outstanding_receivables into v_inventory, v_receivable
  from v_financial_position where investment_cycle_id = '55555555-5555-4555-8555-555555555555';
  select selling_price into v_price from murabaha_sales
   where id = (select v from t_ids where k = 'sale');

  assert v_inventory = 0, format('Inventory should be 0 after sale, got %s', v_inventory);
  assert v_receivable = v_price,
    format('Receivable %s should equal selling price %s', v_receivable, v_price);
end;
$$;

-- --- An operating expense ---------------------------------------------------
select set_config('request.jwt.claim.sub', :'accounts', true);

insert into expenses (category_id, investment_cycle_id, expense_date, amount, description, is_general_admin, status, created_by)
select ec.id, :'cycle', current_date - 10, 350000.00, 'Warehouse rent', true, 'awaiting_approval', :'accounts'
from expense_categories ec where ec.code = 'office_expenses';
insert into t_ids values ('exp', (select id from expenses order by created_at desc limit 1));

select set_config('request.jwt.claim.sub', :'ceo', true);
select approve_expense((select v from t_ids where k = 'exp'), 'Within budget');
select pay_expense((select v from t_ids where k = 'exp'), :'ngn', 'TRF/RENT/0426', 'Paid');

-- --- Repayment (partial, then the balance) ----------------------------------
select set_config('request.jwt.claim.sub', :'accounts', true);

select record_repayment(
  :'business', 5000000.00, :'ngn', (current_date - 5)::date,
  jsonb_build_array(jsonb_build_object(
    'murabaha_sale_id', (select v from t_ids where k = 'sale'), 'amount', 5000000.00)),
  'bank_transfer', 'TRF/MG/0001', 'First instalment', 'Part payment received');

do $$
declare v_status murabaha_status; v_out numeric;
begin
  select status into v_status from murabaha_sales where id = (select v from t_ids where k = 'sale');
  select outstanding into v_out from v_receivables
   where murabaha_sale_id = (select v from t_ids where k = 'sale');
  assert v_status = 'partially_paid', format('Expected partially_paid, got %s', v_status);
  assert v_out > 0, 'There should still be an outstanding balance';
end;
$$;

select record_repayment(
  :'business',
  (select selling_price - amount_paid from murabaha_sales where id = (select v from t_ids where k = 'sale')),
  :'ngn', (current_date - 1)::date,
  jsonb_build_array(jsonb_build_object(
    'murabaha_sale_id', (select v from t_ids where k = 'sale'),
    'amount', (select selling_price - amount_paid from murabaha_sales where id = (select v from t_ids where k = 'sale')))),
  'bank_transfer', 'TRF/MG/0002', 'Final instalment', 'Balance settled');

do $$
declare v_status murabaha_status;
begin
  select status into v_status from murabaha_sales where id = (select v from t_ids where k = 'sale');
  assert v_status = 'fully_paid', format('Expected fully_paid, got %s', v_status);
end;
$$;

-- =============================================================================
-- The reconciliation that matters (brief §29.9, §29.10)
-- =============================================================================
do $$
declare
  p record;
  v_expected numeric;
  v_diff record;
begin
  select * into p from v_financial_position
   where investment_cycle_id = '55555555-5555-4555-8555-555555555555';

  -- Capital introduced + gross profit − expenses, with nothing counted twice.
  v_expected := p.capital_introduced + p.gross_profit - p.total_expenses;

  assert p.total_business_assets = v_expected,
    format('Total assets %s should equal capital %s + gross profit %s − expenses %s = %s',
           p.total_business_assets, p.capital_introduced, p.gross_profit,
           p.total_expenses, v_expected);

  -- Everything is back in cash: the capital has completed one full recycle.
  assert p.cash_in_stock = 0, format('Cash in stock should be 0, got %s', p.cash_in_stock);
  assert p.inventory_value = 0, format('Inventory should be 0, got %s', p.inventory_value);
  assert p.outstanding_receivables = 0, format('Receivables should be 0, got %s', p.outstanding_receivables);
  assert p.cash_at_hand = v_expected, format('All assets should be cash, got %s', p.cash_at_hand);

  for v_diff in
    select * from reconciliation_check('55555555-5555-4555-8555-555555555555')
  loop
    assert v_diff.difference = 0,
      format('Reconciliation line "%s" differs by %s', v_diff.line, v_diff.difference);
  end loop;
end;
$$;

-- Capital recycling tracker reports the full journey.
do $$
declare c record;
begin
  select * into c from v_batch_capital_cycle
   where procurement_order_id = (select v from t_ids where k = 'po');

  assert c.capital_cycle_days is not null, 'Capital cycle days should be computed';
  assert c.capital_cycle_days = 59, format('Expected 59 cycle days, got %s', c.capital_cycle_days);
  assert c.return_on_capital_pct > 0, 'Return on capital should be positive';
  assert c.amount_repaid = c.murabaha_sale_value, 'The batch should be fully repaid';
end;
$$;

-- The auditor may read but never write.
do $$
declare v_blocked boolean := false;
begin
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
  begin
    perform approve_expense((select v from t_ids where k = 'exp'), 'Auditor attempt');
  exception when others then
    v_blocked := true;
  end;
  assert v_blocked, 'The auditor must not be able to approve anything';
end;
$$;

\echo '--- Cycle position after one full recycle ---'
\set QUIET off
select cash_at_hand, cash_in_stock, inventory_value, outstanding_receivables,
       total_business_assets, gross_profit, total_expenses, net_profit
from v_financial_position where investment_cycle_id = :'cycle';

select line, difference from reconciliation_check(:'cycle');

rollback;
