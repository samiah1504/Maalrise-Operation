import { z } from 'zod'

/**
 * One shared Zod schema per entity, used by React Hook Form in the browser and
 * again on the server before anything reaches the database. Business rules that
 * must never be bypassed (investor minimums, maker–checker, frozen prices) are
 * additionally enforced in Postgres.
 */

// --- Reusable primitives ------------------------------------------------------
const trimmed = (max: number) => z.string().trim().max(max)

export const requiredText = (label: string, max = 255) =>
  trimmed(max).min(1, `${label} is required`)

export const optionalText = (max = 2000) =>
  trimmed(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v))

export const uuid = z.string().uuid('Select a valid option')

export const optionalUuid = z
  .union([z.string().uuid(), z.literal('')])
  .optional()
  .transform((v) => (v === '' || v === undefined ? undefined : v))

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date')

export const optionalDate = z
  .union([dateString, z.literal('')])
  .optional()
  .transform((v) => (v === '' || v === undefined ? undefined : v))

/** Accepts what a number input gives us (a string) and validates as money. */
export const money = (label: string, { min = 0, allowZero = true } = {}) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .refine((n) => Number.isFinite(n), `${label} must be a number`)
    .refine((n) => (allowZero ? n >= min : n > min),
      allowZero ? `${label} cannot be negative` : `${label} must be greater than zero`)

export const quantity = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .positive(`${label} must be greater than zero`)

export const reason = z
  .string()
  .trim()
  .min(3, 'Give a short reason — it is written to the audit trail')
  .max(500)

export const optionalReason = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v === '' ? undefined : v))

// --- Investment cycles --------------------------------------------------------
export const cycleSchema = z
  .object({
    name: requiredText('Cycle name'),
    code: requiredText('Cycle code', 40),
    start_date: dateString,
    maturity_date: dateString,
    duration_months: z.coerce.number().int().min(1).max(120),
    target_capital: money('Target capital'),
    status: z.enum([
      'draft', 'subscription_open', 'active', 'approaching_maturity', 'matured',
      'accounts_under_review', 'profit_approved', 'payout_in_progress', 'completed',
    ]),
    notes: optionalText(),
  })
  .refine((v) => v.maturity_date > v.start_date, {
    message: 'Maturity must fall after the start date',
    path: ['maturity_date'],
  })

// --- Investors ----------------------------------------------------------------
export const investorSchema = z.object({
  full_name: requiredText('Full name'),
  phone: optionalText(40),
  email: z
    .union([z.string().email('Enter a valid email address'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  address: optionalText(),
  category: z.enum(['new_investor', 'current_investor']),
  status: z.enum([
    'pending_confirmation', 'active', 'matured', 'payout_pending', 'paid', 'cancelled',
  ]),
  notes: optionalText(),
})

/**
 * Unit minimums come from system_settings, so the schema is built per request.
 * The same rule is enforced by validate_investor_subscription() in Postgres.
 */
export function subscriptionSchema(minNew: number, minCurrent: number, category?: string) {
  const min = category === 'current_investor' ? minCurrent : minNew
  return z.object({
    investor_id: uuid,
    investment_cycle_id: uuid,
    units: z.coerce
      .number({ invalid_type_error: 'Units must be a number' })
      .int('Units must be a whole number')
      .min(min, `This investor must subscribe to at least ${min} unit${min === 1 ? '' : 's'}`),
    payment_date: optionalDate,
    payment_reference: optionalText(120),
    notes: optionalText(),
  })
}

// --- Suppliers ----------------------------------------------------------------
export const supplierSchema = z.object({
  name: requiredText('Supplier name'),
  contact_person: optionalText(120),
  country: requiredText('Country', 80),
  address: optionalText(),
  phone: optionalText(40),
  email: z
    .union([z.string().email('Enter a valid email address'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  wechat: optionalText(80),
  whatsapp: optionalText(40),
  bank_details: optionalText(),
  currency: requiredText('Currency', 8),
  products_supplied: optionalText(),
  rating: z.coerce.number().min(0).max(5).optional(),
  avg_production_days: z.coerce.number().int().min(0).max(999).optional(),
  avg_delivery_days: z.coerce.number().int().min(0).max(999).optional(),
  status: z.enum(['active', 'under_review', 'suspended', 'inactive']),
  notes: optionalText(),
})

// --- Products -----------------------------------------------------------------
export const productSchema = z.object({
  product_code: requiredText('Product code', 40),
  name: requiredText('Product name'),
  category: z.enum([
    'office_furniture', 'home_furniture', 'children_furniture', 'kids_ride_on_cars', 'other',
  ]),
  description: optionalText(),
  image_url: optionalText(500),
  supplier_id: optionalUuid,
  model: optionalText(80),
  colour_options: optionalText(200),
  dimensions: optionalText(120),
  packaging_details: optionalText(200),
  unit_of_measure: requiredText('Unit of measure', 20),
  weight_kg: money('Weight').optional(),
  volume_cbm: money('Volume').optional(),
  purchase_currency: requiredText('Purchase currency', 8),
  purchase_cost: money('Purchase cost'),
  est_shipping_cost: money('Estimated shipping cost'),
  est_landed_cost: money('Estimated landed cost'),
  expected_selling_price: money('Expected selling price'),
  status: z.enum(['active', 'inactive', 'discontinued']),
  notes: optionalText(),
})

// --- Businesses ---------------------------------------------------------------
export const businessSchema = z.object({
  name: requiredText('Business name'),
  contact_person: optionalText(120),
  phone: optionalText(40),
  email: z
    .union([z.string().email('Enter a valid email address'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  address: optionalText(),
  registration_details: optionalText(200),
  credit_limit: money('Credit limit'),
  standard_repayment_days: z.coerce.number().int().min(1).max(365),
  status: z.enum(['active', 'suspended', 'inactive']),
  notes: optionalText(),
})

// --- Procurement --------------------------------------------------------------
export const procurementItemSchema = z.object({
  product_id: uuid,
  quantity: quantity('Quantity'),
  unit_price_foreign: money('Unit price', { allowZero: false }),
  manual_allocation: money('Manual allocation').optional(),
})

export const procurementSchema = z.object({
  investment_cycle_id: uuid,
  supplier_id: uuid,
  procurement_date: dateString,
  currency: requiredText('Currency', 8),
  exchange_rate: money('Exchange rate', { allowZero: false }),
  payment_due_date: optionalDate,
  production_start_date: optionalDate,
  expected_production_completion: optionalDate,
  expected_shipment_date: optionalDate,
  expected_arrival_date: optionalDate,
  allocation_method: z.enum(['quantity', 'weight', 'volume', 'value', 'manual']),
  notes: optionalText(),
  items: z.array(procurementItemSchema).min(1, 'Add at least one product'),
})

export const supplierPaymentSchema = z.object({
  procurement_order_id: uuid,
  amount_foreign: money('Amount', { allowZero: false }),
  exchange_rate: money('Exchange rate', { allowZero: false }),
  bank_account_id: uuid,
  payment_date: dateString,
  payment_reference: optionalText(120),
  notes: optionalText(),
})

export const procurementCostSchema = z.object({
  procurement_order_id: uuid,
  cost_type: z.enum([
    'international_shipping', 'freight', 'insurance', 'customs', 'clearing',
    'port_charges', 'local_transport', 'inspection', 'bank_charges', 'fx_charges',
    'agent_fees', 'documentation', 'other',
  ]),
  amount_naira: money('Amount', { allowZero: false }),
  incurred_date: dateString,
  description: optionalText(200),
  shipment_id: optionalUuid,
  bank_account_id: optionalUuid,
  payment_reference: optionalText(120),
})

// --- Shipments ----------------------------------------------------------------
export const shipmentSchema = z.object({
  procurement_order_id: uuid,
  method: z.enum(['sea_freight', 'air_freight', 'land', 'courier', 'other']),
  shipping_company: optionalText(120),
  freight_forwarder: optionalText(120),
  container_number: optionalText(60),
  bill_of_lading_number: optionalText(60),
  tracking_number: optionalText(60),
  port_of_departure: optionalText(120),
  port_of_arrival: optionalText(120),
  shipment_date: optionalDate,
  expected_arrival_date: optionalDate,
  actual_arrival_date: optionalDate,
  clearing_agent: optionalText(120),
  clearing_status: optionalText(120),
  delay_reason: optionalText(),
  status: z.enum([
    'awaiting_shipment', 'booked', 'shipped', 'in_transit', 'delayed',
    'arrived_at_port', 'clearing', 'released', 'delivered_to_warehouse', 'closed',
  ]),
  notes: optionalText(),
})

// --- Goods receipt ------------------------------------------------------------
export const goodsReceiptItemSchema = z
  .object({
    procurement_item_id: uuid,
    product_id: uuid,
    expected_quantity: z.coerce.number().min(0),
    quantity_received: z.coerce.number().min(0, 'Cannot be negative'),
    damaged_quantity: z.coerce.number().min(0, 'Cannot be negative'),
    rejected_quantity: z.coerce.number().min(0, 'Cannot be negative'),
    notes: optionalText(200),
  })
  .refine((v) => v.quantity_received <= v.expected_quantity, {
    message: 'Received cannot exceed the expected quantity',
    path: ['quantity_received'],
  })
  .refine((v) => v.damaged_quantity + v.rejected_quantity <= v.quantity_received, {
    message: 'Damaged plus rejected cannot exceed the quantity received',
    path: ['damaged_quantity'],
  })

export const goodsReceiptSchema = z.object({
  procurement_order_id: uuid,
  warehouse_id: uuid,
  received_date: dateString,
  inspection_notes: optionalText(),
  items: z.array(goodsReceiptItemSchema).min(1, 'Add at least one line'),
})

// --- Murabaha -----------------------------------------------------------------
export const murabahaItemSchema = z.object({
  inventory_lot_id: uuid,
  quantity: quantity('Quantity'),
})

export const murabahaSchema = z.object({
  business_id: uuid,
  investment_cycle_id: uuid,
  sale_date: dateString,
  markup_rate: z.coerce
    .number({ invalid_type_error: 'Markup must be a number' })
    .min(0, 'Markup cannot be negative')
    .max(5, 'Markup looks too high — enter it as a rate, e.g. 0.15 for 15%'),
  repayment_period_days: z.coerce.number().int().min(1).max(365),
  notes: optionalText(),
  items: z.array(murabahaItemSchema).min(1, 'Select at least one inventory lot'),
})

// --- Repayments ---------------------------------------------------------------
export const repaymentSchema = z
  .object({
    business_id: uuid,
    amount: money('Amount', { allowZero: false }),
    bank_account_id: uuid,
    payment_date: dateString,
    method: optionalText(60),
    payment_reference: optionalText(120),
    notes: optionalText(),
    allocations: z
      .array(
        z.object({
          murabaha_sale_id: uuid,
          amount: money('Allocation', { allowZero: false }),
        }),
      )
      .min(1, 'Allocate the payment to at least one contract'),
  })
  .refine(
    (v) => {
      const total = v.allocations.reduce((sum, a) => sum + a.amount, 0)
      return Math.abs(total - v.amount) < 0.005
    },
    {
      message: 'Allocations must add up to exactly the amount received',
      path: ['allocations'],
    },
  )

// --- Expenses -----------------------------------------------------------------
export const expenseSchema = z.object({
  category_id: uuid,
  investment_cycle_id: optionalUuid,
  expense_date: dateString,
  amount: money('Amount', { allowZero: false }),
  description: requiredText('Description', 300),
  procurement_order_id: optionalUuid,
  shipment_id: optionalUuid,
  product_id: optionalUuid,
  murabaha_sale_id: optionalUuid,
  is_general_admin: z.coerce.boolean().default(false),
  notes: optionalText(),
})

// --- Bank accounts ------------------------------------------------------------
export const bankAccountSchema = z.object({
  name: requiredText('Account name'),
  account_type: z.enum(['bank', 'cash', 'foreign_currency', 'wallet', 'other']),
  bank_name: optionalText(120),
  account_number: optionalText(40),
  currency: requiredText('Currency', 8),
  opening_balance: money('Opening balance'),
  is_active: z.coerce.boolean().default(true),
  notes: optionalText(),
})

// --- Investor report ----------------------------------------------------------
export const investorReportSchema = z.object({
  investment_cycle_id: uuid,
  period_year: z.coerce.number().int().min(2000).max(2200),
  period_month: z.coerce.number().int().min(1).max(12),
  management_update: optionalText(4000),
})

export type CycleValues = z.infer<typeof cycleSchema>
export type InvestorValues = z.infer<typeof investorSchema>
export type SupplierValues = z.infer<typeof supplierSchema>
export type ProductValues = z.infer<typeof productSchema>
export type BusinessValues = z.infer<typeof businessSchema>
export type ProcurementValues = z.infer<typeof procurementSchema>
export type SupplierPaymentValues = z.infer<typeof supplierPaymentSchema>
export type ProcurementCostValues = z.infer<typeof procurementCostSchema>
export type ShipmentValues = z.infer<typeof shipmentSchema>
export type GoodsReceiptValues = z.infer<typeof goodsReceiptSchema>
export type MurabahaValues = z.infer<typeof murabahaSchema>
export type RepaymentValues = z.infer<typeof repaymentSchema>
export type ExpenseValues = z.infer<typeof expenseSchema>
export type BankAccountValues = z.infer<typeof bankAccountSchema>
