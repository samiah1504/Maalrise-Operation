-- =============================================================================
-- Migration 0008 — Derived totals
-- Line and header totals are computed in the database so that a client can
-- never post an internally inconsistent order.
-- =============================================================================

create or replace function sync_procurement_item_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rate numeric(18, 6);
begin
  select exchange_rate into v_rate from procurement_orders where id = new.procurement_order_id;

  new.line_total_foreign := round(new.quantity * new.unit_price_foreign, 2);
  new.line_total_naira   := round(new.line_total_foreign * coalesce(v_rate, 1), 2);

  -- Keep landed cost meaningful before any direct costs have been added.
  if new.landed_cost_total = 0 or new.allocated_cost_naira = 0 then
    new.landed_cost_total    := new.line_total_naira + new.allocated_cost_naira;
    new.landed_cost_per_unit := case when new.quantity > 0
                                     then round(new.landed_cost_total / new.quantity, 2)
                                     else 0 end;
  end if;

  return new;
end;
$$;

create trigger trg_procurement_item_totals
before insert or update of quantity, unit_price_foreign on procurement_items
for each row execute function sync_procurement_item_totals();

create or replace function sync_procurement_order_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order uuid := coalesce(new.procurement_order_id, old.procurement_order_id);
begin
  update procurement_orders po
     set total_cost_foreign = coalesce(t.foreign_total, 0),
         total_cost_naira   = coalesce(t.naira_total, 0)
  from (
    select sum(line_total_foreign) as foreign_total,
           sum(line_total_naira)   as naira_total
    from procurement_items where procurement_order_id = v_order
  ) t
  where po.id = v_order;

  return coalesce(new, old);
end;
$$;

create trigger trg_procurement_order_totals
after insert or update or delete on procurement_items
for each row execute function sync_procurement_order_totals();

-- Re-price every line when the header exchange rate changes (only possible
-- while the order is still a draft).
create or replace function reprice_procurement_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.exchange_rate is distinct from old.exchange_rate then
    if old.status not in ('draft', 'awaiting_approval') then
      raise exception 'The exchange rate cannot be changed after a procurement order is approved.'
        using errcode = 'check_violation';
    end if;

    update procurement_items
       set line_total_naira     = round(line_total_foreign * new.exchange_rate, 2),
           landed_cost_total    = round(line_total_foreign * new.exchange_rate, 2) + allocated_cost_naira,
           landed_cost_per_unit = case when quantity > 0
                                       then round((round(line_total_foreign * new.exchange_rate, 2) + allocated_cost_naira) / quantity, 2)
                                       else 0 end
     where procurement_order_id = new.id;
  end if;

  return new;
end;
$$;

create trigger trg_procurement_reprice
after update of exchange_rate on procurement_orders
for each row execute function reprice_procurement_items();

-- Goods receipt lines: sellable = received − damaged − rejected.
create or replace function sync_goods_receipt_item()
returns trigger
language plpgsql
as $$
begin
  new.missing_quantity  := greatest(new.expected_quantity - new.quantity_received, 0);
  new.sellable_quantity := greatest(
    new.quantity_received - new.damaged_quantity - new.rejected_quantity, 0);

  if new.quantity_received > new.expected_quantity then
    raise exception 'Received quantity (%) exceeds the expected quantity (%).',
      new.quantity_received, new.expected_quantity
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger trg_goods_receipt_item_totals
before insert or update on goods_receipt_items
for each row execute function sync_goods_receipt_item();

-- Overdue Murabaha contracts are flagged by the daily job, never re-priced.
create or replace function flag_overdue_sales()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update murabaha_sales
     set status = 'overdue'
   where status in ('active', 'partially_paid')
     and due_date < current_date
     and amount_paid < selling_price;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
