'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  goodsReceiptSchema, murabahaSchema, procurementCostSchema, procurementSchema,
  repaymentSchema, reason as reasonSchema, supplierPaymentSchema, uuid,
} from '@/lib/schemas'
import { describeDbError, fail, guard, ok, run, zodFieldErrors } from './helpers'

/**
 * Every action here calls a Postgres RPC. The RPC validates, writes all the
 * affected tables and the audit log inside one transaction. Nothing in this
 * file writes to two financial tables itself.
 */

const REVALIDATE_FINANCIAL = [
  '/dashboard', '/cashbook', '/receivables', '/inventory',
  '/financial-reports', '/capital-recycling',
]

function touch(...extra: string[]) {
  ;[...REVALIDATE_FINANCIAL, ...extra].forEach((p) => revalidatePath(p))
}

// --- Procurement -------------------------------------------------------------
export async function createProcurement(raw: unknown) {
  return run(async () => {
    const parsed = procurementSchema.safeParse(raw)
    if (!parsed.success) {
      return fail('Please correct the highlighted fields.', zodFieldErrors(parsed.error.issues))
    }

    const { user, supabase } = await guard('ceo', 'operations', 'accounts')
    const { items, ...header } = parsed.data

    const { data: order, error } = await supabase
      .from('procurement_orders')
      .insert({ ...header, status: 'awaiting_approval', created_by: user.id })
      .select('id, batch_number')
      .single()

    if (error || !order) return fail(describeDbError(error))

    // Line totals and the order total are computed by database triggers.
    const { error: itemError } = await supabase.from('procurement_items').insert(
      items.map((item) => ({ ...item, procurement_order_id: order.id })),
    )

    if (itemError) {
      // Roll the header back so a half-created batch never lingers.
      await supabase.from('procurement_orders').delete().eq('id', order.id)
      return fail(describeDbError(itemError))
    }

    touch('/procurement')
    return ok(order, `Procurement ${order.batch_number} created and sent for approval.`)
  })
}

export async function approveProcurement(id: string, reason: string) {
  return run(async () => {
    const parsed = z.object({ id: uuid, reason: reasonSchema }).safeParse({ id, reason })
    if (!parsed.success) return fail('A reason of at least three characters is required.')

    const { supabase } = await guard('ceo', 'accounts')
    const { error } = await supabase.rpc('approve_procurement' as never, {
      p_id: parsed.data.id,
      p_reason: parsed.data.reason,
    } as never)

    if (error) return fail(describeDbError(error))

    touch('/procurement', `/procurement/${id}`, '/approvals')
    return ok({ id }, 'Procurement order approved.')
  })
}

export async function recordSupplierPayment(raw: unknown, reason: string) {
  return run(async () => {
    const parsed = supplierPaymentSchema.safeParse(raw)
    if (!parsed.success) {
      return fail('Please correct the highlighted fields.', zodFieldErrors(parsed.error.issues))
    }

    const { supabase } = await guard('ceo', 'accounts')
    const { error } = await supabase.rpc('record_supplier_payment' as never, {
      p_procurement_id: parsed.data.procurement_order_id,
      p_amount_foreign: parsed.data.amount_foreign,
      p_exchange_rate: parsed.data.exchange_rate,
      p_bank_account_id: parsed.data.bank_account_id,
      p_payment_date: parsed.data.payment_date,
      p_payment_reference: parsed.data.payment_reference ?? null,
      p_notes: parsed.data.notes ?? null,
      p_reason: reason || 'Supplier payment recorded',
    } as never)

    if (error) return fail(describeDbError(error))

    touch('/procurement', `/procurement/${parsed.data.procurement_order_id}`)
    return ok(
      { id: parsed.data.procurement_order_id },
      'Payment recorded. Cash at Hand has reduced and Cash in Stock has increased by the same amount.',
    )
  })
}

export async function recordProcurementCost(raw: unknown, reason: string) {
  return run(async () => {
    const parsed = procurementCostSchema.safeParse(raw)
    if (!parsed.success) {
      return fail('Please correct the highlighted fields.', zodFieldErrors(parsed.error.issues))
    }

    const { supabase } = await guard('ceo', 'operations', 'accounts')
    const { error } = await supabase.rpc('record_procurement_cost' as never, {
      p_procurement_id: parsed.data.procurement_order_id,
      p_cost_type: parsed.data.cost_type,
      p_amount_naira: parsed.data.amount_naira,
      p_incurred_date: parsed.data.incurred_date,
      p_description: parsed.data.description ?? null,
      p_shipment_id: parsed.data.shipment_id ?? null,
      p_bank_account_id: parsed.data.bank_account_id ?? null,
      p_payment_reference: parsed.data.payment_reference ?? null,
      p_reason: reason || 'Direct procurement cost recorded',
    } as never)

    if (error) return fail(describeDbError(error))

    touch('/procurement', `/procurement/${parsed.data.procurement_order_id}`, '/shipments')
    return ok({ id: parsed.data.procurement_order_id }, 'Cost added and landed cost reallocated.')
  })
}

export async function setAllocationMethod(
  procurementId: string,
  method: 'quantity' | 'weight' | 'volume' | 'value' | 'manual',
) {
  return run(async () => {
    const { supabase } = await guard('ceo', 'operations', 'accounts')

    const { error } = await supabase
      .from('procurement_orders')
      .update({ allocation_method: method })
      .eq('id', procurementId)
    if (error) return fail(describeDbError(error))

    const { error: allocError } = await supabase.rpc('allocate_procurement_costs' as never, {
      p_procurement_id: procurementId,
    } as never)
    if (allocError) return fail(describeDbError(allocError))

    revalidatePath(`/procurement/${procurementId}`)
    return ok({ id: procurementId }, 'Costs reallocated.')
  })
}

export async function finaliseLandedCost(id: string, reason: string) {
  return run(async () => {
    const parsed = z.object({ id: uuid, reason: reasonSchema }).safeParse({ id, reason })
    if (!parsed.success) return fail('A reason of at least three characters is required.')

    const { supabase } = await guard('ceo', 'accounts')
    const { error } = await supabase.rpc('finalise_landed_cost' as never, {
      p_procurement_id: parsed.data.id,
      p_reason: parsed.data.reason,
    } as never)

    if (error) return fail(describeDbError(error))

    touch('/procurement', `/procurement/${id}`, '/approvals')
    return ok(
      { id },
      'Landed cost finalised. This is now the disclosed cost basis for any Murābaḥah sale from this batch.',
    )
  })
}

// --- Goods receipt -----------------------------------------------------------
export async function createGoodsReceipt(raw: unknown) {
  return run(async () => {
    const parsed = goodsReceiptSchema.safeParse(raw)
    if (!parsed.success) {
      return fail('Please correct the highlighted fields.', zodFieldErrors(parsed.error.issues))
    }

    const { user, supabase } = await guard('ceo', 'operations', 'accounts')
    const { items, ...header } = parsed.data

    const { data: order } = await supabase
      .from('procurement_orders')
      .select('investment_cycle_id')
      .eq('id', header.procurement_order_id)
      .single()
    if (!order) return fail('That procurement batch could not be found.')

    const { data: grn, error } = await supabase
      .from('goods_receipts')
      .insert({
        ...header,
        investment_cycle_id: order.investment_cycle_id,
        receiving_officer: user.id,
        status: 'pending_inspection',
        created_by: user.id,
      })
      .select('id, grn_number')
      .single()

    if (error || !grn) return fail(describeDbError(error))

    // sellable = received − damaged − rejected, computed by a trigger.
    const { error: itemError } = await supabase
      .from('goods_receipt_items')
      .insert(items.map((item) => ({ ...item, goods_receipt_id: grn.id })))

    if (itemError) {
      await supabase.from('goods_receipts').delete().eq('id', grn.id)
      return fail(describeDbError(itemError))
    }

    touch('/goods-receipts', '/procurement')
    return ok(grn, `Goods receipt ${grn.grn_number} created. Confirm it to move the value into inventory.`)
  })
}

export async function confirmGoodsReceipt(id: string, reason: string) {
  return run(async () => {
    const parsed = z.object({ id: uuid, reason: reasonSchema }).safeParse({ id, reason })
    if (!parsed.success) return fail('A reason of at least three characters is required.')

    const { supabase } = await guard('ceo', 'operations', 'accounts')
    const { error } = await supabase.rpc('confirm_goods_receipt' as never, {
      p_goods_receipt_id: parsed.data.id,
      p_reason: parsed.data.reason,
    } as never)

    if (error) return fail(describeDbError(error))

    touch('/goods-receipts', `/goods-receipts/${id}`, '/procurement')
    return ok(
      { id },
      'Goods received. The value has moved out of Cash in Stock and into Inventory.',
    )
  })
}

export async function writeOffInventory(
  lotId: string,
  quantity: number,
  movementType: 'write_off' | 'damage' | 'loss',
  reason: string,
) {
  return run(async () => {
    const parsed = z
      .object({
        lotId: uuid,
        quantity: z.coerce.number().positive('Quantity must be greater than zero'),
        movementType: z.enum(['write_off', 'damage', 'loss']),
        reason: reasonSchema,
      })
      .safeParse({ lotId, quantity, movementType, reason })

    if (!parsed.success) {
      return fail('Please correct the highlighted fields.', zodFieldErrors(parsed.error.issues))
    }

    const { supabase } = await guard('ceo', 'accounts')
    const { error } = await supabase.rpc('write_off_inventory' as never, {
      p_lot_id: parsed.data.lotId,
      p_quantity: parsed.data.quantity,
      p_movement_type: parsed.data.movementType,
      p_reason: parsed.data.reason,
    } as never)

    if (error) return fail(describeDbError(error))

    touch('/inventory')
    return ok({ id: lotId }, 'Inventory written off and recorded in the audit trail.')
  })
}

// --- Murabaha ----------------------------------------------------------------
export async function createMurabahaSale(raw: unknown, reason: string) {
  return run(async () => {
    const parsed = murabahaSchema.safeParse(raw)
    if (!parsed.success) {
      return fail('Please correct the highlighted fields.', zodFieldErrors(parsed.error.issues))
    }

    const { supabase } = await guard('ceo', 'operations', 'accounts')
    const { data, error } = await supabase.rpc('create_murabaha_sale' as never, {
      p_business_id: parsed.data.business_id,
      p_cycle_id: parsed.data.investment_cycle_id,
      p_sale_date: parsed.data.sale_date,
      p_markup_rate: parsed.data.markup_rate,
      p_repayment_period_days: parsed.data.repayment_period_days,
      p_items: parsed.data.items,
      p_notes: parsed.data.notes ?? null,
      p_reason: reason || 'Murabaha sale prepared',
    } as never)

    if (error) return fail(describeDbError(error))

    touch('/murabaha')
    return ok(
      data as { id: string; contract_number: string },
      'Sale prepared and stock reserved. The price is fixed once it is approved.',
    )
  })
}

export async function approveMurabahaSale(id: string, reason: string) {
  return run(async () => {
    const parsed = z.object({ id: uuid, reason: reasonSchema }).safeParse({ id, reason })
    if (!parsed.success) return fail('A reason of at least three characters is required.')

    const { supabase } = await guard('ceo', 'accounts')
    const { error } = await supabase.rpc('approve_murabaha_sale' as never, {
      p_sale_id: parsed.data.id,
      p_reason: parsed.data.reason,
    } as never)

    if (error) return fail(describeDbError(error))

    touch('/murabaha', `/murabaha/${id}`, '/approvals')
    return ok(
      { id },
      'Sale approved. The selling price is now fixed and will not increase if payment is late.',
    )
  })
}

// --- Repayments --------------------------------------------------------------
export async function recordRepayment(raw: unknown, reason: string) {
  return run(async () => {
    const parsed = repaymentSchema.safeParse(raw)
    if (!parsed.success) {
      return fail('Please correct the highlighted fields.', zodFieldErrors(parsed.error.issues))
    }

    const { supabase } = await guard('ceo', 'accounts')
    const { data, error } = await supabase.rpc('record_repayment' as never, {
      p_business_id: parsed.data.business_id,
      p_amount: parsed.data.amount,
      p_bank_account_id: parsed.data.bank_account_id,
      p_payment_date: parsed.data.payment_date,
      p_allocations: parsed.data.allocations,
      p_method: parsed.data.method ?? null,
      p_payment_reference: parsed.data.payment_reference ?? null,
      p_notes: parsed.data.notes ?? null,
      p_reason: reason || 'Repayment received',
    } as never)

    if (error) return fail(describeDbError(error))

    touch('/repayments', '/murabaha')
    return ok(
      data as { id: string; receipt_number: string },
      'Repayment recorded. Cash at Hand is up and the receivable is down — the money is available to redeploy.',
    )
  })
}

export async function reverseRepayment(id: string, reason: string) {
  return run(async () => {
    const parsed = z.object({ id: uuid, reason: reasonSchema }).safeParse({ id, reason })
    if (!parsed.success) {
      return fail('A reason of at least three characters is required to reverse a repayment.')
    }

    const { supabase } = await guard('ceo', 'accounts')
    const { error } = await supabase.rpc('reverse_repayment' as never, {
      p_repayment_id: parsed.data.id,
      p_reason: parsed.data.reason,
    } as never)

    if (error) return fail(describeDbError(error))

    touch('/repayments', '/murabaha')
    return ok(
      { id },
      'Repayment reversed with a compensating entry. The original record is retained.',
    )
  })
}

// --- Expenses & investor capital --------------------------------------------
export async function approveExpense(id: string, reason: string) {
  return run(async () => {
    const parsed = z.object({ id: uuid, reason: reasonSchema }).safeParse({ id, reason })
    if (!parsed.success) return fail('A reason of at least three characters is required.')

    const { supabase } = await guard('ceo', 'accounts')
    const { error } = await supabase.rpc('approve_expense' as never, {
      p_expense_id: parsed.data.id,
      p_reason: parsed.data.reason,
    } as never)

    if (error) return fail(describeDbError(error))

    touch('/expenses', '/approvals')
    return ok({ id }, 'Expense approved.')
  })
}

export async function payExpense(id: string, bankAccountId: string, paymentReference: string) {
  return run(async () => {
    const parsed = z
      .object({ id: uuid, bankAccountId: uuid })
      .safeParse({ id, bankAccountId })
    if (!parsed.success) return fail('Select the account the expense was paid from.')

    const { supabase } = await guard('ceo', 'accounts')
    const { error } = await supabase.rpc('pay_expense' as never, {
      p_expense_id: parsed.data.id,
      p_bank_account_id: parsed.data.bankAccountId,
      p_payment_reference: paymentReference || null,
      p_reason: 'Expense paid',
    } as never)

    if (error) return fail(describeDbError(error))

    touch('/expenses')
    return ok({ id }, 'Expense paid and posted to the cashbook.')
  })
}

export async function recordInvestorCapital(
  subscriptionId: string,
  bankAccountId: string,
  paymentDate: string,
  paymentReference: string,
) {
  return run(async () => {
    const parsed = z
      .object({
        subscriptionId: uuid,
        bankAccountId: uuid,
        paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date'),
      })
      .safeParse({ subscriptionId, bankAccountId, paymentDate })

    if (!parsed.success) {
      return fail('Please correct the highlighted fields.', zodFieldErrors(parsed.error.issues))
    }

    const { supabase } = await guard('ceo', 'accounts')
    const { error } = await supabase.rpc('record_investor_capital' as never, {
      p_subscription_id: parsed.data.subscriptionId,
      p_bank_account_id: parsed.data.bankAccountId,
      p_payment_date: parsed.data.paymentDate,
      p_payment_reference: paymentReference || null,
      p_reason: 'Investor capital received',
    } as never)

    if (error) return fail(describeDbError(error))

    touch('/investors', '/cycles')
    return ok({ id: subscriptionId }, 'Capital recorded and added to Cash at Hand.')
  })
}
