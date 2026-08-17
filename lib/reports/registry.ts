import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { toNumber } from '@/lib/money'
import { titleCase } from '@/lib/utils'

/**
 * Every operational and financial report from brief §20, described as data
 * rather than as markup, so one Excel writer and one PDF writer can render all
 * of them and the two can never drift apart.
 */

export type ColumnType = 'text' | 'money' | 'number' | 'date' | 'percent'

export interface ReportColumn {
  key: string
  label: string
  type?: ColumnType
  width?: number
}

export interface ReportSpec {
  title: string
  subtitle?: string
  columns: ReportColumn[]
  rows: Record<string, unknown>[]
  /** Headline figures printed above the table. */
  summary?: { label: string; value: string | number; type?: ColumnType }[]
  /** Column keys to total in the footer row. */
  totals?: string[]
  note?: string
}

type Client = SupabaseClient<Database>

export const REPORTS = {
  'profit-loss': 'Profit and Loss Statement',
  'balance-sheet': 'Balance Sheet',
  'cash-flow': 'Cash Flow Statement',
  cashbook: 'Cashbook',
  procurement: 'Procurement Report',
  'supplier-payments': 'Supplier Payment Report',
  shipments: 'Shipment Report',
  'inventory-valuation': 'Inventory Valuation Report',
  'stock-movement': 'Stock Movement Report',
  'murabaha-sales': 'Murābaḥah Sales Report',
  receivables: 'Receivables Report',
  repayments: 'Repayment Report',
  overdue: 'Overdue Report',
  'batch-profitability': 'Batch Profitability Report',
  'product-profitability': 'Product Profitability Report',
  'supplier-performance': 'Supplier Performance Report',
  'capital-recycling': 'Capital Recycling Report',
  expenses: 'Expense Report',
  'investor-capital': 'Investor Capital Report',
  'investment-cycle': 'Investment Cycle Report',
} as const

export type ReportSlug = keyof typeof REPORTS

export function isReportSlug(value: string): value is ReportSlug {
  return value in REPORTS
}

/** Builds the requested report for one investment cycle. */
export async function buildReport(
  supabase: Client,
  slug: ReportSlug,
  cycleId: string,
): Promise<ReportSpec> {
  const title = REPORTS[slug]

  switch (slug) {
    // --- Financial statements ------------------------------------------------
    case 'profit-loss': {
      const { data } = await supabase
        .from('v_monthly_pl')
        .select('*')
        .eq('investment_cycle_id', cycleId)
        .order('period_start')

      const rows = data ?? []
      return {
        title,
        columns: [
          { key: 'period_label', label: 'Period', width: 16 },
          { key: 'revenue', label: 'Murābaḥah revenue', type: 'money' },
          { key: 'cost_of_goods_sold', label: 'Cost of goods sold', type: 'money' },
          { key: 'gross_profit', label: 'Gross profit', type: 'money' },
          { key: 'operating_expenses', label: 'Operating expenses', type: 'money' },
          { key: 'net_profit', label: 'Net profit', type: 'money' },
        ],
        rows,
        totals: [
          'revenue', 'cost_of_goods_sold', 'gross_profit', 'operating_expenses', 'net_profit',
        ],
        note:
          'Direct procurement costs are capitalised into landed cost and reach this statement through cost of goods sold. They are not also shown as operating expenses.',
      }
    }

    case 'balance-sheet': {
      const { data } = await supabase
        .from('v_financial_position')
        .select('*')
        .eq('investment_cycle_id', cycleId)
        .maybeSingle()

      const p = data
      const rows = [
        { section: 'Assets', line: 'Cash at Hand', amount: toNumber(p?.cash_at_hand) },
        { section: 'Assets', line: 'Cash in Stock', amount: toNumber(p?.cash_in_stock) },
        { section: 'Assets', line: 'Inventory Value', amount: toNumber(p?.inventory_value) },
        { section: 'Assets', line: 'Outstanding Receivables', amount: toNumber(p?.outstanding_receivables) },
        { section: 'Assets', line: 'Other assets', amount: toNumber(p?.other_assets) },
        { section: 'Assets', line: 'Total assets', amount: toNumber(p?.total_business_assets) },
        { section: 'Liabilities', line: 'Supplier balances', amount: toNumber(p?.supplier_balance) },
        { section: 'Investment funds', line: 'Investor capital', amount: toNumber(p?.capital_introduced) },
        { section: 'Investment funds', line: 'Current-cycle profit', amount: toNumber(p?.net_profit) },
      ]

      return {
        title,
        columns: [
          { key: 'section', label: 'Section', width: 22 },
          { key: 'line', label: 'Line', width: 30 },
          { key: 'amount', label: 'Amount', type: 'money' },
        ],
        rows,
        note: 'No item appears in more than one asset bucket.',
      }
    }

    case 'cash-flow': {
      const { data } = await supabase
        .from('cash_transactions')
        .select('*')
        .eq('investment_cycle_id', cycleId)
        .order('transaction_date')

      const rows = (data ?? []).map((t) => ({
        transaction_date: t.transaction_date,
        category: titleCase(t.category),
        description: t.description ?? '',
        inflow: t.direction === 'inflow' ? toNumber(t.amount) : 0,
        outflow: t.direction === 'outflow' ? toNumber(t.amount) : 0,
      }))

      return {
        title,
        columns: [
          { key: 'transaction_date', label: 'Date', type: 'date' },
          { key: 'category', label: 'Category', width: 22 },
          { key: 'description', label: 'Description', width: 40 },
          { key: 'inflow', label: 'Inflow', type: 'money' },
          { key: 'outflow', label: 'Outflow', type: 'money' },
        ],
        rows,
        totals: ['inflow', 'outflow'],
      }
    }

    case 'cashbook': {
      const { data } = await supabase
        .from('cash_transactions')
        .select('*, bank_accounts(name)')
        .eq('investment_cycle_id', cycleId)
        .order('transaction_date')

      const rows = (data ?? []).map((t) => {
        const row = t as typeof t & { bank_accounts: { name: string } | null }
        return {
          transaction_date: row.transaction_date,
          account: row.bank_accounts?.name ?? '',
          direction: titleCase(row.direction),
          category: titleCase(row.category),
          description: row.description ?? '',
          payment_reference: row.payment_reference ?? '',
          amount: toNumber(row.amount),
        }
      })

      return {
        title,
        columns: [
          { key: 'transaction_date', label: 'Date', type: 'date' },
          { key: 'account', label: 'Account', width: 26 },
          { key: 'direction', label: 'Direction', width: 12 },
          { key: 'category', label: 'Category', width: 20 },
          { key: 'description', label: 'Description', width: 38 },
          { key: 'payment_reference', label: 'Reference', width: 18 },
          { key: 'amount', label: 'Amount', type: 'money' },
        ],
        rows,
      }
    }

    // --- Operational reports -------------------------------------------------
    case 'procurement': {
      const { data } = await supabase
        .from('v_batch_position')
        .select('*')
        .eq('investment_cycle_id', cycleId)
        .order('procurement_date')

      return {
        title,
        columns: [
          { key: 'batch_number', label: 'Batch', width: 18 },
          { key: 'procurement_date', label: 'Date', type: 'date' },
          { key: 'status', label: 'Status', width: 18 },
          { key: 'total_cost_naira', label: 'Purchase cost', type: 'money' },
          { key: 'supplier_paid', label: 'Paid', type: 'money' },
          { key: 'supplier_balance', label: 'Balance owed', type: 'money' },
          { key: 'direct_costs', label: 'Direct costs', type: 'money' },
          { key: 'cash_in_stock', label: 'Cash in stock', type: 'money' },
          { key: 'capitalised_value', label: 'Value received', type: 'money' },
        ],
        rows: (data ?? []).map((r) => ({ ...r, status: titleCase(r.status) })),
        totals: [
          'total_cost_naira', 'supplier_paid', 'supplier_balance',
          'direct_costs', 'cash_in_stock', 'capitalised_value',
        ],
      }
    }

    case 'supplier-payments': {
      const { data } = await supabase
        .from('supplier_payments')
        .select('*, procurement_orders(batch_number), bank_accounts(name)')
        .eq('investment_cycle_id', cycleId)
        .order('payment_date')

      const rows = (data ?? []).map((p) => {
        const row = p as typeof p & {
          procurement_orders: { batch_number: string } | null
          bank_accounts: { name: string } | null
        }
        return {
          payment_date: row.payment_date,
          batch: row.procurement_orders?.batch_number ?? '',
          currency: row.currency,
          amount_foreign: toNumber(row.amount_foreign),
          exchange_rate: toNumber(row.exchange_rate),
          amount_naira: toNumber(row.amount_naira),
          account: row.bank_accounts?.name ?? '',
          payment_reference: row.payment_reference ?? '',
        }
      })

      return {
        title,
        columns: [
          { key: 'payment_date', label: 'Date', type: 'date' },
          { key: 'batch', label: 'Batch', width: 18 },
          { key: 'currency', label: 'Currency', width: 10 },
          { key: 'amount_foreign', label: 'Amount', type: 'number' },
          { key: 'exchange_rate', label: 'Rate', type: 'number' },
          { key: 'amount_naira', label: 'Naira', type: 'money' },
          { key: 'account', label: 'Paid from', width: 24 },
          { key: 'payment_reference', label: 'Reference', width: 18 },
        ],
        rows,
        totals: ['amount_naira'],
      }
    }

    case 'shipments': {
      const { data } = await supabase
        .from('shipments')
        .select('*, procurement_orders(batch_number)')
        .eq('investment_cycle_id', cycleId)
        .order('shipment_date')

      const rows = (data ?? []).map((s) => {
        const row = s as typeof s & { procurement_orders: { batch_number: string } | null }
        return {
          shipment_number: row.shipment_number,
          batch: row.procurement_orders?.batch_number ?? '',
          method: titleCase(row.method),
          container_number: row.container_number ?? '',
          bill_of_lading_number: row.bill_of_lading_number ?? '',
          shipment_date: row.shipment_date,
          expected_arrival_date: row.expected_arrival_date,
          actual_arrival_date: row.actual_arrival_date,
          status: titleCase(row.status),
        }
      })

      return {
        title,
        columns: [
          { key: 'shipment_number', label: 'Shipment', width: 18 },
          { key: 'batch', label: 'Batch', width: 18 },
          { key: 'method', label: 'Method', width: 14 },
          { key: 'container_number', label: 'Container', width: 18 },
          { key: 'bill_of_lading_number', label: 'B/L', width: 18 },
          { key: 'shipment_date', label: 'Departed', type: 'date' },
          { key: 'expected_arrival_date', label: 'Expected', type: 'date' },
          { key: 'actual_arrival_date', label: 'Arrived', type: 'date' },
          { key: 'status', label: 'Status', width: 20 },
        ],
        rows,
      }
    }

    case 'inventory-valuation': {
      const { data } = await supabase
        .from('v_inventory_valuation')
        .select('*')
        .eq('investment_cycle_id', cycleId)
        .order('received_date')

      return {
        title,
        columns: [
          { key: 'product_name', label: 'Product', width: 30 },
          { key: 'product_code', label: 'Code', width: 14 },
          { key: 'batch_number', label: 'Batch', width: 18 },
          { key: 'warehouse_name', label: 'Warehouse', width: 18 },
          { key: 'received_date', label: 'Received', type: 'date' },
          { key: 'stock_age_days', label: 'Age (days)', type: 'number' },
          { key: 'quantity_available', label: 'Available', type: 'number' },
          { key: 'quantity_reserved', label: 'Reserved', type: 'number' },
          { key: 'unit_landed_cost', label: 'Unit landed cost', type: 'money' },
          { key: 'stock_value', label: 'Stock value', type: 'money' },
        ],
        rows: data ?? [],
        totals: ['stock_value'],
      }
    }

    case 'stock-movement': {
      const { data } = await supabase
        .from('inventory_movements')
        .select('*, inventory_lots!inner(investment_cycle_id, product_id, products(name, product_code))')
        .eq('inventory_lots.investment_cycle_id', cycleId)
        .order('created_at')

      const rows = (data ?? []).map((m) => {
        const row = m as typeof m & {
          inventory_lots: { products: { name: string; product_code: string } | null } | null
        }
        return {
          created_at: row.created_at,
          product: row.inventory_lots?.products?.name ?? '',
          product_code: row.inventory_lots?.products?.product_code ?? '',
          movement_type: titleCase(row.movement_type),
          quantity: toNumber(row.quantity),
          unit_cost: toNumber(row.unit_cost),
          total_value: toNumber(row.total_value),
          reason: row.reason ?? '',
        }
      })

      return {
        title,
        columns: [
          { key: 'created_at', label: 'Date', type: 'date' },
          { key: 'product', label: 'Product', width: 30 },
          { key: 'product_code', label: 'Code', width: 14 },
          { key: 'movement_type', label: 'Movement', width: 18 },
          { key: 'quantity', label: 'Quantity', type: 'number' },
          { key: 'unit_cost', label: 'Unit cost', type: 'money' },
          { key: 'total_value', label: 'Value', type: 'money' },
          { key: 'reason', label: 'Reason', width: 34 },
        ],
        rows,
      }
    }

    case 'murabaha-sales': {
      const { data } = await supabase
        .from('v_receivables')
        .select('*')
        .eq('investment_cycle_id', cycleId)
        .order('sale_date')

      return {
        title,
        columns: [
          { key: 'contract_number', label: 'Contract', width: 20 },
          { key: 'business_name', label: 'Business', width: 24 },
          { key: 'sale_date', label: 'Sale date', type: 'date' },
          { key: 'total_cost', label: 'Disclosed cost', type: 'money' },
          { key: 'markup_amount', label: 'Profit', type: 'money' },
          { key: 'selling_price', label: 'Selling price', type: 'money' },
          { key: 'amount_paid', label: 'Paid', type: 'money' },
          { key: 'outstanding', label: 'Outstanding', type: 'money' },
          { key: 'status', label: 'Status', width: 18 },
        ],
        rows: (data ?? []).map((r) => ({ ...r, status: titleCase(r.status) })),
        totals: ['total_cost', 'markup_amount', 'selling_price', 'amount_paid', 'outstanding'],
      }
    }

    case 'receivables':
    case 'overdue': {
      const { data } = await supabase
        .from('v_receivables')
        .select('*')
        .eq('investment_cycle_id', cycleId)
        .order('due_date')

      const open = (data ?? []).filter(
        (r) =>
          ['approved', 'goods_released', 'active', 'partially_paid', 'overdue'].includes(r.status) &&
          toNumber(r.outstanding) > 0,
      )
      const rows = slug === 'overdue' ? open.filter((r) => r.days_overdue > 0) : open

      return {
        title,
        subtitle: slug === 'overdue' ? 'Contracts past their due date' : undefined,
        columns: [
          { key: 'contract_number', label: 'Contract', width: 20 },
          { key: 'business_name', label: 'Business', width: 24 },
          { key: 'due_date', label: 'Due date', type: 'date' },
          { key: 'selling_price', label: 'Selling price', type: 'money' },
          { key: 'amount_paid', label: 'Paid', type: 'money' },
          { key: 'outstanding', label: 'Outstanding', type: 'money' },
          { key: 'days_overdue', label: 'Days overdue', type: 'number' },
        ],
        rows,
        totals: ['selling_price', 'amount_paid', 'outstanding'],
        note:
          'A Murābaḥah selling price is fixed at approval. Overdue amounts never increase because payment is late.',
      }
    }

    case 'repayments': {
      const { data } = await supabase
        .from('repayments')
        .select('*, businesses(name), bank_accounts(name)')
        .eq('investment_cycle_id', cycleId)
        .order('payment_date')

      const rows = (data ?? []).map((r) => {
        const row = r as typeof r & {
          businesses: { name: string } | null
          bank_accounts: { name: string } | null
        }
        return {
          receipt_number: row.receipt_number,
          business: row.businesses?.name ?? '',
          payment_date: row.payment_date,
          method: row.method ? titleCase(row.method) : '',
          payment_reference: row.payment_reference ?? '',
          account: row.bank_accounts?.name ?? '',
          status: titleCase(row.status),
          amount: row.reverses_id ? -toNumber(row.amount) : toNumber(row.amount),
        }
      })

      return {
        title,
        columns: [
          { key: 'receipt_number', label: 'Receipt', width: 20 },
          { key: 'business', label: 'Business', width: 24 },
          { key: 'payment_date', label: 'Date', type: 'date' },
          { key: 'method', label: 'Method', width: 16 },
          { key: 'payment_reference', label: 'Reference', width: 18 },
          { key: 'account', label: 'Received into', width: 24 },
          { key: 'status', label: 'Status', width: 14 },
          { key: 'amount', label: 'Amount', type: 'money' },
        ],
        rows,
        totals: ['amount'],
      }
    }

    case 'batch-profitability':
    case 'capital-recycling': {
      const { data } = await supabase
        .from('v_batch_capital_cycle')
        .select('*')
        .eq('investment_cycle_id', cycleId)
        .order('procurement_date')

      return {
        title,
        columns: [
          { key: 'batch_number', label: 'Batch', width: 18 },
          { key: 'supplier_name', label: 'Supplier', width: 26 },
          { key: 'procurement_date', label: 'Procured', type: 'date' },
          { key: 'arrival_date', label: 'Arrived', type: 'date' },
          { key: 'sale_date', label: 'Sold', type: 'date' },
          { key: 'repayment_date', label: 'Repaid', type: 'date' },
          { key: 'capital_cycle_days', label: 'Cycle days', type: 'number' },
          { key: 'cash_deployed', label: 'Capital deployed', type: 'money' },
          { key: 'murabaha_sale_value', label: 'Sale value', type: 'money' },
          { key: 'gross_profit', label: 'Gross profit', type: 'money' },
          { key: 'return_on_capital_pct', label: 'Return on capital', type: 'percent' },
        ],
        rows: data ?? [],
        totals: ['cash_deployed', 'murabaha_sale_value', 'gross_profit'],
      }
    }

    case 'product-profitability': {
      const { data } = await supabase.from('v_product_profitability').select('*').order('name')
      return {
        title,
        columns: [
          { key: 'product_code', label: 'Code', width: 14 },
          { key: 'name', label: 'Product', width: 32 },
          { key: 'category', label: 'Category', width: 20 },
          { key: 'quantity_sold', label: 'Units sold', type: 'number' },
          { key: 'total_cost', label: 'Cost', type: 'money' },
          { key: 'total_revenue', label: 'Revenue', type: 'money' },
          { key: 'gross_profit', label: 'Gross profit', type: 'money' },
          { key: 'margin_pct', label: 'Margin', type: 'percent' },
        ],
        rows: (data ?? []).map((r) => ({ ...r, category: titleCase(r.category) })),
        totals: ['total_cost', 'total_revenue', 'gross_profit'],
      }
    }

    case 'supplier-performance': {
      const { data } = await supabase.from('v_supplier_performance').select('*').order('name')
      return {
        title,
        columns: [
          { key: 'name', label: 'Supplier', width: 30 },
          { key: 'country', label: 'Country', width: 16 },
          { key: 'batch_count', label: 'Batches', type: 'number' },
          { key: 'total_purchase_value', label: 'Purchase value', type: 'money' },
          { key: 'avg_days_to_arrival', label: 'Avg days to arrival', type: 'number' },
          { key: 'avg_capital_cycle_days', label: 'Avg cycle days', type: 'number' },
          { key: 'total_gross_profit', label: 'Gross profit', type: 'money' },
          { key: 'return_on_capital_pct', label: 'Return on capital', type: 'percent' },
        ],
        rows: data ?? [],
        totals: ['total_purchase_value', 'total_gross_profit'],
      }
    }

    case 'expenses': {
      const { data } = await supabase
        .from('expenses')
        .select('*, expense_categories(name, is_direct_cost)')
        .eq('investment_cycle_id', cycleId)
        .order('expense_date')

      const rows = (data ?? []).map((e) => {
        const row = e as typeof e & {
          expense_categories: { name: string; is_direct_cost: boolean } | null
        }
        return {
          expense_number: row.expense_number,
          expense_date: row.expense_date,
          category: row.expense_categories?.name ?? '',
          treatment: row.expense_categories?.is_direct_cost ? 'Capitalised' : 'Operating',
          description: row.description,
          status: titleCase(row.status),
          amount: toNumber(row.amount),
        }
      })

      return {
        title,
        columns: [
          { key: 'expense_number', label: 'Number', width: 18 },
          { key: 'expense_date', label: 'Date', type: 'date' },
          { key: 'category', label: 'Category', width: 22 },
          { key: 'treatment', label: 'Treatment', width: 14 },
          { key: 'description', label: 'Description', width: 38 },
          { key: 'status', label: 'Status', width: 16 },
          { key: 'amount', label: 'Amount', type: 'money' },
        ],
        rows,
        totals: ['amount'],
      }
    }

    case 'investor-capital': {
      const { data } = await supabase
        .from('investor_subscriptions')
        .select('*, investors(full_name, investor_code, category, phone, email)')
        .eq('investment_cycle_id', cycleId)

      const rows = (data ?? []).map((s) => {
        const row = s as typeof s & {
          investors: {
            full_name: string; investor_code: string; category: string
            phone: string | null; email: string | null
          } | null
        }
        return {
          investor_code: row.investors?.investor_code ?? '',
          full_name: row.investors?.full_name ?? '',
          category: titleCase(row.investors?.category ?? ''),
          units: row.units,
          unit_price: toNumber(row.unit_price),
          total_amount: toNumber(row.total_amount),
          payment_date: row.payment_date,
          payment_reference: row.payment_reference ?? '',
          capital_recorded: row.capital_recorded ? 'Received' : 'Awaiting',
        }
      })

      return {
        title,
        columns: [
          { key: 'investor_code', label: 'Code', width: 16 },
          { key: 'full_name', label: 'Investor', width: 28 },
          { key: 'category', label: 'Category', width: 18 },
          { key: 'units', label: 'Units', type: 'number' },
          { key: 'unit_price', label: 'Unit price', type: 'money' },
          { key: 'total_amount', label: 'Total invested', type: 'money' },
          { key: 'payment_date', label: 'Payment date', type: 'date' },
          { key: 'payment_reference', label: 'Reference', width: 18 },
          { key: 'capital_recorded', label: 'Capital', width: 14 },
        ],
        rows,
        totals: ['units', 'total_amount'],
      }
    }

    case 'investment-cycle': {
      const { data } = await supabase
        .from('v_cycle_summary')
        .select('*')
        .eq('investment_cycle_id', cycleId)
        .maybeSingle()

      const c = data
      const rows = [
        { line: 'Cycle', value: c?.name ?? '' },
        { line: 'Code', value: c?.code ?? '' },
        { line: 'Status', value: titleCase(c?.status ?? '') },
        { line: 'Start date', value: c?.start_date ?? '' },
        { line: 'Maturity date', value: c?.maturity_date ?? '' },
        { line: 'Months completed', value: String(c?.months_completed ?? 0) },
        { line: 'Months remaining', value: String(c?.months_remaining ?? 0) },
        { line: 'Investors', value: String(c?.investor_count ?? 0) },
        { line: 'Units subscribed', value: String(c?.units_subscribed ?? 0) },
        { line: 'Target capital', value: String(toNumber(c?.target_capital)) },
        { line: 'Capital received', value: String(toNumber(c?.capital_received)) },
        { line: 'Cash at Hand', value: String(toNumber(c?.cash_at_hand)) },
        { line: 'Cash in Stock', value: String(toNumber(c?.cash_in_stock)) },
        { line: 'Inventory Value', value: String(toNumber(c?.inventory_value)) },
        { line: 'Outstanding Receivables', value: String(toNumber(c?.outstanding_receivables)) },
        { line: 'Total Business Assets', value: String(toNumber(c?.total_business_assets)) },
        { line: 'Gross profit', value: String(toNumber(c?.gross_profit)) },
        { line: 'Total expenses', value: String(toNumber(c?.total_expenses)) },
        { line: 'Net profit (provisional)', value: String(toNumber(c?.net_profit)) },
      ]

      return {
        title,
        columns: [
          { key: 'line', label: 'Item', width: 34 },
          { key: 'value', label: 'Value', width: 34 },
        ],
        rows,
        note:
          'Profit shown here is provisional. Final distributable profit is determined only at the close of the 12-month cycle.',
      }
    }
  }
}
