'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { describeDbError, fail, guard, ok, run } from './helpers'
import type { UserRole } from '@/lib/database.types'

/**
 * Settings and staff accounts. Both are the CEO's alone (brief §28, §3).
 */

const settingSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  value_type: z.enum(['string', 'number', 'boolean', 'json']),
})

export async function updateSettings(values: Record<string, string>, types: Record<string, string>) {
  return run(async () => {
    const { user, supabase } = await guard('ceo')

    const updates: { key: string; value: unknown }[] = []

    for (const [key, raw] of Object.entries(values)) {
      const parsed = settingSchema.safeParse({
        key,
        value: raw,
        value_type: types[key] ?? 'string',
      })
      if (!parsed.success) continue

      let value: unknown = parsed.data.value
      switch (parsed.data.value_type) {
        case 'number': {
          const n = Number(parsed.data.value)
          if (!Number.isFinite(n)) {
            return fail(`"${key}" must be a number.`)
          }
          value = n
          break
        }
        case 'boolean':
          value = parsed.data.value === 'true'
          break
        case 'json':
          try {
            value = JSON.parse(parsed.data.value)
          } catch {
            return fail(`"${key}" must be valid JSON.`)
          }
          break
      }

      updates.push({ key, value })
    }

    for (const update of updates) {
      const { error } = await supabase
        .from('system_settings')
        .update({ value: update.value as never, updated_by: user.id })
        .eq('key', update.key)

      if (error) return fail(describeDbError(error))
    }

    // Settings feed validation and reports everywhere, so refresh the lot.
    revalidatePath('/', 'layout')
    return ok(
      { count: updates.length },
      `${updates.length} setting${updates.length === 1 ? '' : 's'} saved. The change applies immediately, with no redeployment.`,
    )
  })
}

// --- Staff accounts ----------------------------------------------------------
const ROLES: UserRole[] = ['ceo', 'operations', 'accounts', 'auditor']

export async function setUserRole(userId: string, role: UserRole) {
  return run(async () => {
    const parsed = z
      .object({ userId: z.string().uuid(), role: z.enum(['ceo', 'operations', 'accounts', 'auditor']) })
      .safeParse({ userId, role })
    if (!parsed.success) return fail('Select a valid role.')

    const { user, supabase } = await guard('ceo')

    if (parsed.data.userId === user.id) {
      return fail('You cannot change your own role. Ask another CEO-level user to do it.')
    }

    // One role per user keeps permissions unambiguous.
    const { error: deleteError } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', parsed.data.userId)
    if (deleteError) return fail(describeDbError(deleteError))

    const { error } = await supabase
      .from('user_roles')
      .insert({ user_id: parsed.data.userId, role: parsed.data.role, granted_by: user.id })

    if (error) return fail(describeDbError(error))

    revalidatePath('/users')
    return ok({ userId }, 'Role updated.')
  })
}

export async function setUserActive(userId: string, isActive: boolean) {
  return run(async () => {
    const { user, supabase } = await guard('ceo')

    if (userId === user.id) {
      return fail('You cannot deactivate your own account.')
    }

    const { error } = await supabase
      .from('profiles')
      .update({ is_active: isActive })
      .eq('id', userId)

    if (error) return fail(describeDbError(error))

    revalidatePath('/users')
    return ok({ userId }, isActive ? 'User reactivated.' : 'User deactivated.')
  })
}

export { ROLES }
