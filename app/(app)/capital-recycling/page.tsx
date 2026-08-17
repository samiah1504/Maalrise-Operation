import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { requireUser, requireCycle } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatNaira, formatNumber, formatPercentValue, toNumber } from '@/lib/money'
import { formatDate } from '@/lib/dates'
import { PageHeader, StatCard } from '@/components/ui/page'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { ListFilters } from '@/components/tables/list-filters'
import { TableWrap } from '@/components/tables/record-list'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumeric, TableRow,
} from '@/components/ui/table'
import type { BatchCapitalCycle, SupplierPerformance } from '@/lib/database.types'

export const metadata = { title: 'Capital Recycling' }

/** The five stages capital passes through on its way back to cash. */
const STAGES = [
  { key: 'procurement_date', label: 'Procurement paid' },
  { key: 'arrival_date', label: 'Goods received' },
  { key: 'sale_date', label: 'Sold under Murābaḥah' },
  { key: 'repayment_date', label: 'Repayment received' },
] as const

function Journey({ batch }: { batch: BatchCapitalCycle }) {
  const reached = STAGES.map((s) => Boolean(batch[s.key as keyof BatchCapitalCycle]))

  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-xs">
      {STAGES.map((stage, i) => {
        const value = batch[stage.key as keyof BatchCapitalCycle] as string | null
        return (
          <li key={stage.key} className="flex items-center gap-1">
            <span
              className={
                reached[i]
                  ? 'rounded-full bg-primary-muted px-2 py-1 font-medium text-primary'
                  : 'rounded-full bg-muted px-2 py-1 text-muted-foreground'
              }
            >
              {stage.label}
              {value ? <span className="ml-1 opacity-70">{formatDate(value)}</span> : null}
            </span>
            {i < STAGES.length - 1 ? (
              <span className="text-muted-foreground" aria-hidden>
                →
              </span>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

export default async function CapitalRecyclingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  await requireUser()
  const cycle = await requireCycle()
  const supabase = await createClient()

  const [{ data }, { data: supplierRows }] = await Promise.all([
    supabase
      .from('v_batch_capital_cycle')
      .select('*')
      .eq('investment_cycle_id', cycle.investment_cycle_id)
      .order('procurement_date', { ascending: false }),
    supabase.from('v_supplier_performance').select('*'),
  ])

  let batches = (data ?? []) as BatchCapitalCycle[]
  const suppliers = (supplierRows ?? []) as SupplierPerformance[]

  if (params.q) {
    const q = params.q.toLowerCase()
    batches = batches.filter(
      (b) =>
        b.batch_number.toLowerCase().includes(q) ||
        (b.supplier_name ?? '').toLowerCase().includes(q),
    )
  }
  if (params.supplier) batches = batches.filter((b) => b.supplier_id === params.supplier)

  const completed = batches.filter((b) => b.repayment_date !== null)
  const deployed = batches.reduce((sum, b) => sum + toNumber(b.cash_deployed), 0)
  const profit = batches.reduce((sum, b) => sum + toNumber(b.gross_profit), 0)
  const redeployable = batches.reduce(
    (sum, b) => sum + toNumber(b.amount_available_for_redeployment),
    0,
  )

  const cycleDays = completed
    .map((b) => b.capital_cycle_days ?? 0)
    .filter((d) => d > 0)
  const avgCycleDays = cycleDays.length
    ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length
    : 0

  // How many times the capital introduced has been turned over.
  const capitalIntroduced = toNumber(cycle.capital_received)
  const recycleCount = capitalIntroduced > 0 ? deployed / capitalIntroduced : 0

  return (
    <>
      <PageHeader
        title="Capital recycling"
        description="The full journey of every naira through each batch, and how quickly it comes back."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Capital deployed" money={deployed} icon={RefreshCw} />
        <StatCard label="Gross profit earned" money={profit} tone="positive" />
        <StatCard
          label="Times capital recycled"
          value={`${recycleCount.toFixed(2)}×`}
          hint={`Against ${formatNaira(capitalIntroduced)} introduced`}
          tone="gold"
        />
        <StatCard
          label="Average cycle length"
          value={avgCycleDays > 0 ? `${Math.round(avgCycleDays)} days` : '—'}
          hint={`${completed.length} completed batch${completed.length === 1 ? '' : 'es'}`}
        />
      </div>

      <ListFilters
        searchPlaceholder="Search by batch or supplier…"
        filters={[
          {
            name: 'supplier',
            label: 'Suppliers',
            options: suppliers.map((s) => ({ value: s.supplier_id, label: s.name })),
          },
        ]}
      />

      {batches.length === 0 ? (
        <EmptyState
          icon={RefreshCw}
          title="No batches to track yet"
          description="Once capital is deployed into a procurement batch, its journey back to cash is tracked here."
        />
      ) : (
        <div className="space-y-6">
          {/* --- Per-batch journeys ------------------------------------- */}
          <div className="space-y-4">
            {batches.map((b) => (
              <Card key={b.procurement_order_id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm">
                        <Link
                          href={`/procurement/${b.procurement_order_id}`}
                          className="hover:underline"
                        >
                          {b.batch_number}
                        </Link>
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">{b.supplier_name ?? '—'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={b.status} />
                      {b.capital_cycle_days !== null ? (
                        <Badge tone="gold">{b.capital_cycle_days} day cycle</Badge>
                      ) : (
                        <Badge tone="neutral">In progress</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Journey batch={b} />

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3 text-sm sm:grid-cols-4">
                    <Metric label="Capital deployed" value={formatNaira(b.cash_deployed)} />
                    <Metric label="Sale value" value={formatNaira(b.murabaha_sale_value)} />
                    <Metric label="Gross profit" value={formatNaira(b.gross_profit)} />
                    <Metric
                      label="Return on capital"
                      value={formatPercentValue(b.return_on_capital_pct)}
                    />
                    <Metric
                      label="Procurement to arrival"
                      value={b.procurement_to_arrival_days !== null ? `${b.procurement_to_arrival_days} days` : '—'}
                    />
                    <Metric
                      label="Arrival to sale"
                      value={b.arrival_to_sale_days !== null ? `${b.arrival_to_sale_days} days` : '—'}
                    />
                    <Metric
                      label="Sale to repayment"
                      value={b.sale_to_repayment_days !== null ? `${b.sale_to_repayment_days} days` : '—'}
                    />
                    <Metric
                      label="Available to redeploy"
                      value={formatNaira(b.amount_available_for_redeployment)}
                    />
                  </dl>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* --- Supplier comparison ------------------------------------ */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold">Which suppliers recycle capital fastest</h2>
            <TableWrap>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Batches</TableHead>
                    <TableHead className="text-right">Purchase value</TableHead>
                    <TableHead className="text-right">Days to arrival</TableHead>
                    <TableHead className="text-right">Capital cycle days</TableHead>
                    <TableHead className="text-right">Gross profit</TableHead>
                    <TableHead className="text-right">Return on capital</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers
                    .filter((s) => s.batch_count > 0)
                    .map((s) => (
                      <TableRow key={s.supplier_id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableNumeric>{formatNumber(s.batch_count)}</TableNumeric>
                        <TableNumeric>{formatNaira(s.total_purchase_value)}</TableNumeric>
                        <TableNumeric>
                          {toNumber(s.avg_days_to_arrival) > 0
                            ? formatNumber(s.avg_days_to_arrival, 1)
                            : '—'}
                        </TableNumeric>
                        <TableNumeric>
                          {toNumber(s.avg_capital_cycle_days) > 0
                            ? formatNumber(s.avg_capital_cycle_days, 1)
                            : '—'}
                        </TableNumeric>
                        <TableNumeric>{formatNaira(s.total_gross_profit)}</TableNumeric>
                        <TableNumeric className="font-medium">
                          {formatPercentValue(s.return_on_capital_pct)}
                        </TableNumeric>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </TableWrap>
          </section>

          <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            Capital available for redeployment across all batches:{' '}
            <strong className="text-foreground">{formatNaira(redeployable)}</strong>. This is money
            already back from the business and ready to be put into new procurement.
          </p>
        </div>
      )}
    </>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular truncate font-medium">{value}</dd>
    </div>
  )
}
