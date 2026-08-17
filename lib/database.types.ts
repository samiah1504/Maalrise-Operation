/**
 * Database types.
 *
 * Regenerate with:
 *   supabase gen types typescript --local > lib/database.types.ts
 *
 * The hand-maintained version below matches supabase/migrations and is checked
 * in so the app type-checks without a live database. Money columns are typed as
 * `string` because Postgres `numeric` is returned as a string by PostgREST —
 * pass them through `toNumber()` from lib/money before doing arithmetic.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

// --- Enums -------------------------------------------------------------------
export type UserRole = 'ceo' | 'operations' | 'accounts' | 'auditor'

export type CycleStatus =
  | 'draft' | 'subscription_open' | 'active' | 'approaching_maturity' | 'matured'
  | 'accounts_under_review' | 'profit_approved' | 'payout_in_progress' | 'completed'

export type InvestorCategory = 'new_investor' | 'current_investor'

export type InvestorStatus =
  | 'pending_confirmation' | 'active' | 'matured' | 'payout_pending' | 'paid' | 'cancelled'

export type SupplierStatus = 'active' | 'under_review' | 'suspended' | 'inactive'

export type ProductCategory =
  | 'office_furniture' | 'home_furniture' | 'children_furniture'
  | 'kids_ride_on_cars' | 'other'

export type ProductStatus = 'active' | 'inactive' | 'discontinued'

export type ProcurementStatus =
  | 'draft' | 'awaiting_approval' | 'approved' | 'supplier_payment_pending'
  | 'partially_paid' | 'fully_paid' | 'in_production' | 'production_completed'
  | 'ready_for_shipment' | 'shipped' | 'in_transit' | 'at_port' | 'clearing'
  | 'received' | 'partially_received' | 'closed' | 'cancelled'

export type AllocationMethod = 'quantity' | 'weight' | 'volume' | 'value' | 'manual'

export type ProcurementCostType =
  | 'international_shipping' | 'freight' | 'insurance' | 'customs' | 'clearing'
  | 'port_charges' | 'local_transport' | 'inspection' | 'bank_charges'
  | 'fx_charges' | 'agent_fees' | 'documentation' | 'other'

export type ShipmentStatus =
  | 'awaiting_shipment' | 'booked' | 'shipped' | 'in_transit' | 'delayed'
  | 'arrived_at_port' | 'clearing' | 'released' | 'delivered_to_warehouse' | 'closed'

export type ShippingMethod = 'sea_freight' | 'air_freight' | 'land' | 'courier' | 'other'

export type GoodsReceiptStatus =
  | 'pending_inspection' | 'partially_received' | 'fully_received'
  | 'damaged' | 'disputed' | 'closed'

export type InventoryMovementType =
  | 'receipt' | 'reservation' | 'release_reservation' | 'sale' | 'write_off'
  | 'damage' | 'loss' | 'adjustment' | 'return'

export type BusinessStatus = 'active' | 'suspended' | 'inactive'

export type MurabahaStatus =
  | 'draft' | 'awaiting_approval' | 'approved' | 'goods_released' | 'active'
  | 'partially_paid' | 'fully_paid' | 'overdue' | 'disputed' | 'cancelled'

export type RepaymentScheduleStatus =
  | 'not_due' | 'due_soon' | 'due_today' | 'partially_paid' | 'paid' | 'overdue' | 'disputed'

export type RepaymentRecordStatus = 'recorded' | 'approved' | 'reversed' | 'cancelled'

export type BankAccountType = 'bank' | 'cash' | 'foreign_currency' | 'wallet' | 'other'

export type CashDirection = 'inflow' | 'outflow'

export type CashCategory =
  | 'investor_capital' | 'business_repayment' | 'supplier_refund' | 'other_income'
  | 'supplier_payment' | 'shipping' | 'clearing' | 'customs' | 'local_transport'
  | 'salaries' | 'software' | 'bank_charges' | 'professional_fees'
  | 'office_expense' | 'investor_payout' | 'other_expense'

export type ExpenseStatus =
  | 'draft' | 'awaiting_approval' | 'approved' | 'rejected' | 'paid' | 'cancelled'

export type ApprovalType =
  | 'procurement_order' | 'supplier_payment' | 'landed_cost' | 'goods_receipt_adjustment'
  | 'inventory_write_off' | 'murabaha_sale' | 'repayment_reversal' | 'high_value_expense'
  | 'period_closing' | 'final_profit' | 'investor_payout' | 'investor_capital'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export type DocumentType =
  | 'investor_payment_proof' | 'supplier_invoice' | 'purchase_order' | 'quotation'
  | 'shipping_invoice' | 'packing_list' | 'bill_of_lading' | 'customs_document'
  | 'clearing_receipt' | 'goods_receipt_evidence' | 'murabaha_contract'
  | 'business_invoice' | 'repayment_proof' | 'expense_receipt' | 'bank_statement'
  | 'investor_report' | 'annual_closing_report' | 'supplier_document'
  | 'product_image' | 'other'

export type ClosingStatus = 'open' | 'in_review' | 'closed' | 'reopened'

export type AnnualClosingStatus =
  | 'draft' | 'accounts_review' | 'reconciliation' | 'management_approval'
  | 'profit_confirmed' | 'investor_allocation' | 'payout_approved' | 'completed'

export type PayoutStatus = 'pending' | 'scheduled' | 'paid' | 'cancelled'

export type NotificationType =
  | 'supplier_payment_due' | 'production_completion_due' | 'shipment_delayed'
  | 'arrival_approaching' | 'goods_at_port' | 'clearing_delayed' | 'goods_received'
  | 'repayment_due' | 'repayment_overdue' | 'expense_awaiting_approval'
  | 'cycle_approaching_maturity' | 'investor_report_due'
  | 'month_end_closing_incomplete' | 'approval_pending'

export type NotificationSeverity = 'info' | 'warning' | 'critical'

export type AuditAction = 'insert' | 'update' | 'delete'

// --- Common column groups ----------------------------------------------------
type Timestamps = {
  created_at: string
  updated_at: string
}

// --- Row types ---------------------------------------------------------------
export type Profile = Timestamps & {
  id: string
  full_name: string
  email: string
  phone: string | null
  job_title: string | null
  is_active: boolean
}

export type UserRoleRow = {
  id: string
  user_id: string
  role: UserRole
  granted_by: string | null
  created_at: string
}

export type SystemSetting = {
  key: string
  value: Json
  value_type: 'string' | 'number' | 'boolean' | 'json'
  label: string
  category: string
  description: string | null
  updated_by: string | null
  updated_at: string
}

export type InvestmentCycle = Timestamps & {
  id: string
  name: string
  code: string
  start_date: string
  maturity_date: string
  duration_months: number
  target_capital: string
  status: CycleStatus
  notes: string | null
  created_by: string | null
}

export type Investor = Timestamps & {
  id: string
  investor_code: string
  full_name: string
  phone: string | null
  email: string | null
  address: string | null
  category: InvestorCategory
  status: InvestorStatus
  notes: string | null
  created_by: string | null
}

export type InvestorSubscription = Timestamps & {
  id: string
  investor_id: string
  investment_cycle_id: string
  units: number
  unit_price: string
  total_amount: string
  payment_date: string | null
  payment_reference: string | null
  status: InvestorStatus
  capital_recorded: boolean
  notes: string | null
  created_by: string | null
}

export type Supplier = Timestamps & {
  id: string
  name: string
  contact_person: string | null
  country: string
  address: string | null
  phone: string | null
  email: string | null
  wechat: string | null
  whatsapp: string | null
  bank_details: string | null
  currency: string
  products_supplied: string | null
  rating: string | null
  avg_production_days: number | null
  avg_delivery_days: number | null
  status: SupplierStatus
  notes: string | null
  created_by: string | null
}

export type Product = Timestamps & {
  id: string
  product_code: string
  name: string
  category: ProductCategory
  description: string | null
  image_url: string | null
  supplier_id: string | null
  model: string | null
  colour_options: string | null
  dimensions: string | null
  packaging_details: string | null
  unit_of_measure: string
  weight_kg: string | null
  volume_cbm: string | null
  purchase_currency: string
  purchase_cost: string
  est_shipping_cost: string
  est_landed_cost: string
  expected_selling_price: string
  status: ProductStatus
  notes: string | null
  created_by: string | null
}

export type Warehouse = Timestamps & {
  id: string
  name: string
  location: string | null
  address: string | null
  is_active: boolean
}

export type BankAccount = Timestamps & {
  id: string
  name: string
  account_type: BankAccountType
  bank_name: string | null
  account_number: string | null
  currency: string
  opening_balance: string
  is_active: boolean
  notes: string | null
  created_by: string | null
}

export type CashTransaction = Timestamps & {
  id: string
  bank_account_id: string
  investment_cycle_id: string | null
  transaction_date: string
  direction: CashDirection
  amount: string
  category: CashCategory
  description: string | null
  reference_table: string | null
  reference_id: string | null
  procurement_order_id: string | null
  murabaha_sale_id: string | null
  payment_reference: string | null
  is_reversal: boolean
  reverses_id: string | null
  created_by: string | null
  approved_by: string | null
}

export type ProcurementOrder = Timestamps & {
  id: string
  batch_number: string
  investment_cycle_id: string
  supplier_id: string
  procurement_date: string
  currency: string
  exchange_rate: string
  total_cost_foreign: string
  total_cost_naira: string
  amount_paid_naira: string
  payment_due_date: string | null
  production_start_date: string | null
  expected_production_completion: string | null
  expected_shipment_date: string | null
  expected_arrival_date: string | null
  allocation_method: AllocationMethod
  allocated_costs_naira: string
  landed_cost_finalised: boolean
  landed_cost_finalised_at: string | null
  landed_cost_finalised_by: string | null
  status: ProcurementStatus
  approved_by: string | null
  approved_at: string | null
  cancelled_reason: string | null
  notes: string | null
  created_by: string | null
}

export type ProcurementItem = Timestamps & {
  id: string
  procurement_order_id: string
  product_id: string
  quantity: string
  unit_price_foreign: string
  line_total_foreign: string
  line_total_naira: string
  quantity_received: string
  allocated_cost_naira: string
  landed_cost_total: string
  landed_cost_per_unit: string
  manual_allocation: string | null
  notes: string | null
}

export type SupplierPayment = Timestamps & {
  id: string
  procurement_order_id: string
  investment_cycle_id: string
  payment_date: string
  currency: string
  amount_foreign: string
  exchange_rate: string
  amount_naira: string
  bank_account_id: string
  payment_reference: string | null
  cash_transaction_id: string | null
  notes: string | null
  created_by: string | null
  approved_by: string | null
  approved_at: string | null
}

export type Shipment = Timestamps & {
  id: string
  shipment_number: string
  procurement_order_id: string
  investment_cycle_id: string
  method: ShippingMethod
  shipping_company: string | null
  freight_forwarder: string | null
  container_number: string | null
  bill_of_lading_number: string | null
  tracking_number: string | null
  port_of_departure: string | null
  port_of_arrival: string | null
  shipment_date: string | null
  expected_arrival_date: string | null
  actual_arrival_date: string | null
  clearing_agent: string | null
  clearing_status: string | null
  delay_reason: string | null
  status: ShipmentStatus
  notes: string | null
  created_by: string | null
}

export type ShipmentCost = Timestamps & {
  id: string
  procurement_order_id: string
  shipment_id: string | null
  investment_cycle_id: string
  cost_type: ProcurementCostType
  description: string | null
  currency: string
  exchange_rate: string
  amount_foreign: string | null
  amount_naira: string
  incurred_date: string
  bank_account_id: string | null
  cash_transaction_id: string | null
  payment_reference: string | null
  created_by: string | null
}

export type GoodsReceipt = Timestamps & {
  id: string
  grn_number: string
  procurement_order_id: string
  investment_cycle_id: string
  warehouse_id: string
  received_date: string
  receiving_officer: string | null
  inspection_notes: string | null
  status: GoodsReceiptStatus
  confirmed_at: string | null
  confirmed_by: string | null
  notes: string | null
  created_by: string | null
}

export type GoodsReceiptItem = Timestamps & {
  id: string
  goods_receipt_id: string
  procurement_item_id: string
  product_id: string
  expected_quantity: string
  quantity_received: string
  missing_quantity: string
  damaged_quantity: string
  rejected_quantity: string
  sellable_quantity: string
  notes: string | null
}

export type InventoryLot = Timestamps & {
  id: string
  product_id: string
  procurement_order_id: string
  goods_receipt_id: string
  warehouse_id: string
  investment_cycle_id: string
  received_date: string
  quantity_received: string
  quantity_available: string
  quantity_reserved: string
  quantity_sold: string
  quantity_damaged: string
  quantity_lost: string
  unit_landed_cost: string
  created_by: string | null
}

export type InventoryMovement = {
  id: string
  inventory_lot_id: string
  movement_type: InventoryMovementType
  quantity: string
  unit_cost: string
  total_value: string
  reference_table: string | null
  reference_id: string | null
  reason: string | null
  created_by: string | null
  created_at: string
}

export type Business = Timestamps & {
  id: string
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  registration_details: string | null
  credit_limit: string
  standard_repayment_days: number
  status: BusinessStatus
  notes: string | null
  created_by: string | null
}

export type MurabahaSale = Timestamps & {
  id: string
  contract_number: string
  business_id: string
  investment_cycle_id: string
  procurement_order_id: string | null
  sale_date: string
  total_cost: string
  markup_rate: string
  markup_amount: string
  selling_price: string
  repayment_period_days: number
  due_date: string | null
  amount_paid: string
  price_frozen: boolean
  status: MurabahaStatus
  approved_by: string | null
  approved_at: string | null
  cancelled_reason: string | null
  notes: string | null
  created_by: string | null
}

export type MurabahaSaleItem = Timestamps & {
  id: string
  murabaha_sale_id: string
  inventory_lot_id: string
  product_id: string
  quantity: string
  unit_cost: string
  total_cost: string
  unit_selling_price: string
  total_selling_price: string
}

export type Repayment = Timestamps & {
  id: string
  receipt_number: string
  business_id: string
  investment_cycle_id: string
  payment_date: string
  amount: string
  method: string | null
  bank_account_id: string
  payment_reference: string | null
  cash_transaction_id: string | null
  status: RepaymentRecordStatus
  reverses_id: string | null
  reversal_reason: string | null
  notes: string | null
  recorded_by: string | null
  approved_by: string | null
  approved_at: string | null
}

export type RepaymentAllocation = {
  id: string
  repayment_id: string
  murabaha_sale_id: string
  amount: string
  created_at: string
}

export type ExpenseCategory = Timestamps & {
  id: string
  name: string
  code: string
  is_direct_cost: boolean
  is_active: boolean
}

export type Expense = Timestamps & {
  id: string
  expense_number: string
  category_id: string
  investment_cycle_id: string | null
  expense_date: string
  amount: string
  description: string
  procurement_order_id: string | null
  shipment_id: string | null
  product_id: string | null
  murabaha_sale_id: string | null
  is_general_admin: boolean
  bank_account_id: string | null
  payment_reference: string | null
  cash_transaction_id: string | null
  status: ExpenseStatus
  approved_by: string | null
  approved_at: string | null
  rejected_reason: string | null
  notes: string | null
  created_by: string | null
}

export type OtherAsset = Timestamps & {
  id: string
  investment_cycle_id: string
  name: string
  description: string | null
  value: string
  as_of_date: string
  is_active: boolean
  created_by: string | null
}

export type DocumentRow = Timestamps & {
  id: string
  doc_type: DocumentType
  title: string
  file_path: string
  file_size: number | null
  mime_type: string | null
  record_table: string | null
  record_id: string | null
  investment_cycle_id: string | null
  notes: string | null
  uploaded_by: string | null
}

export type Approval = Timestamps & {
  id: string
  approval_type: ApprovalType
  record_table: string
  record_id: string
  title: string
  amount: string | null
  requested_by: string | null
  requested_at: string
  status: ApprovalStatus
  approver_id: string | null
  decided_at: string | null
  reason: string | null
  notes: string | null
}

export type MonthlyClosing = Timestamps & {
  id: string
  investment_cycle_id: string
  period_year: number
  period_month: number
  month_number: number | null
  status: ClosingStatus
  opening_cash: string
  closing_cash: string
  total_procurement: string
  total_goods_receipt: string
  total_sales: string
  total_repayments: string
  total_expenses: string
  gross_profit: string
  net_profit: string
  closed_by: string | null
  closed_at: string | null
  reopened_by: string | null
  reopen_reason: string | null
  notes: string | null
  created_by: string | null
}

/** Shape of `investor_reports.figures`, produced by build_investor_report(). */
export type InvestorReportFigures = {
  reporting_month: string
  investment_cycle: string
  investment_cycle_code: string
  month_number: number
  duration_months: number
  purchases_made: number
  goods_received: number
  sales_to_business: number
  repayments_received: number
  estimated_net_profit: number
  cumulative_net_profit: number
  cash_at_hand: number
  cash_in_stock: number
  inventory_value: number
  outstanding_receivables: number
  total_business_assets: number
  result: 'profit' | 'loss'
}

export type InvestorReport = Timestamps & {
  id: string
  investment_cycle_id: string
  monthly_closing_id: string | null
  period_year: number
  period_month: number
  month_number: number
  figures: InvestorReportFigures
  management_update: string | null
  disclaimer: string | null
  status: 'draft' | 'published'
  file_path: string | null
  generated_by: string | null
  generated_at: string | null
}

export type AnnualClosing = Timestamps & {
  id: string
  investment_cycle_id: string
  status: AnnualClosingStatus
  total_capital_received: string
  total_procurement_spend: string
  total_murabaha_sales: string
  total_repayments_received: string
  total_outstanding_receivables: string
  closing_cash: string
  closing_cash_in_stock: string
  closing_inventory: string
  gross_profit: string
  total_expenses: string
  net_profit: string
  profit_sharing_ratio: string
  investor_profit_pool: string
  maalrise_profit_share: string
  capital_repayment: string
  total_investor_payout: string
  accounts_review_by: string | null
  accounts_review_at: string | null
  reconciliation_by: string | null
  reconciliation_at: string | null
  management_approval_by: string | null
  management_approval_at: string | null
  profit_confirmed_by: string | null
  profit_confirmed_at: string | null
  allocation_by: string | null
  allocation_at: string | null
  payout_approved_by: string | null
  payout_approved_at: string | null
  notes: string | null
  created_by: string | null
}

export type AnnualClosingAllocation = Timestamps & {
  id: string
  annual_closing_id: string
  investor_id: string
  subscription_id: string | null
  units: number
  capital: string
  profit_allocation: string
  total_payout: string
  status: PayoutStatus
  paid_at: string | null
}

export type NotificationRow = {
  id: string
  type: NotificationType
  severity: NotificationSeverity
  title: string
  body: string | null
  record_table: string | null
  record_id: string | null
  investment_cycle_id: string | null
  target_role: UserRole | null
  due_date: string | null
  dedupe_key: string | null
  is_read: boolean
  read_at: string | null
  created_at: string
}

export type AuditLog = {
  id: number
  user_id: string | null
  user_email: string | null
  action: AuditAction
  table_name: string
  record_id: string | null
  old_data: Json | null
  new_data: Json | null
  reason: string | null
  created_at: string
}

// --- View types --------------------------------------------------------------
export type FinancialPosition = {
  investment_cycle_id: string
  cash_at_hand: string
  cash_in_stock: string
  inventory_value: string
  outstanding_receivables: string
  other_assets: string
  total_business_assets: string
  supplier_balance: string
  total_murabaha_sales: string
  cost_of_goods_sold: string
  gross_profit: string
  total_expenses: string
  net_profit: string
  capital_introduced: string
  capital_deployed: string
}

export type ReceivableRow = {
  murabaha_sale_id: string
  contract_number: string
  investment_cycle_id: string
  business_id: string
  business_name: string
  procurement_order_id: string | null
  sale_date: string
  due_date: string | null
  total_cost: string
  markup_amount: string
  selling_price: string
  amount_paid: string
  outstanding: string
  status: MurabahaStatus
  days_until_due: number | null
  days_overdue: number
  schedule_status: RepaymentScheduleStatus
}

export type InventoryValuationRow = {
  inventory_lot_id: string
  investment_cycle_id: string
  product_id: string
  product_name: string
  product_code: string
  product_category: ProductCategory
  procurement_order_id: string
  batch_number: string
  warehouse_id: string
  warehouse_name: string | null
  received_date: string
  stock_age_days: number
  quantity_received: string
  quantity_available: string
  quantity_reserved: string
  quantity_sold: string
  quantity_damaged: string
  quantity_lost: string
  unit_landed_cost: string
  stock_value: string
  available_value: string
}

export type BatchPosition = {
  procurement_order_id: string
  batch_number: string
  investment_cycle_id: string
  supplier_id: string
  status: ProcurementStatus
  procurement_date: string
  total_cost_naira: string
  supplier_paid: string
  direct_costs: string
  cash_deployed: string
  supplier_balance: string
  quantity_ordered: string
  quantity_received: string
  landed_cost_total: string
  capitalised_value: string
  on_hand_value: string
  sold_value: string
  written_off_value: string
  first_receipt_date: string | null
  last_receipt_date: string | null
  cash_in_stock: string
  cost_variance: string
}

export type BatchCapitalCycle = {
  procurement_order_id: string
  batch_number: string
  investment_cycle_id: string
  supplier_id: string
  supplier_name: string | null
  status: ProcurementStatus
  procurement_date: string
  arrival_date: string | null
  sale_date: string | null
  repayment_date: string | null
  cash_deployed: string
  direct_expenses: string
  murabaha_sale_value: string
  gross_profit: string
  net_profit: string
  amount_repaid: string
  return_on_capital_pct: string
  capital_cycle_days: number | null
  procurement_to_arrival_days: number | null
  arrival_to_sale_days: number | null
  sale_to_repayment_days: number | null
  amount_available_for_redeployment: string
}

export type MonthlyPL = {
  investment_cycle_id: string
  period_start: string
  period_year: number
  period_month: number
  period_label: string
  revenue: string
  cost_of_goods_sold: string
  gross_profit: string
  operating_expenses: string
  net_profit: string
  procurement_value: string
  procurement_count: number
  repayments_received: string
  goods_received_value: string
}

export type CycleSummary = {
  investment_cycle_id: string
  name: string
  code: string
  status: CycleStatus
  start_date: string
  maturity_date: string
  duration_months: number
  target_capital: string
  capital_received: string
  investor_count: number
  units_subscribed: number
  months_completed: number
  months_remaining: number
  cash_at_hand: string
  cash_in_stock: string
  inventory_value: string
  outstanding_receivables: string
  other_assets: string
  total_business_assets: string
  total_murabaha_sales: string
  gross_profit: string
  total_expenses: string
  net_profit: string
}

export type AccountBalance = {
  bank_account_id: string
  name: string
  account_type: BankAccountType
  bank_name: string | null
  account_number: string | null
  currency: string
  is_active: boolean
  opening_balance: string
  movement: string
  balance: string
}

export type ProcurementPipeline = {
  investment_cycle_id: string
  new_orders: number
  in_production: number
  ready_for_shipment: number
  in_transit: number
  at_port: number
  awaiting_clearing: number
  received: number
  delayed: number
}

export type SupplierPerformance = {
  supplier_id: string
  name: string
  country: string
  status: SupplierStatus
  rating: string | null
  batch_count: number
  total_purchase_value: string
  avg_days_to_arrival: string
  avg_capital_cycle_days: string
  total_gross_profit: string
  return_on_capital_pct: string
}

export type ProductProfitability = {
  product_id: string
  product_code: string
  name: string
  category: ProductCategory
  supplier_id: string | null
  quantity_sold: string
  total_cost: string
  total_revenue: string
  gross_profit: string
  margin_pct: string
}

export type ReconciliationLine = {
  line: string
  expected: string
  actual: string
  difference: string
}

// --- Database shape used by the Supabase clients -----------------------------
/**
 * Mapped types rather than plain aliases: a homomorphic mapped type flattens an
 * intersection into a single object type, which is what supabase-js needs in
 * order to infer row shapes (an intersection gets no implicit index signature,
 * and every query silently degrades to `never`).
 */
type Table<Row> = {
  Row: { [K in keyof Row]: Row[K] }
  Insert: Writable<Row>
  Update: Writable<Row>
  Relationships: []
}

/**
 * Write shape. Money and quantity columns are `numeric` in Postgres and are
 * typed as `string` on read so no precision is lost coming back from PostgREST,
 * but a form naturally produces a `number` when writing. Allowing both on the
 * write side keeps that honest; the value is validated by Zod before it gets
 * here and by Postgres after.
 */
type Writable<Row> = {
  [K in keyof Row]?: string extends Extract<Row[K], string> ? Row[K] | number : Row[K]
}

type View<Row> = { Row: { [K in keyof Row]: Row[K] }; Relationships: [] }

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile>
      user_roles: Table<UserRoleRow>
      system_settings: Table<SystemSetting>
      investment_cycles: Table<InvestmentCycle>
      investors: Table<Investor>
      investor_subscriptions: Table<InvestorSubscription>
      suppliers: Table<Supplier>
      products: Table<Product>
      warehouses: Table<Warehouse>
      bank_accounts: Table<BankAccount>
      cash_transactions: Table<CashTransaction>
      procurement_orders: Table<ProcurementOrder>
      procurement_items: Table<ProcurementItem>
      supplier_payments: Table<SupplierPayment>
      shipments: Table<Shipment>
      shipment_costs: Table<ShipmentCost>
      goods_receipts: Table<GoodsReceipt>
      goods_receipt_items: Table<GoodsReceiptItem>
      inventory_lots: Table<InventoryLot>
      inventory_movements: Table<InventoryMovement>
      businesses: Table<Business>
      murabaha_sales: Table<MurabahaSale>
      murabaha_sale_items: Table<MurabahaSaleItem>
      repayments: Table<Repayment>
      repayment_allocations: Table<RepaymentAllocation>
      expense_categories: Table<ExpenseCategory>
      expenses: Table<Expense>
      other_assets: Table<OtherAsset>
      documents: Table<DocumentRow>
      approvals: Table<Approval>
      monthly_closings: Table<MonthlyClosing>
      investor_reports: Table<InvestorReport>
      annual_closings: Table<AnnualClosing>
      annual_closing_allocations: Table<AnnualClosingAllocation>
      notifications: Table<NotificationRow>
      audit_logs: Table<AuditLog>
    }
    Views: {
      v_financial_position: View<FinancialPosition>
      v_receivables: View<ReceivableRow>
      v_inventory_valuation: View<InventoryValuationRow>
      v_batch_position: View<BatchPosition>
      v_batch_capital_cycle: View<BatchCapitalCycle>
      v_monthly_pl: View<MonthlyPL>
      v_cycle_summary: View<CycleSummary>
      v_account_balances: View<AccountBalance>
      v_procurement_pipeline: View<ProcurementPipeline>
      v_supplier_performance: View<SupplierPerformance>
      v_product_profitability: View<ProductProfitability>
    }
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>
    Enums: Record<string, string>
    CompositeTypes: Record<string, Record<string, unknown>>
  }
}
