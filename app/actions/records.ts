'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  bankAccountSchema, businessSchema, cycleSchema, expenseSchema, investorSchema,
  productSchema, shipmentSchema, subscriptionSchema, supplierSchema,
} from '@/lib/schemas'
import { getSettings } from '@/lib/settings'
import { requireCycle } from '@/lib/auth'
import { describeDbError, fail, guard, ok, run, zodFieldErrors, type ActionResult } from './helpers'

/**
 * Straightforward record maintenance. Nothing here moves money — anything that
 * touches the books goes through an RPC in the other action modules.
 */

type Schema = z.ZodTypeAny

async function upsert<S extends Schema>(
  table: string,
  schema: S,
  raw: unknown,
  id: string | undefined,
  paths: string[],
  roles: Parameters<typeof guard>,
): Promise<ActionResult<{ id: string }>> {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return fail('Please correct the highlighted fields.', zodFieldErrors(parsed.error.issues))
  }

  const { user, supabase } = await guard(...roles)
  const values = parsed.data as Record<string, unknown>

  const query = id
    ? supabase.from(table as never).update(values as never).eq('id', id).select('id').single()
    : supabase
        .from(table as never)
        .insert({ ...values, created_by: user.id } as never)
        .select('id')
        .single()

  const { data, error } = await query
  if (error) return fail(describeDbError(error))

  paths.forEach((p) => revalidatePath(p))
  return ok(data as { id: string }, id ? 'Changes saved.' : 'Record created.')
}

// --- Investment cycles (CEO only) -------------------------------------------
export async function saveCycle(raw: unknown, id?: string) {
  return run(() => upsert('investment_cycles', cycleSchema, raw, id, ['/cycles'], ['ceo']))
}

// --- Suppliers ---------------------------------------------------------------
export async function saveSupplier(raw: unknown, id?: string) {
  return run(() =>
    upsert('suppliers', supplierSchema, raw, id, ['/suppliers'], ['ceo', 'operations', 'accounts']),
  )
}

// --- Products ----------------------------------------------------------------
export async function saveProduct(raw: unknown, id?: string) {
  return run(() =>
    upsert('products', productSchema, raw, id, ['/products'], ['ceo', 'operations', 'accounts']),
  )
}

// --- Businesses --------------------------------------------------------------
export async function saveBusiness(raw: unknown, id?: string) {
  return run(() =>
    upsert('businesses', businessSchema, raw, id, ['/businesses'], ['ceo', 'operations', 'accounts']),
  )
}

// --- Bank accounts -----------------------------------------------------------
export async function saveBankAccount(raw: unknown, id?: string) {
  return run(() =>
    upsert('bank_accounts', bankAccountSchema, raw, id, ['/bank-accounts', '/cashbook'], ['ceo', 'accounts']),
  )
}

// --- Shipments ---------------------------------------------------------------
export async function saveShipment(raw: unknown, id?: string) {
  return run(async () => {
    const parsed = shipmentSchema.safeParse(raw)
    if (!parsed.success) {
      return fail('Please correct the highlighted fields.', zodFieldErrors(parsed.error.issues))
    }

    const { user, supabase } = await guard('ceo', 'operations', 'accounts')

    // The shipment inherits the batch's cycle so nothing can be filed against
    // the wrong one.
    const { data: order, error: orderError } = await supabase
      .from('procurement_orders')
      .select('investment_cycle_id')
      .eq('id', parsed.data.procurement_order_id)
      .single()
    if (orderError || !order) return fail('That procurement batch could not be found.')

    const values = { ...parsed.data, investment_cycle_id: order.investment_cycle_id }

    const { data, error } = id
      ? await supabase.from('shipments').update(values).eq('id', id).select('id').single()
      : await supabase
          .from('shipments')
          .insert({ ...values, created_by: user.id })
          .select('id')
          .single()

    if (error) return fail(describeDbError(error))

    revalidatePath('/shipments')
    revalidatePath(`/procurement/${parsed.data.procurement_order_id}`)
    return ok(data, id ? 'Shipment updated.' : 'Shipment created.')
  })
}

// --- Investors ---------------------------------------------------------------
export async function saveInvestor(raw: unknown, id?: string) {
  return run(() =>
    upsert('investors', investorSchema, raw, id, ['/investors'], ['ceo', 'accounts']),
  )
}

/**
 * Subscriptions carry the unit rules. The minimums come from settings, and the
 * same check runs again in validate_investor_subscription() in Postgres.
 */
export async function saveSubscription(raw: unknown, id?: string) {
  return run(async () => {
    const { supabase, user } = await guard('ceo', 'accounts')
    const settings = await getSettings()

    const investorId = (raw as { investor_id?: string })?.investor_id
    let category: string | undefined
    if (investorId) {
      const { data } = await supabase
        .from('investors')
        .select('category')
        .eq('id', investorId)
        .single()
      category = data?.category
    }

    const schema = subscriptionSchema(
      Number(settings['investor.min_units_new']),
      Number(settings['investor.min_units_current']),
      category,
    )

    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      return fail('Please correct the highlighted fields.', zodFieldErrors(parsed.error.issues))
    }

    const unitPrice = Number(settings['investor.unit_price'])
    const values = {
      ...parsed.data,
      unit_price: unitPrice,
      total_amount: parsed.data.units * unitPrice,
    }

    const { data, error } = id
      ? await supabase
          .from('investor_subscriptions')
          .update(values)
          .eq('id', id)
          .select('id')
          .single()
      : await supabase
          .from('investor_subscriptions')
          .insert({ ...values, created_by: user.id })
          .select('id')
          .single()

    if (error) return fail(describeDbError(error))

    revalidatePath('/investors')
    return ok(data, id ? 'Subscription updated.' : 'Subscription recorded.')
  })
}

// --- Expenses ----------------------------------------------------------------
/**
 * An expense above the configured approval limit is created as
 * `awaiting_approval`; anything below it is approved on creation (brief §19).
 */
export async function saveExpense(raw: unknown, id?: string) {
  return run(async () => {
    const parsed = expenseSchema.safeParse(raw)
    if (!parsed.success) {
      return fail('Please correct the highlighted fields.', zodFieldErrors(parsed.error.issues))
    }

    const { user, supabase } = await guard('ceo', 'accounts')
    const settings = await getSettings()
    const cycle = await requireCycle()

    const limit = Number(settings['expense.approval_limit'])
    const needsApproval = parsed.data.amount > limit

    const values = {
      ...parsed.data,
      investment_cycle_id: parsed.data.investment_cycle_id ?? cycle.investment_cycle_id,
      status: needsApproval ? ('awaiting_approval' as const) : ('approved' as const),
    }

    const { data, error } = id
      ? await supabase.from('expenses').update(values).eq('id', id).select('id').single()
      : await supabase
          .from('expenses')
          .insert({ ...values, created_by: user.id })
          .select('id')
          .single()

    if (error) return fail(describeDbError(error))

    revalidatePath('/expenses')
    revalidatePath('/approvals')
    return ok(
      data,
      needsApproval
        ? 'Expense recorded and sent for approval.'
        : 'Expense recorded and approved automatically — it is below the approval limit.',
    )
  })
}

// --- Generic status transition ----------------------------------------------
/**
 * Moves a record to a new status with a reason. The reason is written into the
 * audit trail via the `app.audit_reason` setting the RPC reads.
 */
export async function changeStatus(
  table: 'procurement_orders' | 'shipments' | 'goods_receipts' | 'investment_cycles' |
         'suppliers' | 'businesses' | 'investors' | 'murabaha_sales',
  id: string,
  status: string,
  reasonText: string,
  revalidate: string[] = [],
) {
  return run(async () => {
    const { supabase } = await guard('ceo', 'operations', 'accounts')

    const parsed = z
      .object({ status: z.string().min(1), reason: z.string().trim().min(3) })
      .safeParse({ status, reason: reasonText })
    if (!parsed.success) {
      return fail('A reason of at least three characters is required.')
    }

    // One round trip: the RPC sets the audit reason and updates the status in
    // the same transaction, so the reason reaches the audit trigger.
    const { error } = await supabase.rpc('change_record_status' as never, {
      p_table: table,
      p_id: id,
      p_status: parsed.data.status,
      p_reason: parsed.data.reason,
    } as never)

    if (error) return fail(describeDbError(error))

    revalidate.forEach((p) => revalidatePath(p))
    return ok({ id }, 'Status updated.')
  })
}
