import { ClipboardCheck, Lock, Unlock } from 'lucide-react'
import { requireRole, can, requireUser, requireCycle } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { closeMonth, reopenMonth } from '@/app/actions/closing'
import { formatNaira, toNumber } from '@/lib/money'
import { formatDateTime, MONTH_NAMES } from '@/lib/dates'
import { PageHeader, StatCard } from '@/components/ui/page'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { ConfirmAction } from '@/components/ui/confirm-dialog'
import { TableWrap } from '@/components/tables/record-list'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumeric, TableRow,
} from '@/components/ui/table'
import { CLOSING_TONE } from '@/lib/status'
import type { MonthlyClosing, MonthlyPL, Profile } from '@/lib/database.types'

export const metadata = { title: 'Monthly Closing' }

export default async function MonthlyClosingPage() {
  await requireRole('ceo', 'accounts', 'auditor')
  const user = await requireUser()
  const cycle = await requireCycle()
  const supabase = await createClient()

  const [{ data: closingRows }, { data: monthRows }, { data: profileRows }] = await Promise.all([
    supabase
      .from('monthly_closings')
      .select('*')
      .eq('investment_cycle_id', cycle.investment_cycle_id),
    supabase
      .from('v_monthly_pl')
      .select('*')
      .eq('investment_cycle_id', cycle.investment_cycle_id)
      .order('period_start'),
    supabase.from('profiles').select('id, full_name'),
  ])

  const closings = (closingRows ?? []) as MonthlyClosing[]
  const months = (monthRows ?? []) as MonthlyPL[]
  const profiles = new Map(
    ((profileRows ?? []) as Pick<Profile, 'id' | 'full_name'>[]).map((p) => [p.id, p.full_name]),
  )

  const closingFor = new Map(closings.map((c) => [`${c.period_year}-${c.period_month}`, c]))
  const canClose = can(user.role, 'manageFinance')
  const isCeo = can(user.role, 'administer')

  // Periods must be closed in order, so only the earliest open month is actionable.
  const today = new Date()
  const closeable = months.filter((m) => {
    const end = new Date(m.period_year, m.period_month, 0)
    return end < today
  })
  const nextToClose = closeable.find(
    (m) => closingFor.get(`${m.period_year}-${m.period_month}`)?.status !== 'closed',
  )

  const closed = closings.filter((c) => c.status === 'closed')

  return (
    <>
      <PageHeader
        title="Monthly closing"
        description="Locking a month stops back-dated postings into it. Only the CEO can reopen a closed period, and the reason is recorded."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Months closed" value={`${closed.length} of ${months.length}`} />
        <StatCard
          label="Next period to close"
          value={
            nextToClose
              ? `${MONTH_NAMES[nextToClose.period_month - 1].slice(0, 3)} ${nextToClose.period_year}`
              : 'Up to date'
          }
          tone={nextToClose ? 'gold' : 'positive'}
        />
        <StatCard
          label="Profit closed to date"
          money={closed.reduce((sum, c) => sum + toNumber(c.net_profit), 0)}
        />
        <StatCard
          label="Cash at last close"
          money={closed.length ? closed[closed.length - 1].closing_cash : 0}
        />
      </div>

      {months.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Nothing to close yet"
          description="Periods appear here once the cycle has started and transactions have been recorded."
        />
      ) : (
        <>
          {nextToClose && canClose ? (
            <Card className="mb-5 border-gold/40 bg-gold-muted">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                <div className="text-sm">
                  <p className="font-medium">
                    {MONTH_NAMES[nextToClose.period_month - 1]} {nextToClose.period_year} is open
                  </p>
                  <p className="text-muted-foreground">
                    Net profit {formatNaira(nextToClose.net_profit)} · revenue{' '}
                    {formatNaira(nextToClose.revenue)} · expenses{' '}
                    {formatNaira(nextToClose.operating_expenses)}
                  </p>
                </div>
                <ConfirmAction
                  title={`Close ${MONTH_NAMES[nextToClose.period_month - 1]} ${nextToClose.period_year}`}
                  description="The month's figures are frozen into a closing record. After this, posting into the period requires a CEO override."
                  confirmLabel="Close the period"
                  triggerLabel="Close period"
                  triggerVariant="gold"
                  triggerIcon={<Lock className="h-4 w-4" />}
                  reasonPlaceholder="e.g. Accounts reconciled and reviewed for the month"
                  action={closeMonth.bind(null, cycle.investment_cycle_id, nextToClose.period_year, nextToClose.period_month)}
                />
              </CardContent>
            </Card>
          ) : null}

          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Procurement</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Repayments</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Net profit</TableHead>
                  <TableHead className="text-right">Closing cash</TableHead>
                  <TableHead>Status</TableHead>
                  {canClose ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map((m) => {
                  const closing = closingFor.get(`${m.period_year}-${m.period_month}`)
                  const isClosed = closing?.status === 'closed'
                  const label = `${MONTH_NAMES[m.period_month - 1]} ${m.period_year}`

                  return (
                    <TableRow key={m.period_start}>
                      <TableCell className="font-medium">{label}</TableCell>
                      <TableNumeric>{formatNaira(m.procurement_value)}</TableNumeric>
                      <TableNumeric>{formatNaira(m.revenue)}</TableNumeric>
                      <TableNumeric>{formatNaira(m.repayments_received)}</TableNumeric>
                      <TableNumeric>{formatNaira(m.operating_expenses)}</TableNumeric>
                      <TableNumeric
                        className={toNumber(m.net_profit) < 0 ? 'text-destructive' : 'text-success'}
                      >
                        {formatNaira(m.net_profit)}
                      </TableNumeric>
                      <TableNumeric>
                        {closing ? formatNaira(closing.closing_cash) : '—'}
                      </TableNumeric>
                      <TableCell>
                        <Badge tone={CLOSING_TONE[closing?.status ?? 'open'] ?? 'neutral'}>
                          {closing?.status ? closing.status.replace(/_/g, ' ') : 'open'}
                        </Badge>
                        {closing?.closed_at ? (
                          <span className="block text-xs text-muted-foreground">
                            {formatDateTime(closing.closed_at)} ·{' '}
                            {profiles.get(closing.closed_by ?? '') ?? 'staff'}
                          </span>
                        ) : null}
                        {closing?.reopen_reason ? (
                          <span className="block text-xs text-warning">
                            Reopened: {closing.reopen_reason}
                          </span>
                        ) : null}
                      </TableCell>
                      {canClose ? (
                        <TableCell className="text-right">
                          {isClosed && isCeo ? (
                            <ConfirmAction
                              title={`Reopen ${label}`}
                              description="Reopening allows back-dated postings into a period that has already been reported. The reason is recorded permanently."
                              confirmLabel="Reopen period"
                              triggerLabel="Reopen"
                              triggerVariant="ghost"
                              triggerSize="sm"
                              triggerIcon={<Unlock className="h-4 w-4" />}
                              destructive
                              reasonPlaceholder="e.g. Late supplier invoice must be posted to this month"
                              action={reopenMonth.bind(null, closing.id)}
                            />
                          ) : !isClosed && m === nextToClose ? (
                            <ConfirmAction
                              title={`Close ${label}`}
                              description="The month's figures are frozen into a closing record."
                              confirmLabel="Close the period"
                              triggerLabel="Close"
                              triggerSize="sm"
                              reasonPlaceholder="e.g. Accounts reconciled and reviewed"
                              action={closeMonth.bind(null, cycle.investment_cycle_id, m.period_year, m.period_month)}
                            />
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableWrap>

          <p className="mt-4 text-sm text-muted-foreground">
            Periods must be closed in order. Figures shown for open months are live and will move as
            transactions are recorded.
          </p>
        </>
      )}
    </>
  )
}
