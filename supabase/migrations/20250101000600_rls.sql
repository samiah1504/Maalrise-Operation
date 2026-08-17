-- =============================================================================
-- Migration 0007 — Row Level Security
-- Every table has RLS. The Auditor is SELECT-only everywhere. Financial rows
-- are never hard-deleted, so DELETE is granted almost nowhere.
-- =============================================================================

do $$
declare
  t text;
  -- Tables any signed-in staff member (except the auditor) may maintain.
  ops_tables text[] := array[
    'suppliers', 'products', 'warehouses', 'businesses',
    'procurement_orders', 'procurement_items', 'shipments', 'shipment_costs',
    'goods_receipts', 'goods_receipt_items', 'inventory_lots', 'inventory_movements',
    'murabaha_sales', 'murabaha_sale_items', 'documents'
  ];
  -- Tables restricted to the CEO and the Accounts Officer.
  finance_tables text[] := array[
    'investors', 'investor_subscriptions', 'bank_accounts', 'cash_transactions',
    'supplier_payments', 'repayments', 'repayment_allocations', 'expenses',
    'expense_categories', 'other_assets', 'monthly_closings', 'investor_reports',
    'annual_closings', 'annual_closing_allocations', 'approvals'
  ];
  -- Tables only the CEO may change.
  ceo_tables text[] := array[
    'system_settings', 'user_roles', 'investment_cycles'
  ];
  all_tables text[];
begin
  all_tables := ops_tables || finance_tables || ceo_tables
                || array['profiles', 'notifications', 'audit_logs', 'document_sequences'];

  foreach t in array all_tables loop
    execute format('alter table %I enable row level security', t);
  end loop;

  -- Read access: every authenticated user holding any role, including the auditor.
  foreach t in array all_tables loop
    execute format(
      'create policy "read_all_roles" on %I for select to authenticated
       using (auth_role() is not null)', t);
  end loop;

  foreach t in array ops_tables loop
    execute format(
      'create policy "ops_insert" on %I for insert to authenticated
       with check (has_role(''ceo'', ''operations'', ''accounts''))', t);
    execute format(
      'create policy "ops_update" on %I for update to authenticated
       using (has_role(''ceo'', ''operations'', ''accounts''))
       with check (has_role(''ceo'', ''operations'', ''accounts''))', t);
  end loop;

  foreach t in array finance_tables loop
    execute format(
      'create policy "finance_insert" on %I for insert to authenticated
       with check (has_role(''ceo'', ''accounts''))', t);
    execute format(
      'create policy "finance_update" on %I for update to authenticated
       using (has_role(''ceo'', ''accounts''))
       with check (has_role(''ceo'', ''accounts''))', t);
  end loop;

  foreach t in array ceo_tables loop
    execute format(
      'create policy "ceo_insert" on %I for insert to authenticated
       with check (is_ceo())', t);
    execute format(
      'create policy "ceo_update" on %I for update to authenticated
       using (is_ceo()) with check (is_ceo())', t);
  end loop;

  -- Deletes are permitted only where nothing financial is destroyed.
  foreach t in array array['documents', 'notifications', 'procurement_items',
                           'goods_receipt_items', 'murabaha_sale_items'] loop
    execute format(
      'create policy "ceo_delete" on %I for delete to authenticated using (is_ceo())', t);
  end loop;
end;
$$;

-- Drafts are the one case where an operations user may remove their own line
-- items; everything approved is protected by the RPCs and status checks.
create policy "ops_delete_draft_items" on procurement_items
for delete to authenticated
using (
  has_role('ceo', 'operations', 'accounts')
  and exists (
    select 1 from procurement_orders po
    where po.id = procurement_order_id
      and po.status in ('draft', 'awaiting_approval')
  )
);

-- Profiles: everyone reads, users maintain their own, the CEO maintains all.
create policy "profile_self_update" on profiles
for update to authenticated
using (id = auth.uid() or is_ceo())
with check (id = auth.uid() or is_ceo());

create policy "profile_insert" on profiles
for insert to authenticated
with check (id = auth.uid() or is_ceo());

-- Notifications may be marked read by any signed-in user.
create policy "notifications_update" on notifications
for update to authenticated
using (auth_role() is not null)
with check (auth_role() is not null);

create policy "notifications_insert" on notifications
for insert to authenticated
with check (can_write());

-- audit_logs deliberately has NO insert, update or delete policy. Rows are
-- written by the SECURITY DEFINER audit trigger and can never be altered or
-- removed from the application (brief §25).

-- ---------------------------------------------------------------------------
-- Storage: a single private bucket for all uploaded evidence.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 26214400)
on conflict (id) do nothing;

create policy "documents_read" on storage.objects
for select to authenticated
using (bucket_id = 'documents' and auth_role() is not null);

create policy "documents_write" on storage.objects
for insert to authenticated
with check (bucket_id = 'documents' and can_write());

create policy "documents_update" on storage.objects
for update to authenticated
using (bucket_id = 'documents' and can_write());

create policy "documents_delete" on storage.objects
for delete to authenticated
using (bucket_id = 'documents' and is_ceo());
