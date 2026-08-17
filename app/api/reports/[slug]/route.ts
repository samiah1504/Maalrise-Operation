import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/auth'
import { getBranding } from '@/lib/settings'
import { buildReport, isReportSlug } from '@/lib/reports/registry'
import { renderExcel } from '@/lib/reports/excel'
import { renderReportPdf } from '@/lib/reports/pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Report downloads. Every role — including the read-only Auditor — may export,
 * and the query runs as the signed-in user so RLS still applies to the data
 * that reaches the file.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  if (!isReportSlug(slug)) {
    return NextResponse.json({ error: `Unknown report "${slug}"` }, { status: 404 })
  }

  const cycleId = request.nextUrl.searchParams.get('cycle')
  const format = request.nextUrl.searchParams.get('format') ?? 'pdf'

  if (!cycleId) {
    return NextResponse.json({ error: 'An investment cycle is required' }, { status: 400 })
  }
  if (format !== 'pdf' && format !== 'xlsx') {
    return NextResponse.json({ error: 'Format must be pdf or xlsx' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: cycle } = await supabase
    .from('investment_cycles')
    .select('name, code')
    .eq('id', cycleId)
    .maybeSingle()

  if (!cycle) {
    return NextResponse.json({ error: 'Investment cycle not found' }, { status: 404 })
  }

  const [spec, branding] = await Promise.all([
    buildReport(supabase, slug, cycleId),
    getBranding(),
  ])

  const stamp = new Date().toISOString().slice(0, 10)
  const filename = `${cycle.code}-${slug}-${stamp}.${format}`

  try {
    if (format === 'xlsx') {
      const buffer = await renderExcel(spec, branding, cycle.name)
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    const buffer = await renderReportPdf(spec, branding, cycle.name)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error(`Report generation failed for ${slug}:`, error)
    return NextResponse.json(
      { error: 'The report could not be generated. Please try again.' },
      { status: 500 },
    )
  }
}
