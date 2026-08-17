'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { CYCLE_COOKIE } from '@/lib/auth'

/** Persists the cycle selection used to scope every page. */
export async function selectCycle(cycleId: string) {
  const store = await cookies()
  store.set(CYCLE_COOKIE, cycleId, {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })
  revalidatePath('/', 'layout')
}
