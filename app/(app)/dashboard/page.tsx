import Link from 'next/link'
import {
  AlertTriangle, Banknote, Boxes, CalendarClock, Clock, Package, Ship, TrendingUp,
  Truck, Wallet, Warehouse,
} from 'lucide-react'
import { requireUser, getSelectedCycle } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatNaira, formatNumber, toNumber } from '@/lib/money'
import { formatDate } from '@/lib/dates'
import { PageHeader, StatCard, Section } from '@/components/ui/page'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Button } from '@/components/ui/button'
import {
  AssetDistribution, BatchPerformanceChart, MonthlyBarChart, NetProfitChart,
  RepaymentTrendChart,
} from '@/components/charts/charts'
import type {
  BatchCapitalCycle, CycleSummary, FinancialPosition, MonthlyPL, ProcurementPipeline,
  ReceivableRow,
} from '@/lib/database.types'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const user = await requireUser()
  const cycle = await getSelectedCycle()

  if (!cycle) {
    return (
      <>
        <PageHeader title={`Welcome, ${user.profile.full_name.split(' ')[0]}`} />
        <EmptyState
          icon={CalendarClock}
          title="No investment cycle yet"
          description="MaalRise tracks everything against a 12-month investment cycle. Create the first one to begin."
          action={
            <Button asChild>
              <Link href="/cycles">Set up an investment cycle</Link>
            </Button>
          }
        />
      </>
    )
  }

  const supabase = await createClient()
  const cycleId = cycle.investment_cycle_id

  const [position, pipeline, monthly, receivables, batches, summary] = await Promise.all([
    supabase.from('v_financial_position').select('*').eq('investment_cycle_id', cycleId).maybeSingle(),
    supabase.from('v_procurement_pipeline').select('*').eq('investment_cycle_id', cycleId).maybeSingle(),
    supabase.from('v_monthly_pl').select('*').eq('investment_cycle_id', cycleId).order('period_start'),
    supabase.from('v_receivables').select('*').eq('investment_cycle_id', cycleId),
    supabase
      .from('v_batch_capital_cycle')
      .select('*')
      .eq('investment_cycle_id', cycleId)
      .order('gross_profit', { ascending: false })
      .limit(8),
    supabase.from('v_cycle_summary').select('*').eq('investment_cycle_id', cycleId).maybeSingle(),
  ])

  const p = (position.data ?? {}) as Partial<FinancialPosition>
  const pipe = (pipeline.data ?? {}) as Partial<ProcurementPipeline>
  const pl = (monthly.data ?? []) as MonthlyPL[]
  const rec = (receivables.data ?? []) as ReceivableRow[]
  const batchRows = (batches.data ?? []) as BatchCapitalCycle[]
  const cyc = (summary.data ?? cycle) as CycleSummary

  // --- Receivables buckets (brief §4) ---------------------------------------
  const open = rec.filter((r) =>
    ['approved', 'goods_released', 'active', 'partially_paid', 'overdue'].includes(r.status),
  )
  const dueThisWeek = open.filter(
    (r) => r.days_until_due !== null && r.days_until_due >= 0 && r.days_until_due <= 7,
  )
  const dueThisMonth = open.filter(
    (r) => r.days_until_due !== null && r.days_until_due >= 0 && r.days_until_due <= 30,
  )
  const overdue = open.filter((r) => r.days_overdue > 0)
  const fullyRepaid = rec.filter((r) => r.status === 'fully_paid')
  const totalOutstanding = open.reduce((sum, r) => sum + toNumber(r.outstanding), 0)

  const thisMonth = pl.at(-1)
  const chartData = pl.map((row) => ({
    period_label: row.period_label,
    procurement_value: toNumber(row.procurement_value),
    revenue: toNumber(row.revenue),
    repayments_received: toNumber(row.repayments_received),
    operating_expenses: toNumber(row.operating_expenses),
    net_profit: toNumber(row.net_profit),
  }))

  const cumulativeProfit = pl.reduce((sum, row) => sum + toNumber(row.net_profit), 0)

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.profile.full_name.split(' ')[0]}`}
        description={`${cycle.name} · Month ${cyc.months_completed + 1} of ${cyc.duration_months}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/financial-reports">Financial reports</Link>
          </Button>
        }
      />

      <div className="space-y-8">
        {/* ---- Financial overview -------------------------------------- */}
        <Section
          title="Financial overview"
          description="Where every naira belonging to MaalRise is sitting right now."
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Cash at Hand" money={p.cash_at_hand} icon={Wallet} href="/cashbook" />
            <StatCard label="Cash in Stock" money={p.cash_in_stock} icon={Ship} href="/procurement"
                      hint="Paid for, not yet received" />
            <StatCard label="Inventory Value" money={p.inventory_value} icon={Warehouse} href="/inventory" />
            <StatCard label="Outstanding Receivables" money={p.outstanding_receivables}
                      icon={Banknote} href="/receivables" />
            <StatCard label="Total Business Assets" money={p.total_business_assets}
                      tone="gold" icon={TrendingUp} />
            <StatCard label="Total Murābaḥah Sales" money={p.total_murabaha_sales} href="/murabaha" />
            <StatCard label="Estimated Gross Profit" money={p.gross_profit} tone="positive" />
            <StatCard
              label="Net Profit"
              money={p.net_profit}
              tone={toNumber(p.net_profit) < 0 ? 'negative' : 'positive'}
              hint="Provisional"
            />
            <StatCard label="Total Expenses" money={p.total_expenses} href="/expenses" />
            <StatCard label="Repayments This Month" money={thisMonth?.repayments_received ?? 0}
                      href="/repayments" />
            <StatCard label="Capital Introduced" money={p.capital_introduced} href="/investors" />
            <StatCard label="Supplier Balances Owed" money={p.supplier_balance}
                      tone="muted" hint="A liability, not an asset" />
          </div>
        </Section>

        {/* ---- Asset distribution --------------------------------------- */}
        <AssetDistribution
          cashAtHand={toNumber(p.cash_at_hand)}
          cashInStock={toNumber(p.cash_in_stock)}
          inventory={toNumber(p.inventory_value)}
          receivables={toNumber(p.outstanding_receivables)}
          otherAssets={toNumber(p.other_assets)}
        />

        {/* ---- Procurement overview ------------------------------------- */}
        <Section title="Procurement overview">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="New Orders" value={formatNumber(pipe.new_orders ?? 0)} icon={Package} href="/procurement" />
            <StatCard label="In Production" value={formatNumber(pipe.in_production ?? 0)} href="/procurement?status=in_production" />
            <StatCard label="Ready for Shipment" value={formatNumber(pipe.ready_for_shipment ?? 0)} href="/procurement?status=ready_for_shipment" />
            <StatCard label="Goods in Transit" value={formatNumber(pipe.in_transit ?? 0)} icon={Truck} href="/shipments" />
            <StatCard label="Goods at Port" value={formatNumber(pipe.at_port ?? 0)} href="/procurement?status=at_port" />
            <StatCard label="Awaiting Clearing" value={formatNumber(pipe.awaiting_clearing ?? 0)} href="/procurement?status=clearing" />
            <StatCard label="Goods Received" value={formatNumber(pipe.received ?? 0)} href="/goods-receipts" />
            <StatCard
              label="Delayed Orders"
              value={formatNumber(pipe.delayed ?? 0)}
              tone={(pipe.delayed ?? 0) > 0 ? 'negative' : 'muted'}
              icon={AlertTriangle}
              href="/operational-reports"
            />
          </div>
        </Section>

        {/* ---- Receivables overview -------------------------------------- */}
        <Section
          title="Receivables overview"
          description="Murābaḥah amounts owed by the operating business."
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/receivables">View all</Link>
            </Button>
          }
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="Due This Week" value={formatNumber(dueThisWeek.length)} icon={Clock} />
            <StatCard label="Due This Month" value={formatNumber(dueThisMonth.length)} />
            <StatCard
              label="Overdue"
              value={formatNumber(overdue.length)}
              tone={overdue.length > 0 ? 'negative' : 'muted'}
            />
            <StatCard label="Fully Repaid" value={formatNumber(fullyRepaid.length)} tone="positive" />
            <StatCard label="Total Outstanding" money={totalOutstanding} />
          </div>

          {overdue.length > 0 ? (
            <Card className="border-destructive/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  {overdue.length} overdue contract{overdue.length === 1 ? '' : 's'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {overdue.slice(0, 4).map((r) => (
                  <Link
                    key={r.murabaha_sale_id}
                    href={`/murabaha/${r.murabaha_sale_id}`}
                    className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm hover:bg-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.contract_number}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {r.business_name} · due {formatDate(r.due_date)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="tabular block font-medium">{formatNaira(r.outstanding)}</span>
                      <Badge tone="danger">{r.days_overdue}d overdue</Badge>
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </Section>

        {/* ---- Investment cycle overview --------------------------------- */}
        <Section title="Investment cycle overview">
          <Card>
            <CardContent className="grid grid-cols-2 gap-x-4 gap-y-4 pt-6 sm:grid-cols-4">
              <Detail label="Current cycle" value={cyc.name} />
              <Detail label="Cycle code" value={cyc.code} />
              <Detail label="Start date" value={formatDate(cyc.start_date)} />
              <Detail label="Maturity date" value={formatDate(cyc.maturity_date)} />
              <Detail label="Months completed" value={`${cyc.months_completed} of ${cyc.duration_months}`} />
              <Detail label="Months remaining" value={String(cyc.months_remaining)} />
              <Detail label="Total capital introduced" value={formatNaira(cyc.capital_received)} />
              <Detail
                label="Cumulative estimated profit"
                value={formatNaira(cumulativeProfit)}
              />
              <div className="col-span-2 sm:col-span-4">
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Cycle progress</span>
                  <span>
                    {Math.round((cyc.months_completed / cyc.duration_months) * 100)}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.min(100, (cyc.months_completed / cyc.duration_months) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* ---- Charts ----------------------------------------------------- */}
        <Section title="Trends">
          <div className="grid gap-4 lg:grid-cols-2">
            <MonthlyBarChart
              title="Monthly procurements"
              description="Value of goods purchased from suppliers each month."
              data={chartData}
              dataKey="procurement_value"
              seriesName="Procurement"
            />
            <MonthlyBarChart
              title="Monthly Murābaḥah sales"
              description="Selling price of goods sold to the operating business."
              data={chartData}
              dataKey="revenue"
              seriesName="Sales"
              accent="gold"
            />
            <RepaymentTrendChart data={chartData} />
            <MonthlyBarChart
              title="Monthly operating expenses"
              description="Direct procurement costs are capitalised into landed cost, so they are not shown here."
              data={chartData}
              dataKey="operating_expenses"
              seriesName="Expenses"
            />
            <NetProfitChart data={chartData} />
            <BatchPerformanceChart
              data={batchRows
                .filter((b) => toNumber(b.gross_profit) !== 0)
                .map((b) => ({
                  batch_number: b.batch_number,
                  gross_profit: toNumber(b.gross_profit),
                  return_on_capital_pct: toNumber(b.return_on_capital_pct),
                  capital_cycle_days: b.capital_cycle_days,
                }))}
            />
          </div>
        </Section>
      </div>
    </>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular truncate font-medium">{value}</p>
    </div>
  )
}
