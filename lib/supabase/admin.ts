import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

/**
 * Service-role client. Bypasses RLS, so it is confined to:
 *   • scheduled jobs (alert generation, overdue flagging)
 *   • report generation that must read across every cycle
 *   • inviting and deactivating staff accounts
 *
 * The `server-only` import above makes it a build error to pull this into a
 * client component.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. It is required for report generation and scheduled jobs.',
    )
  }

  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
