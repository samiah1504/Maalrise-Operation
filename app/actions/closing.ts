'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { investorReportSchema, reason as reasonSchema, uuid } from '@/lib/schemas'
import { CLOSING_STEPS, STEP_LABELS, type ClosingStep } from '@/lib/closing-steps'
import { describeDbError, fail, guard, ok, run, zodFieldErrors } from './helpers'

/** Monthly closing, investor reports and the six-step annual cycle closing. */

const periodSchema = z.object({
  cycleId: uuid,
  year: z.coerce.number().int().min(2000).max(2200),
  month: z.coerce.number().int().min(1).max(12),
})

export async function closeMonth(cycleId: string, year: number, month: number, reason: string) {
  return run(async () => {
    const parsed = periodSchema.extend({ reason: reasonSchema }).safeParse({
      cycleId, year, month, reason,
    })
    if (!parsed.success) {
      return fail('Please correct the highlighted fields.', zodFieldErrors(parsed.error.issues))
    }

    const { supabase } = await guard('ceo', 'accounts')
    const { error } = await supabase.rpc('close_month' as never, {
      p_cycle_id: parsed.data.cycleId,
      p_year: parsed.data.year,
      p_month: parsed.data.month,
      p_reason: parsed.data.reason,
    } as never)

    if (error) return fail(describeDbError(error))

    revalidatePath('/monthly-closing')
    revalidatePath('/financial-reports')
    return ok(
      { cycleId },
      'Period closed. Back-dated postings into this month now need a CEO override.',
    )
  })
}

export async function reopenMonth(closingId: string, reason: string) {
  return run(async () => {
    const parsed = z.object({ id: uuid, reason: reasonSchema }).safeParse({ id: closingId, reason })
    if (!parsed.success) {
      return fail('A reason of at least three characters is required to reopen a period.')
    }

    const { supabase } = await guard('ceo')
    const { error } = await supabase.rpc('reopen_month' as never, {
      p_closing_id: parsed.data.id,
      p_reason: parsed.data.reason,
    } as never)

    if (error) return fail(describeDbError(error))

    revalidatePath('/monthly-closing')
    return ok({ id: closingId }, 'Period reopened. The reason has been recorded.')
  })
}

export async function generateInvestorReport(raw: unknown) {
  return run(async () => {
    const parsed = investorReportSchema.safeParse(raw)
    if (!parsed.success) {
      return fail('Please correct the highlighted fields.', zodFieldErrors(parsed.error.issues))
    }

    const { supabase } = await guard('ceo', 'accounts')
    const { data, error } = await supabase.rpc('generate_investor_report' as never, {
      p_cycle_id: parsed.data.investment_cycle_id,
      p_year: parsed.data.period_year,
      p_month: parsed.data.period_month,
      p_management_update: parsed.data.management_update ?? null,
      p_reason: 'Monthly investor report generated',
    } as never)

    if (error) return fail(describeDbError(error))

    revalidatePath('/investor-reports')
    return ok(data as { id: string }, 'Report generated. Review the management update, then download the PDF.')
  })
}

export async function publishInvestorReport(id: string) {
  return run(async () => {
    const { supabase } = await guard('ceo', 'accounts')
    const { error } = await supabase
      .from('investor_reports')
      .update({ status: 'published' })
      .eq('id', id)

    if (error) return fail(describeDbError(error))

    revalidatePath('/investor-reports')
    return ok({ id }, 'Report marked as published.')
  })
}

// --- Annual cycle closing (brief §22) ---------------------------------------
export async function computeAnnualClosing(cycleId: string, reason: string) {
  return run(async () => {
    const { supabase } = await guard('ceo', 'accounts')
    const { error } = await supabase.rpc('compute_annual_closing' as never, {
      p_cycle_id: cycleId,
      p_reason: reason || 'Cycle closing figures computed',
    } as never)

    if (error) return fail(describeDbError(error))

    revalidatePath('/annual-closing')
    return ok({ cycleId }, 'Closing figures computed. These are draft figures until the review steps are completed.')
  })
}

export async function advanceAnnualClosing(cycleId: string, step: ClosingStep, reason: string) {
  return run(async () => {
    const parsed = z
      .object({ cycleId: uuid, step: z.enum(CLOSING_STEPS), reason: reasonSchema })
      .safeParse({ cycleId, step, reason })
    if (!parsed.success) {
      return fail('A reason of at least three characters is required for each closing step.')
    }

    const { supabase } = await guard('ceo', 'accounts')
    const { error } = await supabase.rpc('advance_annual_closing' as never, {
      p_cycle_id: parsed.data.cycleId,
      p_next: parsed.data.step,
      p_reason: parsed.data.reason,
    } as never)

    if (error) return fail(describeDbError(error))

    revalidatePath('/annual-closing')
    revalidatePath('/cycles')
    return ok({ cycleId }, `${STEP_LABELS[parsed.data.step]} recorded.`)
  })
}

// --- Notifications -----------------------------------------------------------
export async function markNotificationsRead(ids?: string[]) {
  return run(async () => {
    const { supabase } = await guard()
    const { error } = await supabase.rpc('mark_notifications_read' as never, {
      p_ids: ids ?? null,
    } as never)

    if (error) return fail(describeDbError(error))

    revalidatePath('/notifications')
    revalidatePath('/', 'layout')
    return ok({}, 'Marked as read.')
  })
}

/** Runs the daily alert and overdue-flagging jobs on demand. */
export async function runDailyJobs() {
  return run(async () => {
    const { supabase } = await guard('ceo', 'accounts', 'operations')
    const { data, error } = await supabase.rpc('run_daily_jobs' as never, {} as never)

    if (error) return fail(describeDbError(error))

    revalidatePath('/notifications')
    return ok(data, 'Alerts refreshed.')
  })
}
