-- =============================================================================
-- MaalRise Internal Operations & Finance App
-- Migration 0001 — Enumerated types
-- Every status list in the build brief is modelled as a Postgres enum so that
-- illegal values cannot be written from any client.
-- =============================================================================

create extension if not exists "pgcrypto";

-- Access control -------------------------------------------------------------
create type user_role as enum ('ceo', 'operations', 'accounts', 'auditor');

-- Investment cycles (brief §6) ------------------------------------------------
create type cycle_status as enum (
  'draft',
  'subscription_open',
  'active',
  'approaching_maturity',
  'matured',
  'accounts_under_review',
  'profit_approved',
  'payout_in_progress',
  'completed'
);

-- Investors (brief §7) --------------------------------------------------------
create type investor_category as enum ('new_investor', 'current_investor');

create type investor_status as enum (
  'pending_confirmation',
  'active',
  'matured',
  'payout_pending',
  'paid',
  'cancelled'
);

-- Suppliers (brief §8) --------------------------------------------------------
create type supplier_status as enum ('active', 'under_review', 'suspended', 'inactive');

-- Products (brief §9) ---------------------------------------------------------
create type product_category as enum (
  'office_furniture',
  'home_furniture',
  'children_furniture',
  'kids_ride_on_cars',
  'other'
);

create type product_status as enum ('active', 'inactive', 'discontinued');

-- Procurement (brief §10) -----------------------------------------------------
create type procurement_status as enum (
  'draft',
  'awaiting_approval',
  'approved',
  'supplier_payment_pending',
  'partially_paid',
  'fully_paid',
  'in_production',
  'production_completed',
  'ready_for_shipment',
  'shipped',
  'in_transit',
  'at_port',
  'clearing',
  'received',
  'partially_received',
  'closed',
  'cancelled'
);

-- Landed-cost allocation (brief §11) -----------------------------------------
create type allocation_method as enum ('quantity', 'weight', 'volume', 'value', 'manual');

create type procurement_cost_type as enum (
  'international_shipping',
  'freight',
  'insurance',
  'customs',
  'clearing',
  'port_charges',
  'local_transport',
  'inspection',
  'bank_charges',
  'fx_charges',
  'agent_fees',
  'documentation',
  'other'
);

-- Shipments (brief §12) -------------------------------------------------------
create type shipment_status as enum (
  'awaiting_shipment',
  'booked',
  'shipped',
  'in_transit',
  'delayed',
  'arrived_at_port',
  'clearing',
  'released',
  'delivered_to_warehouse',
  'closed'
);

create type shipping_method as enum ('sea_freight', 'air_freight', 'land', 'courier', 'other');

-- Goods receipt (brief §13) ---------------------------------------------------
create type goods_receipt_status as enum (
  'pending_inspection',
  'partially_received',
  'fully_received',
  'damaged',
  'disputed',
  'closed'
);

create type inventory_movement_type as enum (
  'receipt',
  'reservation',
  'release_reservation',
  'sale',
  'write_off',
  'damage',
  'loss',
  'adjustment',
  'return'
);

-- Businesses (brief §14) ------------------------------------------------------
create type business_status as enum ('active', 'suspended', 'inactive');

-- Murabaha sales (brief §15) --------------------------------------------------
create type murabaha_status as enum (
  'draft',
  'awaiting_approval',
  'approved',
  'goods_released',
  'active',
  'partially_paid',
  'fully_paid',
  'overdue',
  'disputed',
  'cancelled'
);

-- Repayments (brief §16) ------------------------------------------------------
create type repayment_schedule_status as enum (
  'not_due',
  'due_soon',
  'due_today',
  'partially_paid',
  'paid',
  'overdue',
  'disputed'
);

create type repayment_record_status as enum ('recorded', 'approved', 'reversed', 'cancelled');

-- Cashbook (brief §18) --------------------------------------------------------
create type bank_account_type as enum ('bank', 'cash', 'foreign_currency', 'wallet', 'other');

create type cash_direction as enum ('inflow', 'outflow');

create type cash_category as enum (
  'investor_capital',
  'business_repayment',
  'supplier_refund',
  'other_income',
  'supplier_payment',
  'shipping',
  'clearing',
  'customs',
  'local_transport',
  'salaries',
  'software',
  'bank_charges',
  'professional_fees',
  'office_expense',
  'investor_payout',
  'other_expense'
);

-- Expenses (brief §19) --------------------------------------------------------
create type expense_status as enum (
  'draft',
  'awaiting_approval',
  'approved',
  'rejected',
  'paid',
  'cancelled'
);

-- Approvals (brief §24) -------------------------------------------------------
create type approval_type as enum (
  'procurement_order',
  'supplier_payment',
  'landed_cost',
  'goods_receipt_adjustment',
  'inventory_write_off',
  'murabaha_sale',
  'repayment_reversal',
  'high_value_expense',
  'period_closing',
  'final_profit',
  'investor_payout',
  'investor_capital'
);

create type approval_status as enum ('pending', 'approved', 'rejected', 'cancelled');

-- Documents (brief §23) -------------------------------------------------------
create type document_type as enum (
  'investor_payment_proof',
  'supplier_invoice',
  'purchase_order',
  'quotation',
  'shipping_invoice',
  'packing_list',
  'bill_of_lading',
  'customs_document',
  'clearing_receipt',
  'goods_receipt_evidence',
  'murabaha_contract',
  'business_invoice',
  'repayment_proof',
  'expense_receipt',
  'bank_statement',
  'investor_report',
  'annual_closing_report',
  'supplier_document',
  'product_image',
  'other'
);

-- Closings --------------------------------------------------------------------
create type closing_status as enum ('open', 'in_review', 'closed', 'reopened');

create type annual_closing_status as enum (
  'draft',
  'accounts_review',
  'reconciliation',
  'management_approval',
  'profit_confirmed',
  'investor_allocation',
  'payout_approved',
  'completed'
);

create type payout_status as enum ('pending', 'scheduled', 'paid', 'cancelled');

-- Notifications (brief §26) ---------------------------------------------------
create type notification_type as enum (
  'supplier_payment_due',
  'production_completion_due',
  'shipment_delayed',
  'arrival_approaching',
  'goods_at_port',
  'clearing_delayed',
  'goods_received',
  'repayment_due',
  'repayment_overdue',
  'expense_awaiting_approval',
  'cycle_approaching_maturity',
  'investor_report_due',
  'month_end_closing_incomplete',
  'approval_pending'
);

create type notification_severity as enum ('info', 'warning', 'critical');

-- Audit trail (brief §25) -----------------------------------------------------
create type audit_action as enum ('insert', 'update', 'delete');
