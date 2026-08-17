import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/auth'
import { getBranding, getSettings } from '@/lib/settings'
import { renderInvestorReportPdf } from '@/lib/reports/investor-report'
import type { InvestorReport } from '@/lib/database.types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Downloads the branded monthly investor report as a PDF. */
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'A report id is required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from('investor_reports')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!data) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  const report = data as InvestorReport
  const [branding, settings] = await Promise.all([getBranding(), getSettings()])

  try {
    const buffer = await renderInvestorReportPdf({
      figures: report.figures,
      managementUpdate: report.management_update,
      // The stored disclaimer wins, so a report reprints exactly as issued.
      disclaimer: report.disclaimer || String(settings['report.disclaimer']),
      branding,
    })

    const period = `${report.period_year}-${String(report.period_month).padStart(2, '0')}`
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="MaalRise-Investor-Report-${period}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Investor report generation failed:', error)
    return NextResponse.json(
      { error: 'The report could not be generated. Please try again.' },
      { status: 500 },
    )
  }
}
