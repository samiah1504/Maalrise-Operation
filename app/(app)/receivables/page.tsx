import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import { requireRole, requireCycle } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatNaira, toNumber } from '@/lib/money'
import { formatDate } from '@/lib/dates'
import { PageHeader, StatCard } from '@/components/ui/page'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { ListFilters } from '@/components/tables/list-filters'
import { CardList, RecordCard, TableWrap } from '@/components/tables/record-list'
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableNumeric, TableRow,
} from '@/components/ui/table'
import { toneFor } from '@/lib/status'
import type { ReceivableRow } from '@/lib/database.types'

export const metadata = { title: 'Receivables' }

const OPEN_STATUSES = ['approved', 'goods_released', 'active', 'partially_paid', 'overdue']

const BUCKETS = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'due_today', label: 'Due today' },
  { value: 'due_soon', label: 'Due within 7 days' },
  { value: 'due_month', label: 'Due within 30 days' },
  { value: 'paid', label: 'Fully repaid' },
]

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  await requireRole('ceo', 'accounts', 'auditor')
  const cycle = await requireCycle()
  const supabase = await createClient()

  const { data } = await supabase
    .from('v_receivables')
    .select('*')
    .eq('investment_cycle_id', cycle.investment_cycle_id)
    .order('due_date', { nullsFirst: false })

  const all = (data ?? []) as ReceivableRow[]
  const open = all.filter((r) => OPEN_STATUSES.includes(r.status) && toNumber(r.outstanding) > 0)

  const overdue = open.filter((r) => r.days_overdue > 0)
  const dueToday = open.filter((r) => r.days_until_due === 0)
  const dueWeek = open.filter(
    (r) => r.days_until_due !== null && r.days_until_due > 0 && r.days_until_due <= 7,
  )
  const dueMonth = open.filter(
    (r) => r.days_until_due !== null && r.days_until_due > 0 && r.days_until_due <= 30,
  )
  const repaid = all.filter((r) => r.status === 'fully_paid')

  // Filter to the selected bucket.
  const bucket = params.bucket
  let rows =
    bucket === 'overdue' ? overdue
      : bucket === 'due_today' ? dueToday
      : bucket === 'due_soon' ? dueWeek
      : bucket === 'due_month' ? dueMonth
      : bucket === 'paid' ? repaid
      : open

  if (params.q) {
    const q = params.q.toLowerCase()
    rows = rows.filter(
      (r) =>
        r.contract_number.toLowerCase().includes(q) ||
        r.business_name.toLowerCase().includes(q),
    )
  }

  const totalOutstanding = open.reduce((sum, r) => sum + toNumber(r.outstanding), 0)
  const overdueValue = overdue.reduce((sum, r) => sum + toNumber(r.outstanding), 0)

  return (
    <>
      <PageHeader
        title="Receivables"
        description="Amounts owed to MaalRise under approved Murābaḥah contracts. A late payment never increases what is owed."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Due this week" value={String(dueWeek.length + dueToday.length)}
                  href="/receivables?bucket=due_soon" />
        <StatCard label="Due this month" value={String(dueMonth.length + dueToday.length)}
                  href="/receivables?bucket=due_month" />
        <StatCard label="Overdue" value={String(overdue.length)}
                  tone={overdue.length > 0 ? 'negative' : 'muted'}
                  hint={overdue.length ? formatNaira(overdueValue) : undefined}
                  href="/receivables?bucket=overdue" />
        <StatCard label="Fully repaid" value={String(repaid.length)} tone="positive"
                  href="/receivables?bucket=paid" />
        <StatCard label="Total outstanding" money={totalOutstanding} tone="gold" />
      </div>

      <ListFilters
        searchPlaceholder="Search by contract number or business…"
        filters={[{ name: 'bucket', label: 'Buckets', options: BUCKETS }]}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={bucket ? 'Nothing in this bucket' : 'No outstanding receivables'}
          description={
            bucket
              ? 'Try clearing the filter to see all open contracts.'
              : 'Receivables appear here once a Murābaḥah sale is approved.'
          }
        />
      ) : (
        <>
          <CardList>
            {rows.map((r) => (
              <RecordCard
                key={r.murabaha_sale_id}
                href={`/murabaha/${r.murabaha_sale_id}`}
                title={r.contract_number}
                subtitle={r.business_name}
                badge={
                  <Badge tone={toneFor(r.schedule_status)}>
                    {r.days_overdue > 0
                      ? `${r.days_overdue}d overdue`
                      : r.days_until_due === 0
                        ? 'Due today'
                        : `${r.days_until_due}d`}
                  </Badge>
                }
                rows={[
                  { label: 'Selling price', value: formatNaira(r.selling_price) },
                  { label: 'Paid', value: formatNaira(r.amount_paid) },
                  { label: 'Outstanding', value: formatNaira(r.outstanding) },
                  { label: 'Due date', value: formatDate(r.due_date) },
                ]}
              />
            ))}
          </CardList>

          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contract</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Sale date</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead className="text-right">Selling price</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.murabaha_sale_id}>
                    <TableCell>
                      <Link
                        href={`/murabaha/${r.murabaha_sale_id}`}
                        className="font-medium hover:underline"
                      >
                        {r.contract_number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.business_name}</TableCell>
                    <TableCell>{formatDate(r.sale_date)}</TableCell>
                    <TableCell>{formatDate(r.due_date)}</TableCell>
                    <TableNumeric>{formatNaira(r.selling_price)}</TableNumeric>
                    <TableNumeric>{formatNaira(r.amount_paid)}</TableNumeric>
                    <TableNumeric className="font-medium">{formatNaira(r.outstanding)}</TableNumeric>
                    <TableCell>
                      {r.days_overdue > 0 ? (
                        <span className="font-medium text-destructive">
                          {r.days_overdue}d overdue
                        </span>
                      ) : r.days_until_due === null ? (
                        '—'
                      ) : r.days_until_due === 0 ? (
                        <span className="font-medium text-warning">Due today</span>
                      ) : (
                        `in ${r.days_until_due}d`
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.schedule_status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={6} className="font-medium">
                    Total outstanding shown
                  </TableCell>
                  <TableNumeric className="font-semibold">
                    {formatNaira(rows.reduce((sum, r) => sum + toNumber(r.outstanding), 0))}
                  </TableNumeric>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableFooter>
            </Table>
          </TableWrap>
        </>
      )}
    </>
  )
}
