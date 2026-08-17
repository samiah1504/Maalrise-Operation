import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'
import type { UserRole } from '@/lib/database.types'

export type ActionResult<T = unknown> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message }
}

export function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors }
}

/**
 * Turns a Postgres error into something a non-technical user can act on.
 * The RPCs raise readable messages already; this handles the constraint
 * violations that surface from direct table writes.
 */
export function describeDbError(error: { message: string; code?: string } | null): string {
  if (!error) return 'Something went wrong. Please try again.'
  const message = error.message ?? ''

  switch (error.code) {
    case '23505':
      return 'A record with those details already exists.'
    case '23503':
      return 'That change would break a link to another record, so it was not saved.'
    case '42501':
      return 'You do not have permission to do that.'
    case 'PGRST301':
      return 'Your session has expired. Please sign in again.'
  }

  // Messages raised by our own RPCs are already written for staff.
  const cleaned = message.replace(/^.*?:\s*/, '').trim()
  return cleaned || 'Something went wrong. Please try again.'
}

/** Guard used at the top of every write action. */
export async function guard(...roles: UserRole[]) {
  const user = await requireUser()
  if (roles.length && !roles.includes(user.role)) {
    throw new PermissionError(
      'You do not have permission to perform this action. Ask the CEO if you need access.',
    )
  }
  const supabase = await createClient()
  return { user, supabase }
}

export class PermissionError extends Error {}

/** Wraps an action body so a thrown error becomes a friendly ActionResult. */
export async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof PermissionError) return fail(error.message)
    if (error && typeof error === 'object' && 'message' in error) {
      return fail(describeDbError(error as { message: string; code?: string }))
    }
    return fail('Something went wrong. Please try again.')
  }
}

/** Zod issues → { fieldPath: message } for React Hook Form. */
export function zodFieldErrors(issues: { path: (string | number)[]; message: string }[]) {
  const out: Record<string, string> = {}
  for (const issue of issues) {
    const key = issue.path.join('.')
    if (!(key in out)) out[key] = issue.message
  }
  return out
}
