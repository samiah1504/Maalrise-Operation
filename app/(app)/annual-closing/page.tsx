import { Archive, Check, Calculator } from 'lucide-react'
import { requireRole, can, requireUser, requireCycle } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { advanceAnnualClosing, computeAnnualClosing } from '@/app/actions/closing'
import { STEP_LABELS, type ClosingStep } from '@/lib/closing-steps'
import { formatNaira, formatNumber, formatPercent, toNumber } from '@/lib/money'
import { formatDateTime } from '@/lib/dates'
import { PageHeader, StatCard, Section, DetailRow } from '@/components/ui/page'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { ConfirmAction } from '@/components/ui/confirm-dialog'
import { TableWrap } from '@/components/tables/record-list'
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableNumeric, TableRow,
} from '@/components/ui/table'
import { ANNUAL_CLOSING_TONE } from '@/lib/status'
import { titleCase } from '@/lib/utils'
import type {
  AnnualClosing, AnnualClosingAllocation, Investor, Profile,
} from '@/lib/database.types'

export const metadata = { title: 'Annual Cycle Closing' }

/** The six review steps, in the order the database enforces. */
const STEPS: { key: ClosingStep; description: string; ceoOnly: boolean }[] = [
  { key: 'accounts_review', description: 'Accounts Officer reviews every transaction in the cycle.', ceoOnly: false },
  { key: 'reconciliation', description: 'Cashbook, inventory and receivables are reconciled to the reported assets.', ceoOnly: false },
  { key: 'management_approval', description: 'The CEO approves the reconciled accounts.', ceoOnly: true },
  { key: 'profit_confirmed', description: 'The CEO confirms the final distributable profit. Only now does the estimate become final.', ceoOnly: true },
  { key: 'investor_allocation', description: 'Profit is allocated to investors pro rata by units held.', ceoOnly: false },
  { key: 'payout_approved', description: 'The CEO approves the payout schedule.', ceoOnly: true },
  { key: 'completed', description: 'The cycle is closed. Nothing further can be posted to it.', ceoOnly: true },
]

export default async function AnnualClosingPage() {
  await requireRole('ceo', 'accounts', 'auditor')
  const user = await requireUser()
  const cycle = await requireCycle()
  const supabase = await createClient()

  const [{ data: closingRow }, { data: profileRows }] = await Promise.all([
    supabase
      .from('annual_closings')
      .select('*')
      .eq('investment_cycle_id', cycle.investment_cycle_id)
      .maybeSingle(),
    supabase.from('profiles').select('id, full_name'),
  ])

  const closing = closingRow as AnnualClosing | null
  const profiles = new Map(
    ((profileRows ?? []) as Pick<Profile, 'id' | 'full_name'>[]).map((p) => [p.id, p.full_name]),
  )

  const [{ data: allocationRows }, { data: investorRows }] = closing
    ? await Promise.all([
        supabase
          .from('annual_closing_allocations')
          .select('*')
          .eq('annual_closing_id', closing.id)
          .order('units', { ascending: false }),
        supabase.from('investors').select('id, full_name, investor_code'),
      ])
    : [{ data: [] }, { data: [] }]

  const allocations = (allocationRows ?? []) as AnnualClosingAllocation[]
  const investors = new Map(
    ((investorRows ?? []) as Pick<Investor, 'id' | 'full_name' | 'investor_code'>[]).map((i) => [
      i.id,
      i,
    ]),
  )

  const canRun = can(user.role, 'manageFinance')
  const isCeo = can(user.role, 'administer')

  const completedSteps = new Set<ClosingStep>()
  if (closing) {
    const order: ClosingStep[] = STEPS.map((s) => s.key)
    const currentIndex = order.indexOf(closing.status as ClosingStep)
    order.slice(0, currentIndex + 1).forEach((s) => completedSteps.add(s))
  }

  const nextStep = closing
    ? STEPS.find((s) => !completedSteps.has(s.key))
    : undefined

  const stepTimestamps: Record<string, { by: string | null; at: string | null }> = closing
    ? {
        accounts_review: { by: closing.accounts_review_by, at: closing.accounts_review_at },
        reconciliation: { by: closing.reconciliation_by, at: closing.reconciliation_at },
        management_approval: { by: closing.management_approval_by, at: closing.management_approval_at },
        profit_confirmed: { by: closing.profit_confirmed_by, at: closing.profit_confirmed_at },
        investor_allocation: { by: closing.allocation_by, at: closing.allocation_at },
        payout_approved: { by: closing.payout_approved_by, at: closing.payout_approved_at },
        completed: { by: null, at: null },
      }
    : {}

  return (
    <>
      <PageHeader
        title="Annual cycle closing"
        description={`${cycle.name} · Monthly profit is an estimate. Final distributable profit only exists after every step below is complete.`}
        actions={
          canRun && (!closing || closing.status === 'draft') ? (
            <ConfirmAction
              title="Compute closing figures"
              description="Pulls together capital, procurement spending, sales, repayments, closing balances, profit and the investor profit pool for this cycle."
              confirmLabel="Compute figures"
              triggerLabel={closing ? 'Recompute figures' : 'Start cycle closing'}
              triggerIcon={<Calculator className="h-4 w-4" />}
              reasonPlaceholder="e.g. Cycle reached maturity, beginning closing process"
              action={(reason) => computeAnnualClosing(cycle.investment_cycle_id, reason)}
            />
          ) : null
        }
      />

      {!closing ? (
        <EmptyState
          icon={Archive}
          title="Closing not started"
          description="When the cycle reaches maturity, compute the closing figures to begin the six-step review that determines final investor profit."
        />
      ) : (
        <div className="space-y-8">
          <Card className="border-gold/40">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
              <div>
                <p className="text-sm font-medium">Current stage</p>
                <p className="text-sm text-muted-foreground">
                  {STEP_LABELS[closing.status as ClosingStep] ?? titleCase(closing.status)}
                </p>
              </div>
              <Badge tone={ANNUAL_CLOSING_TONE[closing.status] ?? 'neutral'}>
                {titleCase(closing.status)}
              </Badge>
            </CardContent>
          </Card>

          {/* --- Closing figures (brief §22) ----------------------------- */}
          <Section title="Closing figures">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Total capital received" money={closing.total_capital_received} />
              <StatCard label="Total procurement spending" money={closing.total_procurement_spend} />
              <StatCard label="Total Murābaḥah sales" money={closing.total_murabaha_sales} />
              <StatCard label="Total repayments received" money={closing.total_repayments_received} />
              <StatCard label="Outstanding receivables" money={closing.total_outstanding_receivables} />
              <StatCard label="Closing cash" money={closing.closing_cash} />
              <StatCard label="Closing cash in stock" money={closing.closing_cash_in_stock} />
              <StatCard label="Closing inventory" money={closing.closing_inventory} />
              <StatCard label="Gross profit" money={closing.gross_profit} tone="positive" />
              <StatCard label="Total expenses" money={closing.total_expenses} />
              <StatCard
                label="Net profit"
                money={closing.net_profit}
                tone={toNumber(closing.net_profit) < 0 ? 'negative' : 'positive'}
              />
              <StatCard
                label="Investor profit pool"
                money={closing.investor_profit_pool}
                tone="gold"
                hint={`${formatPercent(closing.profit_sharing_ratio, 0)} of net profit`}
              />
              <StatCard label="MaalRise profit share" money={closing.maalrise_profit_share} />
              <StatCard label="Capital repayment" money={closing.capital_repayment} />
              <StatCard
                label="Total investor payout"
                money={closing.total_investor_payout}
                tone="gold"
              />
            </div>
          </Section>

          {/* --- The six steps ------------------------------------------- */}
          <Section
            title="Closing process"
            description="Each step is recorded with who performed it and when. The steps must be taken in order."
          >
            <div className="space-y-3">
              {STEPS.map((step) => {
                const done = completedSteps.has(step.key)
                const isNext = nextStep?.key === step.key
                const stamp = stepTimestamps[step.key]
                const blocked = step.ceoOnly && !isCeo

                return (
                  <Card key={step.key} className={isNext ? 'border-gold/50' : undefined}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className={
                            done
                              ? 'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-success text-success-foreground'
                              : 'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground'
                          }
                        >
                          {done ? <Check className="h-3.5 w-3.5" /> : null}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium">{STEP_LABELS[step.key]}</p>
                          <p className="text-sm text-muted-foreground">{step.description}</p>
                          {done && stamp?.at ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {profiles.get(stamp.by ?? '') ?? 'Staff'} ·{' '}
                              {formatDateTime(stamp.at)}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {isNext && canRun ? (
                        blocked ? (
                          <Badge tone="warning">CEO only</Badge>
                        ) : (
                          <ConfirmAction
                            title={STEP_LABELS[step.key]}
                            description={step.description}
                            confirmLabel="Record this step"
                            triggerLabel="Record step"
                            triggerVariant={step.ceoOnly ? 'gold' : 'default'}
                            triggerSize="sm"
                            reasonPlaceholder="e.g. All transactions reviewed against source documents"
                            action={(reason) =>
                              advanceAnnualClosing(cycle.investment_cycle_id, step.key, reason)
                            }
                          />
                        )
                      ) : null}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </Section>

          {/* --- Investor allocation -------------------------------------- */}
          {allocations.length > 0 ? (
            <Section
              title="Investor payout schedule"
              description="Profit allocated pro rata by units held. Capital is repaid in full alongside it."
            >
              <TableWrap>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Investor</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Capital</TableHead>
                      <TableHead className="text-right">Profit allocation</TableHead>
                      <TableHead className="text-right">Total payout</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allocations.map((a) => {
                      const investor = investors.get(a.investor_id)
                      return (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">
                            {investor?.full_name ?? '—'}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {investor?.investor_code ?? '—'}
                          </TableCell>
                          <TableNumeric>{formatNumber(a.units)}</TableNumeric>
                          <TableNumeric>{formatNaira(a.capital)}</TableNumeric>
                          <TableNumeric>{formatNaira(a.profit_allocation)}</TableNumeric>
                          <TableNumeric className="font-semibold">
                            {formatNaira(a.total_payout)}
                          </TableNumeric>
                          <TableCell>
                            <Badge tone={a.status === 'paid' ? 'success' : 'warning'}>
                              {titleCase(a.status)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2} className="font-medium">
                        Total
                      </TableCell>
                      <TableNumeric>
                        {formatNumber(allocations.reduce((s, a) => s + a.units, 0))}
                      </TableNumeric>
                      <TableNumeric>
                        {formatNaira(allocations.reduce((s, a) => s + toNumber(a.capital), 0))}
                      </TableNumeric>
                      <TableNumeric>
                        {formatNaira(
                          allocations.reduce((s, a) => s + toNumber(a.profit_allocation), 0),
                        )}
                      </TableNumeric>
                      <TableNumeric className="font-semibold">
                        {formatNaira(allocations.reduce((s, a) => s + toNumber(a.total_payout), 0))}
                      </TableNumeric>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                </Table>
              </TableWrap>
            </Section>
          ) : null}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Profit sharing</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <DetailRow label="Investor share of net profit">
                  {formatPercent(closing.profit_sharing_ratio, 0)}
                </DetailRow>
                <DetailRow label="MaalRise share of net profit">
                  {formatPercent(1 - toNumber(closing.profit_sharing_ratio), 0)}
                </DetailRow>
              </dl>
              <p className="mt-4 rounded-md bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                The system does not treat estimated monthly profit as final profit. Final
                distributable profit exists only after accounts review, reconciliation, management
                approval and profit confirmation have all been recorded above.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
