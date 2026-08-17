import Link from 'next/link'
import { CheckCircle2, FileDown, XCircle } from 'lucide-react'
import { requireRole, requireCycle } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatNaira, toNumber } from '@/lib/money'
import { MONTH_NAMES } from '@/lib/dates'
import { PageHeader, Section } from '@/components/ui/page'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form-controls'
import { EmptyState } from '@/components/ui/states'
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableNumeric, TableRow,
} from '@/components/ui/table'
import { ReportFilters } from '@/components/tables/report-filters'
import type {
  FinancialPosition, MonthlyPL, ReconciliationLine,
} from '@/lib/database.types'

export const metadata = { title: 'Financial Reports' }

/** Two-column money row used by the statements. */
function Line({
  label,
  value,
  bold,
  indent,
  negative,
}: {
  label: string
  value: string | number
  bold?: boolean
  indent?: boolean
  negative?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-2 ${bold ? 'border-t font-semibold' : ''}`}
    >
      <span className={`${indent ? 'pl-4' : ''} ${bold ? '' : 'text-muted-foreground'}`}>
        {label}
      </span>
      <span className={`tabular ${negative ? 'text-destructive' : ''}`}>
        {negative ? `(${formatNaira(value)})` : formatNaira(value)}
      </span>
    </div>
  )
}

export default async function FinancialReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  await requireRole('ceo', 'accounts', 'auditor')
  const cycle = await requireCycle()
  const supabase = await createClient()
  const cycleId = cycle.investment_cycle_id

  const [{ data: positionRow }, { data: monthlyRows }, { data: reconciliationRows }] =
    await Promise.all([
      supabase.from('v_financial_position').select('*').eq('investment_cycle_id', cycleId).maybeSingle(),
      supabase.from('v_monthly_pl').select('*').eq('investment_cycle_id', cycleId).order('period_start'),
      supabase.rpc('reconciliation_check' as never, { p_cycle_id: cycleId } as never),
    ])

  const position = (positionRow ?? {}) as Partial<FinancialPosition>
  const allMonths = (monthlyRows ?? []) as MonthlyPL[]
  const reconciliation = (reconciliationRows ?? []) as unknown as ReconciliationLine[]

  // --- Period filter -------------------------------------------------------
  const period = params.period ?? 'cycle'
  const selectedMonth = params.month
  const selectedQuarter = params.quarter

  let months = allMonths
  if (period === 'month' && selectedMonth) {
    months = allMonths.filter((m) => `${m.period_year}-${m.period_month}` === selectedMonth)
  } else if (period === 'quarter' && selectedQuarter) {
    const [year, q] = selectedQuarter.split('-Q').map(Number)
    months = allMonths.filter(
      (m) => m.period_year === year && Math.ceil(m.period_month / 3) === q,
    )
  }

  const pl = months.reduce(
    (acc, m) => ({
      revenue: acc.revenue + toNumber(m.revenue),
      cogs: acc.cogs + toNumber(m.cost_of_goods_sold),
      gross: acc.gross + toNumber(m.gross_profit),
      opex: acc.opex + toNumber(m.operating_expenses),
      net: acc.net + toNumber(m.net_profit),
      procurement: acc.procurement + toNumber(m.procurement_value),
      repayments: acc.repayments + toNumber(m.repayments_received),
    }),
    { revenue: 0, cogs: 0, gross: 0, opex: 0, net: 0, procurement: 0, repayments: 0 },
  )

  // Cycle-level figures for the balance sheet; a balance sheet is a position at
  // a point in time, so it is never filtered by period.
  const assets =
    toNumber(position.cash_at_hand) +
    toNumber(position.cash_in_stock) +
    toNumber(position.inventory_value) +
    toNumber(position.outstanding_receivables) +
    toNumber(position.other_assets)

  const liabilities = toNumber(position.supplier_balance)
  const investorCapital = toNumber(position.capital_introduced)
  const cycleProfit = toNumber(position.net_profit)
  const equity = investorCapital + cycleProfit

  const quarters = Array.from(
    new Set(allMonths.map((m) => `${m.period_year}-Q${Math.ceil(m.period_month / 3)}`)),
  )

  const reportLinks = [
    { label: 'Profit & Loss', slug: 'profit-loss' },
    { label: 'Balance Sheet', slug: 'balance-sheet' },
    { label: 'Cash Flow', slug: 'cash-flow' },
  ]

  return (
    <>
      <PageHeader
        title="Financial reports"
        description={`${cycle.name} · Statements reconcile to the cashbook, inventory and receivables.`}
      />

      <ReportFilters
        months={allMonths.map((m) => ({
          value: `${m.period_year}-${m.period_month}`,
          label: `${MONTH_NAMES[m.period_month - 1]} ${m.period_year}`,
        }))}
        quarters={quarters.map((q) => ({ value: q, label: q.replace('-Q', ' Q') }))}
      />

      <div className="space-y-8">
        {/* --- Profit and loss ----------------------------------------- */}
        <Section
          title="Profit and loss statement"
          description={
            period === 'cycle'
              ? 'For the investment cycle to date'
              : `For the selected ${period}`
          }
          actions={
            <div className="flex gap-2">
              {['xlsx', 'pdf'].map((format) => (
                <Button key={format} asChild variant="outline" size="sm">
                  <Link href={`/api/reports/profit-loss?cycle=${cycleId}&format=${format}`}>
                    <FileDown className="h-4 w-4" />
                    {format.toUpperCase()}
                  </Link>
                </Button>
              ))}
            </div>
          }
        >
          <Card>
            <CardContent className="pt-6">
              <Line label="Murābaḥah sales revenue" value={pl.revenue} />
              <Line label="Cost of goods sold" value={pl.cogs} indent negative />
              <Line label="Gross profit" value={pl.gross} bold />
              <div className="h-3" />
              <Line label="Operating expenses" value={pl.opex} negative />
              <Line
                label={pl.net >= 0 ? 'Net profit' : 'Net loss'}
                value={Math.abs(pl.net)}
                bold
                negative={pl.net < 0}
              />
              <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                Direct procurement costs — freight, customs, clearing — are capitalised into the
                landed cost of each batch and reach the profit and loss statement through cost of
                goods sold. They are never also shown as operating expenses.
              </p>
            </CardContent>
          </Card>
        </Section>

        {/* --- Monthly breakdown ---------------------------------------- */}
        <Section title="Month by month">
          {allMonths.length === 0 ? (
            <EmptyState title="No activity recorded for this cycle yet" />
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Procurement</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">COGS</TableHead>
                    <TableHead className="text-right">Gross profit</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                    <TableHead className="text-right">Net profit</TableHead>
                    <TableHead className="text-right">Repayments</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allMonths.map((m) => (
                    <TableRow key={m.period_start}>
                      <TableCell className="font-medium">{m.period_label}</TableCell>
                      <TableNumeric>{formatNaira(m.procurement_value)}</TableNumeric>
                      <TableNumeric>{formatNaira(m.revenue)}</TableNumeric>
                      <TableNumeric>{formatNaira(m.cost_of_goods_sold)}</TableNumeric>
                      <TableNumeric>{formatNaira(m.gross_profit)}</TableNumeric>
                      <TableNumeric>{formatNaira(m.operating_expenses)}</TableNumeric>
                      <TableNumeric
                        className={toNumber(m.net_profit) < 0 ? 'text-destructive' : 'text-success'}
                      >
                        {formatNaira(m.net_profit)}
                      </TableNumeric>
                      <TableNumeric>{formatNaira(m.repayments_received)}</TableNumeric>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-medium">Cycle to date</TableCell>
                    <TableNumeric>
                      {formatNaira(allMonths.reduce((s, m) => s + toNumber(m.procurement_value), 0))}
                    </TableNumeric>
                    <TableNumeric>
                      {formatNaira(allMonths.reduce((s, m) => s + toNumber(m.revenue), 0))}
                    </TableNumeric>
                    <TableNumeric>
                      {formatNaira(allMonths.reduce((s, m) => s + toNumber(m.cost_of_goods_sold), 0))}
                    </TableNumeric>
                    <TableNumeric>
                      {formatNaira(allMonths.reduce((s, m) => s + toNumber(m.gross_profit), 0))}
                    </TableNumeric>
                    <TableNumeric>
                      {formatNaira(allMonths.reduce((s, m) => s + toNumber(m.operating_expenses), 0))}
                    </TableNumeric>
                    <TableNumeric className="font-semibold">
                      {formatNaira(allMonths.reduce((s, m) => s + toNumber(m.net_profit), 0))}
                    </TableNumeric>
                    <TableNumeric>
                      {formatNaira(allMonths.reduce((s, m) => s + toNumber(m.repayments_received), 0))}
                    </TableNumeric>
                  </TableRow>
                </TableFooter>
              </Table>
            </Card>
          )}
        </Section>

        {/* --- Balance sheet -------------------------------------------- */}
        <Section
          title="Balance sheet"
          description="MaalRise's position right now"
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href={`/api/reports/balance-sheet?cycle=${cycleId}&format=pdf`}>
                <FileDown className="h-4 w-4" />
                PDF
              </Link>
            </Button>
          }
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Assets</CardTitle>
              </CardHeader>
              <CardContent>
                <Line label="Cash at Hand" value={position.cash_at_hand ?? 0} />
                <Line label="Cash in Stock" value={position.cash_in_stock ?? 0} />
                <Line label="Inventory Value" value={position.inventory_value ?? 0} />
                <Line label="Outstanding Receivables" value={position.outstanding_receivables ?? 0} />
                <Line label="Other assets" value={position.other_assets ?? 0} />
                <Line label="Total assets" value={assets} bold />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Liabilities and investment funds</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Liabilities
                </p>
                <Line label="Supplier balances" value={liabilities} />
                <Line label="Total liabilities" value={liabilities} bold />

                <p className="pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Investment funds
                </p>
                <Line label="Investor capital" value={investorCapital} />
                <Line label="Current-cycle profit" value={cycleProfit} />
                <Line label="Total investment funds" value={equity} bold />

                <div className="mt-4 border-t pt-3">
                  <Line
                    label="Liabilities plus investment funds"
                    value={liabilities + equity}
                    bold
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Difference from total assets: {formatNaira(assets - liabilities - equity)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* --- Cash flow ------------------------------------------------- */}
        <Section
          title="Cash flow statement"
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href={`/api/reports/cash-flow?cycle=${cycleId}&format=xlsx`}>
                <FileDown className="h-4 w-4" />
                Excel
              </Link>
            </Button>
          }
        >
          <Card>
            <CardContent className="pt-6">
              <p className="pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Inflows
              </p>
              <Line label="Investor capital received" value={position.capital_introduced ?? 0} indent />
              <Line label="Business repayments received" value={pl.repayments} indent />

              <p className="pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Outflows
              </p>
              <Line label="Procurement spending" value={position.capital_deployed ?? 0} indent negative />
              <Line label="Operating expenses" value={pl.opex} indent negative />

              <Line label="Closing cash balance" value={position.cash_at_hand ?? 0} bold />
            </CardContent>
          </Card>
        </Section>

        {/* --- Reconciliation ------------------------------------------- */}
        <Section
          title="Reconciliation check"
          description="Assets against the cashbook, inventory and receivables. Every line must show zero."
        >
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Check</TableHead>
                  <TableHead className="text-right">Source records</TableHead>
                  <TableHead className="text-right">Reported</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {reconciliation.map((line) => {
                  const clean = Math.abs(toNumber(line.difference)) < 0.005
                  return (
                    <TableRow key={line.line}>
                      <TableCell className="font-medium">{line.line}</TableCell>
                      <TableNumeric>{formatNaira(line.expected)}</TableNumeric>
                      <TableNumeric>{formatNaira(line.actual)}</TableNumeric>
                      <TableNumeric className={clean ? '' : 'font-semibold text-destructive'}>
                        {formatNaira(line.difference)}
                      </TableNumeric>
                      <TableCell>
                        {clean ? (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
        </Section>

        {/* --- Downloads ------------------------------------------------- */}
        <Section title="Download statements">
          <div className="grid gap-3 sm:grid-cols-3">
            {reportLinks.map((r) => (
              <Card key={r.slug}>
                <CardContent className="flex items-center justify-between gap-2 pt-6">
                  <span className="text-sm font-medium">{r.label}</span>
                  <div className="flex gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/api/reports/${r.slug}?cycle=${cycleId}&format=pdf`}>PDF</Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/api/reports/${r.slug}?cycle=${cycleId}&format=xlsx`}>Excel</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>
      </div>
    </>
  )
}
