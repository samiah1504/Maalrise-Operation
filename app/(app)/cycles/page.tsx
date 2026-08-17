import Link from 'next/link'
import { CalendarClock } from 'lucide-react'
import { requireUser, can, getCycles } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { formatNaira, formatNumber, toNumber } from '@/lib/money'
import { formatDate } from '@/lib/dates'
import { titleCase } from '@/lib/utils'
import { PageHeader, StatCard } from '@/components/ui/page'
import { StatusBadge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Button } from '@/components/ui/button'
import { RecordDialog } from '@/components/forms/record-dialog'
import { StatusChanger } from '@/components/forms/status-changer'
import { CYCLE } from '@/lib/status'

export const metadata = { title: 'Investment Cycles' }

const STATUSES = [
  'draft', 'subscription_open', 'active', 'approaching_maturity', 'matured',
  'accounts_under_review', 'profit_approved', 'payout_in_progress', 'completed',
] as const

export default async function CyclesPage() {
  const user = await requireUser()
  const [cycles, settings] = await Promise.all([getCycles(), getSettings()])
  const canEdit = can(user.role, 'administer')

  const fields = [
    { name: 'name', label: 'Cycle name', required: true, placeholder: 'MaalRise Cycle 2 (2027)' },
    { name: 'code', label: 'Cycle code', required: true, placeholder: 'MR-CYCLE-2027-01' },
    { name: 'start_date', label: 'Start date', type: 'date' as const, required: true },
    { name: 'maturity_date', label: 'Maturity date', type: 'date' as const, required: true },
    {
      name: 'duration_months', label: 'Duration (months)', type: 'number' as const, required: true,
      hint: 'Investor capital and profit are settled only after this period',
    },
    { name: 'target_capital', label: 'Total target capital (₦)', type: 'number' as const, required: true },
    {
      name: 'status', label: 'Status', type: 'select' as const, required: true,
      options: STATUSES.map((s) => ({ value: s, label: titleCase(s) })),
    },
    { name: 'notes', label: 'Notes', type: 'textarea' as const },
  ]

  const defaultDuration = Number(settings['cycle.default_duration_months'])

  return (
    <>
      <PageHeader
        title="Investment cycles"
        description="Each cycle is settled on its own. Nothing is aggregated across cycles unless a report asks for it."
        actions={
          canEdit ? (
            <RecordDialog
              entity="cycle"
              title="New investment cycle"
              description="Capital raised in a cycle is repaid, with its share of actual profit, only after the cycle matures."
              fields={fields}
              defaultValues={{ duration_months: defaultDuration, status: 'draft', target_capital: 0 }}
            />
          ) : null
        }
      />

      {cycles.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No investment cycles yet"
          description="Create the first 12-month cycle. Every procurement, sale and repayment is recorded against a cycle."
        />
      ) : (
        <div className="space-y-6">
          {cycles.map((c) => {
            const progress = Math.min(100, (c.months_completed / c.duration_months) * 100)
            const funded =
              toNumber(c.target_capital) > 0
                ? (toNumber(c.capital_received) / toNumber(c.target_capital)) * 100
                : 0

            return (
              <Card key={c.investment_cycle_id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{c.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">{c.code}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={c.status} />
                      {canEdit ? (
                        <>
                          <StatusChanger
                            table="investment_cycles"
                            id={c.investment_cycle_id}
                            current={c.status}
                            machine="cycle"
                            revalidate={['/cycles', '/dashboard']}
                          />
                          <RecordDialog
                            entity="cycle"
                            recordId={c.investment_cycle_id}
                            title={`Edit ${c.name}`}
                            fields={fields}
                            defaultValues={c as unknown as Record<string, unknown>}
                            triggerVariant="ghost"
                            triggerSize="sm"
                          />
                        </>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <StatCard label="Target capital" money={c.target_capital} />
                    <StatCard label="Capital received" money={c.capital_received} tone="gold" />
                    <StatCard label="Investors" value={formatNumber(c.investor_count)} />
                    <StatCard label="Units subscribed" value={formatNumber(c.units_subscribed)} />
                    <StatCard label="Total business assets" money={c.total_business_assets} />
                    <StatCard label="Gross profit" money={c.gross_profit} tone="positive" />
                    <StatCard label="Total expenses" money={c.total_expenses} />
                    <StatCard
                      label="Net profit"
                      money={c.net_profit}
                      tone={toNumber(c.net_profit) < 0 ? 'negative' : 'positive'}
                      hint="Provisional until the cycle closes"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Meter
                      label="Cycle progress"
                      caption={`Month ${c.months_completed} of ${c.duration_months} · ${c.months_remaining} remaining`}
                      percent={progress}
                    />
                    <Meter
                      label="Capital raised against target"
                      caption={`${formatNaira(c.capital_received)} of ${formatNaira(c.target_capital)}`}
                      percent={funded}
                      accent="gold"
                    />
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 text-sm sm:grid-cols-4">
                    <Item label="Start date" value={formatDate(c.start_date)} />
                    <Item label="Maturity date" value={formatDate(c.maturity_date)} />
                    <Item label="Duration" value={`${c.duration_months} months`} />
                    <Item label="Cash at hand" value={formatNaira(c.cash_at_hand)} />
                  </dl>

                  {['matured', 'accounts_under_review', 'profit_approved', 'payout_in_progress'].includes(
                    c.status,
                  ) ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gold/40 bg-gold-muted p-3">
                      <p className="text-sm">
                        This cycle has reached maturity. Final profit is determined through the
                        closing process, not from the monthly estimates.
                      </p>
                      <Button asChild size="sm" variant="gold">
                        <Link href="/annual-closing">Open cycle closing</Link>
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}

function Meter({
  label,
  caption,
  percent,
  accent = 'primary',
}: {
  label: string
  caption: string
  percent: number
  accent?: 'primary' | 'gold'
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular text-muted-foreground">{Math.round(percent)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={accent === 'gold' ? 'h-full rounded-full bg-gold' : 'h-full rounded-full bg-primary'}
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
    </div>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular font-medium">{value}</dd>
    </div>
  )
}

export const CYCLE_STATUSES = CYCLE
