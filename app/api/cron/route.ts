import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Daily jobs: refresh alerts, flag overdue contracts, and move cycles towards
 * maturity. `pg_cron` runs `run_daily_jobs()` directly where the extension is
 * available; this endpoint covers deployments where it is not (for example a
 * Vercel cron hitting `/api/cron` once a day).
 *
 * This is the one place besides report generation that uses the service-role
 * key, because no user is signed in when a scheduler calls it.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET

  if (secret) {
    const provided =
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
      request.nextUrl.searchParams.get('secret')

    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
  }

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('run_daily_jobs' as never, {} as never)

    if (error) {
      console.error('Daily jobs failed:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), result: data })
  } catch (error) {
    console.error('Daily jobs could not run:', error)
    return NextResponse.json(
      { error: 'Daily jobs could not run. Check SUPABASE_SERVICE_ROLE_KEY is configured.' },
      { status: 500 },
    )
  }
}
