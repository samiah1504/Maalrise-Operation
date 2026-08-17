-- =============================================================================
-- Migration 0003 — Helper functions, numbering, audit trail triggers
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Role helpers used by every RLS policy
-- ---------------------------------------------------------------------------
create or replace function auth_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from user_roles
  where user_id = auth.uid()
  order by case role
    when 'ceo' then 1
    when 'accounts' then 2
    when 'operations' then 3
    when 'auditor' then 4
  end
  limit 1;
$$;

create or replace function has_role(variadic roles user_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_roles
    where user_id = auth.uid() and role = any(roles)
  );
$$;

-- Anyone except the read-only auditor may write, subject to per-table policies.
create or replace function can_write()
returns boolean
language sql
stable
as $$
  select has_role('ceo', 'operations', 'accounts');
$$;

create or replace function is_ceo()
returns boolean
language sql
stable
as $$
  select has_role('ceo');
$$;

-- ---------------------------------------------------------------------------
-- Settings accessor (typed key/value, brief §28)
-- ---------------------------------------------------------------------------
create or replace function get_setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select value from system_settings where key = p_key;
$$;

create or replace function get_setting_numeric(p_key text, p_default numeric default 0)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value #>> '{}')::numeric from system_settings where key = p_key), p_default);
$$;

-- ---------------------------------------------------------------------------
-- Document numbering — MR-PO-2026-00001 etc. (brief §6 of CLAUDE.md)
-- Advisory lock keyed on prefix+year so concurrent inserts cannot collide.
-- ---------------------------------------------------------------------------
create or replace function next_document_number(p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := extract(year from current_date)::int;
  v_next int;
begin
  perform pg_advisory_xact_lock(hashtext(p_prefix || v_year::text));

  insert into document_sequences (prefix, year, last_number)
  values (p_prefix, v_year, 1)
  on conflict (prefix, year)
    do update set last_number = document_sequences.last_number + 1
  returning last_number into v_next;

  return format('%s-%s-%s', p_prefix, v_year, lpad(v_next::text, 5, '0'));
end;
$$;

-- Short, random, non-guessable investor code (Crockford-style base32, no
-- vowels or look-alike characters). Retries on the astronomically unlikely
-- collision.
create or replace function generate_investor_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alphabet constant text := '0123456789BCDFGHJKLMNPQRSTVWXYZ';
  v_code text;
  v_attempt int := 0;
begin
  loop
    v_code := 'MR-';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;

    exit when not exists (select 1 from investors where investor_code = v_code);

    v_attempt := v_attempt + 1;
    if v_attempt > 20 then
      raise exception 'Could not generate a unique investor code';
    end if;
  end loop;

  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit trail (brief §25). The reason is passed by the caller through the
-- `app.audit_reason` GUC, which the RPCs set before writing.
-- ---------------------------------------------------------------------------
create or replace function audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(current_setting('app.audit_reason', true), '');
  v_email  text;
  v_record uuid;
begin
  select email into v_email from profiles where id = auth.uid();

  if tg_op = 'DELETE' then
    v_record := (to_jsonb(old) ->> 'id')::uuid;
    insert into audit_logs (user_id, user_email, action, table_name, record_id, old_data, new_data, reason)
    values (auth.uid(), v_email, 'delete', tg_table_name, v_record, to_jsonb(old), null, v_reason);
    return old;
  elsif tg_op = 'UPDATE' then
    v_record := (to_jsonb(new) ->> 'id')::uuid;
    -- Skip no-op updates (e.g. touch-only writes) to keep the trail readable.
    if to_jsonb(old) - 'updated_at' = to_jsonb(new) - 'updated_at' then
      return new;
    end if;
    insert into audit_logs (user_id, user_email, action, table_name, record_id, old_data, new_data, reason)
    values (auth.uid(), v_email, 'update', tg_table_name, v_record, to_jsonb(old), to_jsonb(new), v_reason);
    return new;
  else
    v_record := (to_jsonb(new) ->> 'id')::uuid;
    insert into audit_logs (user_id, user_email, action, table_name, record_id, old_data, new_data, reason)
    values (auth.uid(), v_email, 'insert', tg_table_name, v_record, null, to_jsonb(new), v_reason);
    return new;
  end if;
end;
$$;

-- Attach updated_at + audit triggers to every business table.
do $$
declare
  t text;
  business_tables text[] := array[
    'profiles', 'user_roles', 'system_settings', 'investment_cycles', 'investors',
    'investor_subscriptions', 'suppliers', 'products', 'warehouses', 'bank_accounts',
    'cash_transactions', 'procurement_orders', 'procurement_items', 'supplier_payments',
    'shipments', 'shipment_costs', 'goods_receipts', 'goods_receipt_items',
    'inventory_lots', 'businesses', 'murabaha_sales', 'murabaha_sale_items',
    'repayments', 'repayment_allocations', 'expense_categories', 'expenses',
    'other_assets', 'documents', 'approvals', 'monthly_closings', 'investor_reports',
    'annual_closings', 'annual_closing_allocations'
  ];
begin
  foreach t in array business_tables loop
    -- updated_at (skip tables that have no such column)
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'updated_at'
    ) then
      execute format(
        'create trigger trg_%1$s_updated_at before update on %1$I
         for each row execute function set_updated_at()', t);
    end if;

    execute format(
      'create trigger trg_%1$s_audit after insert or update or delete on %1$I
       for each row execute function audit_row_change()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Investor unit validation (brief §7) — enforced in the database as well as
-- in Zod, using the configurable minimums from system_settings.
-- ---------------------------------------------------------------------------
create or replace function validate_investor_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category investor_category;
  v_min_units numeric;
  v_unit_price numeric;
begin
  select category into v_category from investors where id = new.investor_id;

  if v_category = 'new_investor' then
    v_min_units := get_setting_numeric('investor.min_units_new', 5);
  else
    v_min_units := get_setting_numeric('investor.min_units_current', 1);
  end if;

  if new.units < v_min_units then
    raise exception 'A % must subscribe to at least % unit(s); % requested',
      replace(v_category::text, '_', ' '), v_min_units, new.units
      using errcode = 'check_violation';
  end if;

  v_unit_price := coalesce(new.unit_price, get_setting_numeric('investor.unit_price', 100000));
  new.unit_price := v_unit_price;
  new.total_amount := round(new.units * v_unit_price, 2);

  return new;
end;
$$;

create trigger trg_investor_subscription_validate
before insert or update of units, unit_price, investor_id on investor_subscriptions
for each row execute function validate_investor_subscription();

-- ---------------------------------------------------------------------------
-- Auto-generated identifiers
-- ---------------------------------------------------------------------------
create or replace function assign_investor_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.investor_code is null or new.investor_code = '' then
    new.investor_code := generate_investor_code();
  end if;
  return new;
end;
$$;

create trigger trg_investors_code before insert on investors
for each row execute function assign_investor_code();

create or replace function assign_document_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text := tg_argv[0];
  v_column text := tg_argv[1];
  v_current text;
  v_json jsonb := to_jsonb(new);
begin
  v_current := v_json ->> v_column;
  if v_current is null or v_current = '' then
    new := jsonb_populate_record(new, jsonb_build_object(v_column, next_document_number(v_prefix)));
  end if;
  return new;
end;
$$;

create trigger trg_procurement_number before insert on procurement_orders
for each row execute function assign_document_number('MR-PO', 'batch_number');

create trigger trg_murabaha_number before insert on murabaha_sales
for each row execute function assign_document_number('MR-MUR', 'contract_number');

create trigger trg_shipment_number before insert on shipments
for each row execute function assign_document_number('MR-SHP', 'shipment_number');

create trigger trg_grn_number before insert on goods_receipts
for each row execute function assign_document_number('MR-GRN', 'grn_number');

create trigger trg_repayment_number before insert on repayments
for each row execute function assign_document_number('MR-RCP', 'receipt_number');

create trigger trg_expense_number before insert on expenses
for each row execute function assign_document_number('MR-EXP', 'expense_number');

-- ---------------------------------------------------------------------------
-- Period lock — a closed month may not be posted into without a CEO override
-- (brief §22 / TASKS phase 12).
-- ---------------------------------------------------------------------------
create or replace function assert_period_open(p_cycle uuid, p_date date)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status closing_status;
begin
  if p_cycle is null or p_date is null then
    return;
  end if;

  select status into v_status
  from monthly_closings
  where investment_cycle_id = p_cycle
    and period_year = extract(year from p_date)::int
    and period_month = extract(month from p_date)::int;

  if v_status = 'closed' and not is_ceo() then
    raise exception 'Accounting period %-% is closed. Only the CEO may post into a closed period.',
      extract(year from p_date)::int, lpad(extract(month from p_date)::text, 2, '0')
      using errcode = 'check_violation';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Status transition guard, mirrored by lib/status.ts
-- ---------------------------------------------------------------------------
create or replace function assert_transition(
  p_entity text,
  p_from text,
  p_to text,
  p_allowed text[]
)
returns void
language plpgsql
immutable
as $$
begin
  if p_from = p_to then
    return;
  end if;
  if not (p_to = any(p_allowed)) then
    raise exception '% cannot move from % to %', p_entity, p_from, p_to
      using errcode = 'check_violation';
  end if;
end;
$$;
