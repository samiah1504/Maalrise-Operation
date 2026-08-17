import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { CycleSummary, Profile, UserRole } from '@/lib/database.types'

export interface SessionUser {
  id: string
  email: string
  profile: Profile
  role: UserRole
}

/** The signed-in user with their profile and role, or null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('user_roles').select('role').eq('user_id', user.id),
  ])

  if (!profile || !roles?.length) return null

  // A user may hold several roles; the most privileged one wins.
  const order: UserRole[] = ['ceo', 'accounts', 'operations', 'auditor']
  const role = order.find((r) => roles.some((x) => x.role === r)) ?? 'auditor'

  return { id: user.id, email: user.email ?? profile.email, profile, role }
})

/** Use in every protected page. Redirects to login when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return user
}

/** Use on pages only some roles may open. */
export async function requireRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await requireUser()
  if (!roles.includes(user.role)) redirect('/dashboard?denied=1')
  return user
}

// Permission helpers live in lib/roles so client components can import them
// without pulling the server-only Supabase client into the browser bundle.
export {
  PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS, can, isReadOnly, type Permission,
} from '@/lib/roles'

// --- Cycle selection ---------------------------------------------------------
/**
 * Every page is scoped to one investment cycle so records never mix.
 * The selection is held in a cookie and defaults to the active cycle.
 */
export const CYCLE_COOKIE = 'maalrise_cycle'

export const getCycles = cache(async (): Promise<CycleSummary[]> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('v_cycle_summary')
    .select('*')
    .order('start_date', { ascending: false })
  return (data ?? []) as CycleSummary[]
})

export const getSelectedCycle = cache(async (): Promise<CycleSummary | null> => {
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  const selected = cookieStore.get(CYCLE_COOKIE)?.value

  const cycles = await getCycles()
  if (!cycles.length) return null

  return (
    cycles.find((c) => c.investment_cycle_id === selected) ??
    cycles.find((c) => c.status === 'active') ??
    cycles[0]
  )
})

/** Pages that cannot render without a cycle use this. */
export async function requireCycle(): Promise<CycleSummary> {
  const cycle = await getSelectedCycle()
  if (!cycle) redirect('/cycles?empty=1')
  return cycle
}
