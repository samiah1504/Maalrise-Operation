-- =============================================================================
-- Migration 0002 — Core tables
-- Money is numeric(18,2) everywhere. Quantities are numeric(18,3).
-- Every financial row carries investment_cycle_id so cycles never mix.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Identity & configuration
-- ---------------------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  email       text not null,
  phone       text,
  job_title   text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles (id) on delete cascade,
  role       user_role not null,
  granted_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create index on user_roles (user_id);

-- Typed key/value settings. Nothing configurable is hardcoded in the app.
create table system_settings (
  key         text primary key,
  value       jsonb not null,
  value_type  text not null check (value_type in ('string', 'number', 'boolean', 'json')),
  label       text not null,
  category    text not null,
  description text,
  updated_by  uuid references profiles (id),
  updated_at  timestamptz not null default now()
);

-- Per-year document sequences backing next_document_number().
create table document_sequences (
  prefix      text not null,
  year        integer not null,
  last_number integer not null default 0,
  primary key (prefix, year)
);

-- ---------------------------------------------------------------------------
-- Investment cycles (brief §6)
-- ---------------------------------------------------------------------------
create table investment_cycles (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  code            text not null unique,
  start_date      date not null,
  maturity_date   date not null,
  duration_months integer not null default 12 check (duration_months > 0),
  target_capital  numeric(18, 2) not null default 0 check (target_capital >= 0),
  status          cycle_status not null default 'draft',
  notes           text,
  created_by      uuid references profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (maturity_date > start_date)
);

-- ---------------------------------------------------------------------------
-- Investors (brief §7) — internal records only, investors never log in.
-- ---------------------------------------------------------------------------
create table investors (
  id            uuid primary key default gen_random_uuid(),
  investor_code text not null unique,
  full_name     text not null,
  phone         text,
  email         text,
  address       text,
  category      investor_category not null default 'new_investor',
  status        investor_status not null default 'pending_confirmation',
  notes         text,
  created_by    uuid references profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table investor_subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  investor_id         uuid not null references investors (id) on delete restrict,
  investment_cycle_id uuid not null references investment_cycles (id) on delete restrict,
  units               integer not null check (units > 0),
  unit_price          numeric(18, 2) not null check (unit_price > 0),
  total_amount        numeric(18, 2) not null check (total_amount > 0),
  payment_date        date,
  payment_reference   text,
  status              investor_status not null default 'pending_confirmation',
  capital_recorded    boolean not null default false,
  notes               text,
  created_by          uuid references profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index on investor_subscriptions (investment_cycle_id);
create index on investor_subscriptions (investor_id);

-- ---------------------------------------------------------------------------
-- Suppliers & products (brief §8, §9)
-- ---------------------------------------------------------------------------
create table suppliers (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  contact_person      text,
  country             text not null default 'China',
  address             text,
  phone               text,
  email               text,
  wechat              text,
  whatsapp            text,
  bank_details        text,
  currency            text not null default 'USD',
  products_supplied   text,
  rating              numeric(2, 1) check (rating between 0 and 5),
  avg_production_days integer check (avg_production_days >= 0),
  avg_delivery_days   integer check (avg_delivery_days >= 0),
  status              supplier_status not null default 'active',
  notes               text,
  created_by          uuid references profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table products (
  id                     uuid primary key default gen_random_uuid(),
  product_code           text not null unique,
  name                   text not null,
  category               product_category not null default 'other',
  description            text,
  image_url              text,
  supplier_id            uuid references suppliers (id) on delete set null,
  model                  text,
  colour_options         text,
  dimensions             text,
  packaging_details      text,
  unit_of_measure        text not null default 'unit',
  weight_kg              numeric(18, 3) check (weight_kg >= 0),
  volume_cbm             numeric(18, 4) check (volume_cbm >= 0),
  purchase_currency      text not null default 'USD',
  purchase_cost          numeric(18, 2) not null default 0 check (purchase_cost >= 0),
  est_shipping_cost      numeric(18, 2) not null default 0 check (est_shipping_cost >= 0),
  est_landed_cost        numeric(18, 2) not null default 0 check (est_landed_cost >= 0),
  expected_selling_price numeric(18, 2) not null default 0 check (expected_selling_price >= 0),
  status                 product_status not null default 'active',
  notes                  text,
  created_by             uuid references profiles (id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index on products (supplier_id);

create table warehouses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  location   text,
  address    text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Bank accounts & cashbook (brief §18)
-- ---------------------------------------------------------------------------
create table bank_accounts (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  account_type    bank_account_type not null default 'bank',
  bank_name       text,
  account_number  text,
  currency        text not null default 'NGN',
  opening_balance numeric(18, 2) not null default 0,
  is_active       boolean not null default true,
  notes           text,
  created_by      uuid references profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Single source of truth for every naira that moves.
create table cash_transactions (
  id                   uuid primary key default gen_random_uuid(),
  bank_account_id      uuid not null references bank_accounts (id) on delete restrict,
  investment_cycle_id  uuid references investment_cycles (id) on delete restrict,
  transaction_date     date not null default current_date,
  direction            cash_direction not null,
  amount               numeric(18, 2) not null check (amount > 0),
  category             cash_category not null,
  description          text,
  reference_table      text,
  reference_id         uuid,
  procurement_order_id uuid,
  murabaha_sale_id     uuid,
  payment_reference    text,
  is_reversal          boolean not null default false,
  reverses_id          uuid references cash_transactions (id),
  created_by           uuid references profiles (id),
  approved_by          uuid references profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index on cash_transactions (bank_account_id);
create index on cash_transactions (investment_cycle_id);
create index on cash_transactions (transaction_date);
create index on cash_transactions (reference_table, reference_id);

-- ---------------------------------------------------------------------------
-- Procurement (brief §10, §11)
-- ---------------------------------------------------------------------------
create table procurement_orders (
  id                             uuid primary key default gen_random_uuid(),
  batch_number                   text not null unique,
  investment_cycle_id            uuid not null references investment_cycles (id) on delete restrict,
  supplier_id                    uuid not null references suppliers (id) on delete restrict,
  procurement_date               date not null default current_date,
  currency                       text not null default 'USD',
  exchange_rate                  numeric(18, 6) not null default 1 check (exchange_rate > 0),
  total_cost_foreign             numeric(18, 2) not null default 0 check (total_cost_foreign >= 0),
  total_cost_naira               numeric(18, 2) not null default 0 check (total_cost_naira >= 0),
  amount_paid_naira              numeric(18, 2) not null default 0 check (amount_paid_naira >= 0),
  payment_due_date               date,
  production_start_date          date,
  expected_production_completion date,
  expected_shipment_date         date,
  expected_arrival_date          date,
  allocation_method              allocation_method not null default 'value',
  allocated_costs_naira          numeric(18, 2) not null default 0 check (allocated_costs_naira >= 0),
  landed_cost_finalised          boolean not null default false,
  landed_cost_finalised_at       timestamptz,
  landed_cost_finalised_by       uuid references profiles (id),
  status                         procurement_status not null default 'draft',
  approved_by                    uuid references profiles (id),
  approved_at                    timestamptz,
  cancelled_reason               text,
  notes                          text,
  created_by                     uuid references profiles (id),
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now()
);

create index on procurement_orders (investment_cycle_id);
create index on procurement_orders (supplier_id);
create index on procurement_orders (status);

create table procurement_items (
  id                   uuid primary key default gen_random_uuid(),
  procurement_order_id uuid not null references procurement_orders (id) on delete cascade,
  product_id           uuid not null references products (id) on delete restrict,
  quantity             numeric(18, 3) not null check (quantity > 0),
  unit_price_foreign   numeric(18, 2) not null check (unit_price_foreign >= 0),
  line_total_foreign   numeric(18, 2) not null default 0,
  line_total_naira     numeric(18, 2) not null default 0,
  quantity_received    numeric(18, 3) not null default 0 check (quantity_received >= 0),
  -- Landed-cost outputs, written by allocate_procurement_costs()
  allocated_cost_naira numeric(18, 2) not null default 0,
  landed_cost_total    numeric(18, 2) not null default 0,
  landed_cost_per_unit numeric(18, 2) not null default 0,
  manual_allocation    numeric(18, 2),
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index on procurement_items (procurement_order_id);
create index on procurement_items (product_id);

create table supplier_payments (
  id                   uuid primary key default gen_random_uuid(),
  procurement_order_id uuid not null references procurement_orders (id) on delete restrict,
  investment_cycle_id  uuid not null references investment_cycles (id) on delete restrict,
  payment_date         date not null default current_date,
  currency             text not null default 'USD',
  amount_foreign       numeric(18, 2) not null check (amount_foreign > 0),
  exchange_rate        numeric(18, 6) not null check (exchange_rate > 0),
  amount_naira         numeric(18, 2) not null check (amount_naira > 0),
  bank_account_id      uuid not null references bank_accounts (id) on delete restrict,
  payment_reference    text,
  cash_transaction_id  uuid references cash_transactions (id),
  notes                text,
  created_by           uuid references profiles (id),
  approved_by          uuid references profiles (id),
  approved_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index on supplier_payments (procurement_order_id);

-- ---------------------------------------------------------------------------
-- Shipments (brief §12)
-- ---------------------------------------------------------------------------
create table shipments (
  id                    uuid primary key default gen_random_uuid(),
  shipment_number       text not null unique,
  procurement_order_id  uuid not null references procurement_orders (id) on delete restrict,
  investment_cycle_id   uuid not null references investment_cycles (id) on delete restrict,
  method                shipping_method not null default 'sea_freight',
  shipping_company      text,
  freight_forwarder     text,
  container_number      text,
  bill_of_lading_number text,
  tracking_number       text,
  port_of_departure     text,
  port_of_arrival       text,
  shipment_date         date,
  expected_arrival_date date,
  actual_arrival_date   date,
  clearing_agent        text,
  clearing_status       text,
  delay_reason          text,
  status                shipment_status not null default 'awaiting_shipment',
  notes                 text,
  created_by            uuid references profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index on shipments (procurement_order_id);
create index on shipments (container_number);

-- Direct procurement cost lines. These are capitalised into landed cost and are
-- therefore NOT operating expenses — see docs/DECISIONS.md.
create table shipment_costs (
  id                   uuid primary key default gen_random_uuid(),
  procurement_order_id uuid not null references procurement_orders (id) on delete cascade,
  shipment_id          uuid references shipments (id) on delete set null,
  investment_cycle_id  uuid not null references investment_cycles (id) on delete restrict,
  cost_type            procurement_cost_type not null,
  description          text,
  currency             text not null default 'NGN',
  exchange_rate        numeric(18, 6) not null default 1 check (exchange_rate > 0),
  amount_foreign       numeric(18, 2),
  amount_naira         numeric(18, 2) not null check (amount_naira >= 0),
  incurred_date        date not null default current_date,
  bank_account_id      uuid references bank_accounts (id),
  cash_transaction_id  uuid references cash_transactions (id),
  payment_reference    text,
  created_by           uuid references profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index on shipment_costs (procurement_order_id);

-- ---------------------------------------------------------------------------
-- Goods receipt & inventory (brief §13)
-- ---------------------------------------------------------------------------
create table goods_receipts (
  id                   uuid primary key default gen_random_uuid(),
  grn_number           text not null unique,
  procurement_order_id uuid not null references procurement_orders (id) on delete restrict,
  investment_cycle_id  uuid not null references investment_cycles (id) on delete restrict,
  warehouse_id         uuid not null references warehouses (id) on delete restrict,
  received_date        date not null default current_date,
  receiving_officer    uuid references profiles (id),
  inspection_notes     text,
  status               goods_receipt_status not null default 'pending_inspection',
  confirmed_at         timestamptz,
  confirmed_by         uuid references profiles (id),
  notes                text,
  created_by           uuid references profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index on goods_receipts (procurement_order_id);

create table goods_receipt_items (
  id                  uuid primary key default gen_random_uuid(),
  goods_receipt_id    uuid not null references goods_receipts (id) on delete cascade,
  procurement_item_id uuid not null references procurement_items (id) on delete restrict,
  product_id          uuid not null references products (id) on delete restrict,
  expected_quantity   numeric(18, 3) not null default 0 check (expected_quantity >= 0),
  quantity_received   numeric(18, 3) not null default 0 check (quantity_received >= 0),
  missing_quantity    numeric(18, 3) not null default 0 check (missing_quantity >= 0),
  damaged_quantity    numeric(18, 3) not null default 0 check (damaged_quantity >= 0),
  rejected_quantity   numeric(18, 3) not null default 0 check (rejected_quantity >= 0),
  sellable_quantity   numeric(18, 3) not null default 0 check (sellable_quantity >= 0),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index on goods_receipt_items (goods_receipt_id);

create table inventory_lots (
  id                   uuid primary key default gen_random_uuid(),
  product_id           uuid not null references products (id) on delete restrict,
  procurement_order_id uuid not null references procurement_orders (id) on delete restrict,
  goods_receipt_id     uuid not null references goods_receipts (id) on delete restrict,
  warehouse_id         uuid not null references warehouses (id) on delete restrict,
  investment_cycle_id  uuid not null references investment_cycles (id) on delete restrict,
  received_date        date not null default current_date,
  quantity_received    numeric(18, 3) not null check (quantity_received >= 0),
  quantity_available   numeric(18, 3) not null default 0 check (quantity_available >= 0),
  quantity_reserved    numeric(18, 3) not null default 0 check (quantity_reserved >= 0),
  quantity_sold        numeric(18, 3) not null default 0 check (quantity_sold >= 0),
  quantity_damaged     numeric(18, 3) not null default 0 check (quantity_damaged >= 0),
  quantity_lost        numeric(18, 3) not null default 0 check (quantity_lost >= 0),
  unit_landed_cost     numeric(18, 2) not null check (unit_landed_cost >= 0),
  created_by           uuid references profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index on inventory_lots (product_id);
create index on inventory_lots (procurement_order_id);
create index on inventory_lots (investment_cycle_id);

create table inventory_movements (
  id               uuid primary key default gen_random_uuid(),
  inventory_lot_id uuid not null references inventory_lots (id) on delete restrict,
  movement_type    inventory_movement_type not null,
  quantity         numeric(18, 3) not null,
  unit_cost        numeric(18, 2) not null default 0,
  total_value      numeric(18, 2) not null default 0,
  reference_table  text,
  reference_id     uuid,
  reason           text,
  created_by       uuid references profiles (id),
  created_at       timestamptz not null default now()
);

create index on inventory_movements (inventory_lot_id);

-- ---------------------------------------------------------------------------
-- Businesses & Murabaha sales (brief §14, §15)
-- ---------------------------------------------------------------------------
create table businesses (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  contact_person          text,
  phone                   text,
  email                   text,
  address                 text,
  registration_details    text,
  credit_limit            numeric(18, 2) not null default 0 check (credit_limit >= 0),
  standard_repayment_days integer not null default 45 check (standard_repayment_days > 0),
  status                  business_status not null default 'active',
  notes                   text,
  created_by              uuid references profiles (id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table murabaha_sales (
  id                    uuid primary key default gen_random_uuid(),
  contract_number       text not null unique,
  business_id           uuid not null references businesses (id) on delete restrict,
  investment_cycle_id   uuid not null references investment_cycles (id) on delete restrict,
  procurement_order_id  uuid references procurement_orders (id) on delete set null,
  sale_date             date not null default current_date,
  total_cost            numeric(18, 2) not null default 0 check (total_cost >= 0),
  markup_rate           numeric(9, 4) not null default 0 check (markup_rate >= 0),
  markup_amount         numeric(18, 2) not null default 0 check (markup_amount >= 0),
  selling_price         numeric(18, 2) not null default 0 check (selling_price >= 0),
  repayment_period_days integer not null default 45 check (repayment_period_days > 0),
  due_date              date,
  amount_paid           numeric(18, 2) not null default 0 check (amount_paid >= 0),
  price_frozen          boolean not null default false,
  status                murabaha_status not null default 'draft',
  approved_by           uuid references profiles (id),
  approved_at           timestamptz,
  cancelled_reason      text,
  notes                 text,
  created_by            uuid references profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (amount_paid <= selling_price)
);

create index on murabaha_sales (business_id);
create index on murabaha_sales (investment_cycle_id);
create index on murabaha_sales (status);
create index on murabaha_sales (due_date);

create table murabaha_sale_items (
  id                  uuid primary key default gen_random_uuid(),
  murabaha_sale_id    uuid not null references murabaha_sales (id) on delete cascade,
  inventory_lot_id    uuid not null references inventory_lots (id) on delete restrict,
  product_id          uuid not null references products (id) on delete restrict,
  quantity            numeric(18, 3) not null check (quantity > 0),
  unit_cost           numeric(18, 2) not null check (unit_cost >= 0),
  total_cost          numeric(18, 2) not null default 0,
  unit_selling_price  numeric(18, 2) not null default 0,
  total_selling_price numeric(18, 2) not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index on murabaha_sale_items (murabaha_sale_id);

-- ---------------------------------------------------------------------------
-- Repayments (brief §16)
-- ---------------------------------------------------------------------------
create table repayments (
  id                  uuid primary key default gen_random_uuid(),
  receipt_number      text not null unique,
  business_id         uuid not null references businesses (id) on delete restrict,
  investment_cycle_id uuid not null references investment_cycles (id) on delete restrict,
  payment_date        date not null default current_date,
  amount              numeric(18, 2) not null check (amount > 0),
  method              text,
  bank_account_id     uuid not null references bank_accounts (id) on delete restrict,
  payment_reference   text,
  cash_transaction_id uuid references cash_transactions (id),
  status              repayment_record_status not null default 'recorded',
  reverses_id         uuid references repayments (id),
  reversal_reason     text,
  notes               text,
  recorded_by         uuid references profiles (id),
  approved_by         uuid references profiles (id),
  approved_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index on repayments (business_id);
create index on repayments (payment_date);

create table repayment_allocations (
  id               uuid primary key default gen_random_uuid(),
  repayment_id     uuid not null references repayments (id) on delete cascade,
  murabaha_sale_id uuid not null references murabaha_sales (id) on delete restrict,
  amount           numeric(18, 2) not null check (amount <> 0),
  created_at       timestamptz not null default now()
);

create index on repayment_allocations (repayment_id);
create index on repayment_allocations (murabaha_sale_id);

-- ---------------------------------------------------------------------------
-- Expenses (brief §19)
-- ---------------------------------------------------------------------------
create table expense_categories (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  code           text not null unique,
  -- Direct costs are capitalised into landed cost and excluded from the P&L
  -- operating-expense block to prevent double counting.
  is_direct_cost boolean not null default false,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table expenses (
  id                   uuid primary key default gen_random_uuid(),
  expense_number       text not null unique,
  category_id          uuid not null references expense_categories (id) on delete restrict,
  investment_cycle_id  uuid references investment_cycles (id) on delete restrict,
  expense_date         date not null default current_date,
  amount               numeric(18, 2) not null check (amount > 0),
  description          text not null,
  procurement_order_id uuid references procurement_orders (id) on delete set null,
  shipment_id          uuid references shipments (id) on delete set null,
  product_id           uuid references products (id) on delete set null,
  murabaha_sale_id     uuid references murabaha_sales (id) on delete set null,
  is_general_admin     boolean not null default false,
  bank_account_id      uuid references bank_accounts (id),
  payment_reference    text,
  cash_transaction_id  uuid references cash_transactions (id),
  status               expense_status not null default 'draft',
  approved_by          uuid references profiles (id),
  approved_at          timestamptz,
  rejected_reason      text,
  notes                text,
  created_by           uuid references profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index on expenses (investment_cycle_id);
create index on expenses (category_id);
create index on expenses (expense_date);

-- Other approved assets, so Total Business Assets can be complete (brief §5).
create table other_assets (
  id                  uuid primary key default gen_random_uuid(),
  investment_cycle_id uuid not null references investment_cycles (id) on delete restrict,
  name                text not null,
  description         text,
  value               numeric(18, 2) not null default 0 check (value >= 0),
  as_of_date          date not null default current_date,
  is_active           boolean not null default true,
  created_by          uuid references profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Documents, approvals, notifications, audit (brief §23–§26)
-- ---------------------------------------------------------------------------
create table documents (
  id                  uuid primary key default gen_random_uuid(),
  doc_type            document_type not null default 'other',
  title               text not null,
  file_path           text not null,
  file_size           bigint,
  mime_type           text,
  record_table        text,
  record_id           uuid,
  investment_cycle_id uuid references investment_cycles (id) on delete set null,
  notes               text,
  uploaded_by         uuid references profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index on documents (record_table, record_id);

create table approvals (
  id            uuid primary key default gen_random_uuid(),
  approval_type approval_type not null,
  record_table  text not null,
  record_id     uuid not null,
  title         text not null,
  amount        numeric(18, 2),
  requested_by  uuid references profiles (id),
  requested_at  timestamptz not null default now(),
  status        approval_status not null default 'pending',
  approver_id   uuid references profiles (id),
  decided_at    timestamptz,
  reason        text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Maker may never be the checker (brief §24).
  constraint approvals_maker_is_not_checker check (approver_id is null or approver_id <> requested_by)
);

create index on approvals (status);
create index on approvals (record_table, record_id);

create table monthly_closings (
  id                  uuid primary key default gen_random_uuid(),
  investment_cycle_id uuid not null references investment_cycles (id) on delete restrict,
  period_year         integer not null,
  period_month        integer not null check (period_month between 1 and 12),
  month_number        integer,
  status              closing_status not null default 'open',
  opening_cash        numeric(18, 2) not null default 0,
  closing_cash        numeric(18, 2) not null default 0,
  total_procurement   numeric(18, 2) not null default 0,
  total_goods_receipt numeric(18, 2) not null default 0,
  total_sales         numeric(18, 2) not null default 0,
  total_repayments    numeric(18, 2) not null default 0,
  total_expenses      numeric(18, 2) not null default 0,
  gross_profit        numeric(18, 2) not null default 0,
  net_profit          numeric(18, 2) not null default 0,
  closed_by           uuid references profiles (id),
  closed_at           timestamptz,
  reopened_by         uuid references profiles (id),
  reopen_reason       text,
  notes               text,
  created_by          uuid references profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (investment_cycle_id, period_year, period_month)
);

create table investor_reports (
  id                  uuid primary key default gen_random_uuid(),
  investment_cycle_id uuid not null references investment_cycles (id) on delete restrict,
  monthly_closing_id  uuid references monthly_closings (id) on delete set null,
  period_year         integer not null,
  period_month        integer not null check (period_month between 1 and 12),
  month_number        integer not null,
  figures             jsonb not null default '{}'::jsonb,
  management_update   text,
  disclaimer          text,
  status              text not null default 'draft' check (status in ('draft', 'published')),
  file_path           text,
  generated_by        uuid references profiles (id),
  generated_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (investment_cycle_id, period_year, period_month)
);

create table annual_closings (
  id                            uuid primary key default gen_random_uuid(),
  investment_cycle_id           uuid not null unique references investment_cycles (id) on delete restrict,
  status                        annual_closing_status not null default 'draft',
  total_capital_received        numeric(18, 2) not null default 0,
  total_procurement_spend       numeric(18, 2) not null default 0,
  total_murabaha_sales          numeric(18, 2) not null default 0,
  total_repayments_received     numeric(18, 2) not null default 0,
  total_outstanding_receivables numeric(18, 2) not null default 0,
  closing_cash                  numeric(18, 2) not null default 0,
  closing_cash_in_stock         numeric(18, 2) not null default 0,
  closing_inventory             numeric(18, 2) not null default 0,
  gross_profit                  numeric(18, 2) not null default 0,
  total_expenses                numeric(18, 2) not null default 0,
  net_profit                    numeric(18, 2) not null default 0,
  profit_sharing_ratio          numeric(9, 4) not null default 0.7,
  investor_profit_pool          numeric(18, 2) not null default 0,
  maalrise_profit_share         numeric(18, 2) not null default 0,
  capital_repayment             numeric(18, 2) not null default 0,
  total_investor_payout         numeric(18, 2) not null default 0,
  accounts_review_by            uuid references profiles (id),
  accounts_review_at            timestamptz,
  reconciliation_by             uuid references profiles (id),
  reconciliation_at             timestamptz,
  management_approval_by        uuid references profiles (id),
  management_approval_at        timestamptz,
  profit_confirmed_by           uuid references profiles (id),
  profit_confirmed_at           timestamptz,
  allocation_by                 uuid references profiles (id),
  allocation_at                 timestamptz,
  payout_approved_by            uuid references profiles (id),
  payout_approved_at            timestamptz,
  notes                         text,
  created_by                    uuid references profiles (id),
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

create table annual_closing_allocations (
  id                 uuid primary key default gen_random_uuid(),
  annual_closing_id  uuid not null references annual_closings (id) on delete cascade,
  investor_id        uuid not null references investors (id) on delete restrict,
  subscription_id    uuid references investor_subscriptions (id) on delete set null,
  units              integer not null default 0,
  capital            numeric(18, 2) not null default 0,
  profit_allocation  numeric(18, 2) not null default 0,
  total_payout       numeric(18, 2) not null default 0,
  status             payout_status not null default 'pending',
  paid_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index on annual_closing_allocations (annual_closing_id);

create table notifications (
  id                  uuid primary key default gen_random_uuid(),
  type                notification_type not null,
  severity            notification_severity not null default 'info',
  title               text not null,
  body                text,
  record_table        text,
  record_id           uuid,
  investment_cycle_id uuid references investment_cycles (id) on delete cascade,
  target_role         user_role,
  due_date            date,
  dedupe_key          text unique,
  is_read             boolean not null default false,
  read_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index on notifications (is_read, created_at desc);

-- Permanent, immutable audit trail (brief §25).
create table audit_logs (
  id          bigint generated always as identity primary key,
  user_id     uuid,
  user_email  text,
  action      audit_action not null,
  table_name  text not null,
  record_id   uuid,
  old_data    jsonb,
  new_data    jsonb,
  reason      text,
  created_at  timestamptz not null default now()
);

create index on audit_logs (table_name, record_id);
create index on audit_logs (created_at desc);
create index on audit_logs (user_id);

-- Deferred foreign keys on cash_transactions (targets created later above).
alter table cash_transactions
  add constraint cash_transactions_procurement_fk
  foreign key (procurement_order_id) references procurement_orders (id) on delete set null;

alter table cash_transactions
  add constraint cash_transactions_murabaha_fk
  foreign key (murabaha_sale_id) references murabaha_sales (id) on delete set null;
