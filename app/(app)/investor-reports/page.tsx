import Link from 'next/link'
import { FileDown, FileSpreadsheet } from 'lucide-react'
import { requireRole, can, requireUser, requireCycle } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { createClient } from '@/lib/supabase/server'
import { formatNaira, toNumber } from '@/lib/money'
import { formatDateTime, MONTH_NAMES, previousMonth } from '@/lib/dates'
import { PageHeader, DetailRow } from '@/components/ui/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { InvestorReportGenerator } from '@/components/forms/investor-report-form'
import type { InvestorReport, MonthlyPL } from '@/lib/database.types'

export const metadata = { title: 'Investor Reports' }

export default async function InvestorReportsPage() {
  await requireRole('ceo', 'accounts', 'auditor')
  const user = await requireUser()
  const cycle = await requireCycle()
  const settings = await getSettings()
  const supabase = await createClient()

  const [{ data: reportRows }, { data: monthRows }] = await Promise.all([
    supabase
      .from('investor_reports')
      .select('*')
      .eq('investment_cycle_id', cycle.investment_cycle_id)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false }),
    supabase
      .from('v_monthly_pl')
      .select('*')
      .eq('investment_cycle_id', cycle.investment_cycle_id)
      .order('period_start', { ascending: false }),
  ])

  const reports = (reportRows ?? []) as InvestorReport[]
  const months = (monthRows ?? []) as MonthlyPL[]
  const canGenerate = can(user.role, 'manageFinance')

  const generated = new Set(reports.map((r) => `${r.period_year}-${r.period_month}`))
  const outstanding = months.filter((m) => !generated.has(`${m.period_year}-${m.period_month}`))
  const suggested = previousMonth()

  return (
    <>
      <PageHeader
        title="Investor reports"
        description="Monthly summaries for investors. Investors do not log in — staff generate and send these as branded PDFs."
        actions={
          canGenerate ? (
            <InvestorReportGenerator
              cycleId={cycle.investment_cycle_id}
              cycleName={cycle.name}
              periods={months.map((m) => ({
                year: m.period_year,
                month: m.period_month,
                label: `${MONTH_NAMES[m.period_month - 1]} ${m.period_year}`,
                netProfit: toNumber(m.net_profit),
              }))}
              defaultYear={suggested.year}
              defaultMonth={suggested.month}
            />
          ) : null
        }
      />

      {outstanding.length > 0 ? (
        <Card className="mb-5 border-gold/40 bg-gold-muted">
          <CardContent className="pt-6 text-sm">
            <p className="font-medium">
              {outstanding.length} month{outstanding.length === 1 ? '' : 's'} without an investor
              report
            </p>
            <p className="text-muted-foreground">
              {outstanding
                .slice(0, 6)
                .map((m) => m.period_label)
                .join(', ')}
              {outstanding.length > 6 ? '…' : ''}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {reports.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="No investor reports yet"
          description="Generate a monthly report to summarise the cycle's performance for investors in plain language."
        />
      ) : (
        <div className="space-y-4">
          {reports.map((r) => {
            const f = r.figures
            const isProfit = f.result === 'profit'
            return (
              <Card key={r.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">
                        {MONTH_NAMES[r.period_month - 1]} {r.period_year}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Month {r.month_number} of {f.duration_months} · {cycle.name}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={r.status === 'published' ? 'success' : 'neutral'}>
                        {r.status === 'published' ? 'Published' : 'Draft'}
                      </Badge>
                      <Badge tone={isProfit ? 'success' : 'danger'}>
                        {isProfit ? 'Profit' : 'Loss'} {formatNaira(Math.abs(f.estimated_net_profit))}
                      </Badge>
                      <Button asChild size="sm">
                        <Link href={`/api/reports/investor-monthly?id=${r.id}`}>
                          <FileDown className="h-4 w-4" />
                          Download PDF
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid gap-x-8 sm:grid-cols-2">
                    <div>
                      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Business performance
                      </h3>
                      <dl className="divide-y">
                        <DetailRow label="Purchases made">{formatNaira(f.purchases_made)}</DetailRow>
                        <DetailRow label="Goods received">{formatNaira(f.goods_received)}</DetailRow>
                        <DetailRow label="Sales to business">
                          {formatNaira(f.sales_to_business)}
                        </DetailRow>
                        <DetailRow label="Repayments received">
                          {formatNaira(f.repayments_received)}
                        </DetailRow>
                        <DetailRow label="Cumulative net profit">
                          {formatNaira(f.cumulative_net_profit)}
                        </DetailRow>
                      </dl>
                    </div>

                    <div>
                      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Financial position
                      </h3>
                      <dl className="divide-y">
                        <DetailRow label="Cash at hand">{formatNaira(f.cash_at_hand)}</DetailRow>
                        <DetailRow label="Cash in stock">{formatNaira(f.cash_in_stock)}</DetailRow>
                        <DetailRow label="Inventory value">{formatNaira(f.inventory_value)}</DetailRow>
                        <DetailRow label="Outstanding receivables">
                          {formatNaira(f.outstanding_receivables)}
                        </DetailRow>
                        <DetailRow label="Total business assets">
                          <strong>{formatNaira(f.total_business_assets)}</strong>
                        </DetailRow>
                      </dl>
                    </div>
                  </div>

                  {r.management_update ? (
                    <div className="rounded-md border-l-4 border-gold bg-muted/40 p-3 text-sm">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Management update
                      </p>
                      <p className="whitespace-pre-wrap text-muted-foreground">
                        {r.management_update}
                      </p>
                    </div>
                  ) : (
                    <p className="rounded-md bg-warning/10 p-3 text-sm text-warning">
                      No management update yet. Regenerate the report with an update before sending
                      it to investors.
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Generated {formatDateTime(r.generated_at)}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <p className="mt-8 rounded-md border bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
        <strong className="text-foreground">Disclaimer printed on every report:</strong>{' '}
        {String(settings['report.disclaimer'])}
      </p>
    </>
  )
}
