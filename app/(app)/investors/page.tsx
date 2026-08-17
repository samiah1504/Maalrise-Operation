import Link from 'next/link'
import { FileDown, Users } from 'lucide-react'
import { requireRole, can, requireUser, requireCycle } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { createClient } from '@/lib/supabase/server'
import { formatNaira, formatNumber, toNumber } from '@/lib/money'
import { formatDate } from '@/lib/dates'
import { titleCase } from '@/lib/utils'
import { PageHeader, StatCard } from '@/components/ui/page'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Button } from '@/components/ui/button'
import { ListFilters, enumFilter } from '@/components/tables/list-filters'
import { CardList, RecordCard, TableWrap } from '@/components/tables/record-list'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumeric, TableRow,
} from '@/components/ui/table'
import { RecordDialog } from '@/components/forms/record-dialog'
import { RecordCapitalDialog, SubscriptionDialog } from '@/components/forms/investor-forms'
import type { BankAccount, Investor, InvestorSubscription } from '@/lib/database.types'

export const metadata = { title: 'Investors' }

const CATEGORIES = ['new_investor', 'current_investor'] as const
const STATUSES = [
  'pending_confirmation', 'active', 'matured', 'payout_pending', 'paid', 'cancelled',
] as const

const FIELDS = [
  { name: 'full_name', label: 'Full name', required: true },
  { name: 'phone', label: 'Phone number', type: 'tel' as const },
  { name: 'email', label: 'Email address', type: 'email' as const },
  {
    name: 'category', label: 'Investor category', type: 'select' as const, required: true,
    options: CATEGORIES.map((c) => ({ value: c, label: titleCase(c) })),
    hint: 'New investors have a higher minimum unit requirement',
  },
  {
    name: 'status', label: 'Status', type: 'select' as const, required: true,
    options: STATUSES.map((s) => ({ value: s, label: titleCase(s) })),
  },
  { name: 'address', label: 'Address', type: 'textarea' as const },
  { name: 'notes', label: 'Notes', type: 'textarea' as const },
]

export default async function InvestorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  await requireRole('ceo', 'accounts', 'auditor')
  const user = await requireUser()
  const cycle = await requireCycle()
  const settings = await getSettings()
  const supabase = await createClient()

  let query = supabase.from('investors').select('*')
  if (params.q) {
    query = query.or(
      `full_name.ilike.%${params.q}%,investor_code.ilike.%${params.q}%,email.ilike.%${params.q}%,phone.ilike.%${params.q}%`,
    )
  }
  if (params.category) query = query.eq('category', params.category as Investor['category'])
  if (params.status) query = query.eq('status', params.status as Investor['status'])

  const [{ data: investorRows }, { data: subscriptionRows }, { data: accountRows }] =
    await Promise.all([
      query.order('full_name'),
      supabase
        .from('investor_subscriptions')
        .select('*')
        .eq('investment_cycle_id', cycle.investment_cycle_id),
      supabase.from('bank_accounts').select('id, name').eq('is_active', true).order('name'),
    ])

  const investors = (investorRows ?? []) as Investor[]
  const subscriptions = (subscriptionRows ?? []) as InvestorSubscription[]
  const accounts = (accountRows ?? []) as Pick<BankAccount, 'id' | 'name'>[]
  const canEdit = can(user.role, 'manageFinance')

  const byInvestor = new Map<string, InvestorSubscription[]>()
  for (const s of subscriptions) {
    byInvestor.set(s.investor_id, [...(byInvestor.get(s.investor_id) ?? []), s])
  }

  const unitPrice = Number(settings['investor.unit_price'])
  const totalUnits = subscriptions.reduce((sum, s) => sum + s.units, 0)
  const totalSubscribed = subscriptions.reduce((sum, s) => sum + toNumber(s.total_amount), 0)
  const totalReceived = subscriptions
    .filter((s) => s.capital_recorded)
    .reduce((sum, s) => sum + toNumber(s.total_amount), 0)
  const awaiting = subscriptions.filter((s) => !s.capital_recorded)

  return (
    <>
      <PageHeader
        title="Investors"
        description={`Internal records for ${cycle.name}. Investors do not log in — staff maintain these records and generate their reports.`}
        actions={
          canEdit ? (
            <>
              <RecordDialog
                entity="investor"
                title="Add investor"
                fields={FIELDS}
                defaultValues={{ category: 'new_investor', status: 'pending_confirmation' }}
                triggerVariant="outline"
              />
              <SubscriptionDialog
                investors={investors.map((i) => ({
                  id: i.id,
                  full_name: i.full_name,
                  category: i.category,
                }))}
                cycleId={cycle.investment_cycle_id}
                cycleName={cycle.name}
                unitPrice={unitPrice}
                minNew={Number(settings['investor.min_units_new'])}
                minCurrent={Number(settings['investor.min_units_current'])}
              />
            </>
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Investors in cycle" value={formatNumber(byInvestor.size)} />
        <StatCard label="Units subscribed" value={formatNumber(totalUnits)}
                  hint={`${formatNaira(unitPrice)} per unit`} />
        <StatCard label="Total subscribed" money={totalSubscribed} />
        <StatCard label="Capital received" money={totalReceived} tone="gold"
                  hint={awaiting.length ? `${awaiting.length} awaiting confirmation` : 'All confirmed'} />
      </div>

      <ListFilters
        searchPlaceholder="Search by name, investor code, email or phone…"
        filters={[
          enumFilter('category', 'Category', CATEGORIES),
          enumFilter('status', 'Status', STATUSES),
        ]}
      />

      {investors.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No investors yet"
          description="Add investors and record their unit subscriptions. Each investor is given a short, non-guessable code automatically."
        />
      ) : (
        <>
          <CardList>
            {investors.map((i) => {
              const subs = byInvestor.get(i.id) ?? []
              const units = subs.reduce((sum, s) => sum + s.units, 0)
              const amount = subs.reduce((sum, s) => sum + toNumber(s.total_amount), 0)
              const pending = subs.find((s) => !s.capital_recorded)

              return (
                <RecordCard
                  key={i.id}
                  title={i.full_name}
                  subtitle={i.investor_code}
                  badge={<StatusBadge status={i.status} />}
                  rows={[
                    { label: 'Category', value: titleCase(i.category) },
                    { label: 'Units', value: formatNumber(units) },
                    { label: 'Total invested', value: formatNaira(amount) },
                    { label: 'Phone', value: i.phone ?? '—' },
                  ]}
                  footer={
                    canEdit ? (
                      <div className="flex flex-wrap gap-2">
                        {pending ? (
                          <RecordCapitalDialog
                            subscriptionId={pending.id}
                            investorName={i.full_name}
                            amount={pending.total_amount}
                            accounts={accounts}
                          />
                        ) : null}
                        <RecordDialog
                          entity="investor"
                          recordId={i.id}
                          title={`Edit ${i.full_name}`}
                          fields={FIELDS}
                          defaultValues={i as unknown as Record<string, unknown>}
                          triggerVariant="outline"
                          triggerSize="sm"
                        />
                      </div>
                    ) : null
                  }
                />
              )
            })}
          </CardList>

          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Investor</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Total invested</TableHead>
                  <TableHead>Payment date</TableHead>
                  <TableHead>Capital</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {investors.map((i) => {
                  const subs = byInvestor.get(i.id) ?? []
                  const units = subs.reduce((sum, s) => sum + s.units, 0)
                  const amount = subs.reduce((sum, s) => sum + toNumber(s.total_amount), 0)
                  const pending = subs.find((s) => !s.capital_recorded)
                  const paid = subs.length > 0 && !pending

                  return (
                    <TableRow key={i.id}>
                      <TableCell>
                        <span className="block font-medium">{i.full_name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {i.email ?? i.phone ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{i.investor_code}</TableCell>
                      <TableCell>
                        <Badge tone={i.category === 'new_investor' ? 'info' : 'gold'}>
                          {i.category === 'new_investor' ? 'New' : 'Current'}
                        </Badge>
                      </TableCell>
                      <TableNumeric>{units ? formatNumber(units) : '—'}</TableNumeric>
                      <TableNumeric>{amount ? formatNaira(amount) : '—'}</TableNumeric>
                      <TableCell>{formatDate(subs[0]?.payment_date)}</TableCell>
                      <TableCell>
                        {subs.length === 0 ? (
                          <span className="text-muted-foreground">No subscription</span>
                        ) : paid ? (
                          <Badge tone="success">Received</Badge>
                        ) : (
                          <Badge tone="warning">Awaiting</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={i.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {canEdit ? (
                          <div className="flex justify-end gap-1">
                            {pending ? (
                              <RecordCapitalDialog
                                subscriptionId={pending.id}
                                investorName={i.full_name}
                                amount={pending.total_amount}
                                accounts={accounts}
                              />
                            ) : null}
                            <RecordDialog
                              entity="investor"
                              recordId={i.id}
                              title={`Edit ${i.full_name}`}
                              fields={FIELDS}
                              defaultValues={i as unknown as Record<string, unknown>}
                              triggerVariant="ghost"
                              triggerSize="sm"
                            />
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableWrap>
        </>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-4">
        <div className="text-sm">
          <p className="font-medium">Investor capital report</p>
          <p className="text-muted-foreground">
            Subscriptions, units and confirmed capital for {cycle.name}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/api/reports/investor-capital?cycle=${cycle.investment_cycle_id}&format=xlsx`}>
              <FileDown className="h-4 w-4" />
              Excel
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/api/reports/investor-capital?cycle=${cycle.investment_cycle_id}&format=pdf`}>
              <FileDown className="h-4 w-4" />
              PDF
            </Link>
          </Button>
        </div>
      </div>
    </>
  )
}
