import { ArrowLeftRight } from 'lucide-react'
import { requireRole, can, requireUser, requireCycle } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { reverseRepayment } from '@/app/actions/finance'
import { formatNaira, toNumber } from '@/lib/money'
import { formatDate } from '@/lib/dates'
import { titleCase } from '@/lib/utils'
import { PageHeader, StatCard } from '@/components/ui/page'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { ListFilters } from '@/components/tables/list-filters'
import { CardList, RecordCard, TableWrap } from '@/components/tables/record-list'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumeric, TableRow,
} from '@/components/ui/table'
import { ConfirmAction } from '@/components/ui/confirm-dialog'
import { RepaymentForm, type OpenContract } from '@/components/forms/repayment-form'
import type {
  BankAccount, Business, ReceivableRow, Repayment, RepaymentAllocation,
} from '@/lib/database.types'

export const metadata = { title: 'Repayments' }

const OPEN_STATUSES = ['approved', 'goods_released', 'active', 'partially_paid', 'overdue']

export default async function RepaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  await requireRole('ceo', 'accounts', 'auditor')
  const user = await requireUser()
  const cycle = await requireCycle()
  const supabase = await createClient()

  let query = supabase
    .from('repayments')
    .select('*')
    .eq('investment_cycle_id', cycle.investment_cycle_id)

  if (params.q) query = query.or(`receipt_number.ilike.%${params.q}%,payment_reference.ilike.%${params.q}%`)
  if (params.business) query = query.eq('business_id', params.business)

  const [
    { data: repaymentRows }, { data: businessRows }, { data: accountRows },
    { data: receivableRows }, { data: allocationRows },
  ] = await Promise.all([
    query.order('payment_date', { ascending: false }),
    supabase.from('businesses').select('id, name').eq('status', 'active').order('name'),
    supabase.from('bank_accounts').select('id, name').eq('is_active', true).order('name'),
    supabase
      .from('v_receivables')
      .select('*')
      .eq('investment_cycle_id', cycle.investment_cycle_id),
    supabase.from('repayment_allocations').select('*'),
  ])

  const repayments = (repaymentRows ?? []) as Repayment[]
  const businesses = (businessRows ?? []) as Pick<Business, 'id' | 'name'>[]
  const accounts = (accountRows ?? []) as Pick<BankAccount, 'id' | 'name'>[]
  const receivables = (receivableRows ?? []) as ReceivableRow[]
  const allocations = (allocationRows ?? []) as RepaymentAllocation[]

  const businessName = new Map(businesses.map((b) => [b.id, b.name]))
  const contractNumber = new Map(receivables.map((r) => [r.murabaha_sale_id, r.contract_number]))
  const canRecord = can(user.role, 'manageFinance')

  const openContracts: OpenContract[] = receivables
    .filter((r) => OPEN_STATUSES.includes(r.status) && toNumber(r.outstanding) > 0)
    .map((r) => ({
      murabaha_sale_id: r.murabaha_sale_id,
      contract_number: r.contract_number,
      business_id: r.business_id,
      outstanding: r.outstanding,
      due_date: r.due_date,
      days_overdue: r.days_overdue,
    }))

  const allocationsFor = (repaymentId: string) =>
    allocations.filter((a) => a.repayment_id === repaymentId)

  const netTotal = repayments.reduce(
    (sum, r) => sum + (r.status === 'reversed' && r.reverses_id ? -toNumber(r.amount) : toNumber(r.amount)),
    0,
  )
  const thisMonth = repayments.filter((r) => {
    const d = new Date(r.payment_date)
    const now = new Date()
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  })

  return (
    <>
      <PageHeader
        title="Repayments"
        description="Money received back from the operating business, ready to be redeployed into new procurement."
        actions={
          canRecord && businesses.length > 0 && accounts.length > 0 ? (
            <RepaymentForm businesses={businesses} contracts={openContracts} accounts={accounts} />
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Receipts recorded" value={String(repayments.length)} />
        <StatCard label="Total received (net)" money={netTotal} tone="positive" />
        <StatCard
          label="Received this month"
          money={thisMonth.reduce((sum, r) => sum + toNumber(r.amount), 0)}
        />
        <StatCard label="Contracts still open" value={String(openContracts.length)}
                  href="/receivables" />
      </div>

      <ListFilters
        searchPlaceholder="Search by receipt number or payment reference…"
        filters={[
          { name: 'business', label: 'Businesses', options: businesses.map((b) => ({ value: b.id, label: b.name })) },
        ]}
      />

      {repayments.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="No repayments yet"
          description="Record a payment when the business settles a Murābaḥah contract, in full or in part."
        />
      ) : (
        <>
          <CardList>
            {repayments.map((r) => (
              <RecordCard
                key={r.id}
                title={r.receipt_number}
                subtitle={`${businessName.get(r.business_id) ?? ''} · ${formatDate(r.payment_date)}`}
                badge={
                  r.status === 'reversed' ? (
                    <Badge tone="danger">Reversed</Badge>
                  ) : (
                    <Badge tone="success">Recorded</Badge>
                  )
                }
                rows={[
                  { label: 'Amount', value: formatNaira(r.amount) },
                  { label: 'Method', value: r.method ? titleCase(r.method) : '—' },
                  { label: 'Reference', value: r.payment_reference ?? '—' },
                  {
                    label: 'Contracts',
                    value: String(allocationsFor(r.id).length),
                  },
                ]}
                footer={
                  canRecord && r.status === 'recorded' && !r.reverses_id ? (
                    <ConfirmAction
                      title="Reverse repayment"
                      description="A reversal posts a compensating entry. The original receipt is never edited or deleted."
                      confirmLabel="Reverse repayment"
                      triggerLabel="Reverse"
                      triggerVariant="outline"
                      triggerSize="sm"
                      destructive
                      reasonPlaceholder="e.g. Payment returned unpaid by the bank"
                      action={(reason) => reverseRepayment(r.id, reason)}
                    />
                  ) : null
                }
              />
            ))}
          </CardList>

          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Allocated to</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  {canRecord ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {repayments.map((r) => {
                  const allocs = allocationsFor(r.id)
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.receipt_number}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {businessName.get(r.business_id) ?? '—'}
                      </TableCell>
                      <TableCell>{formatDate(r.payment_date)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {allocs.length === 0
                          ? '—'
                          : allocs.map((a) => (
                              <span key={a.id} className="block">
                                {contractNumber.get(a.murabaha_sale_id) ?? 'Contract'}{' '}
                                {formatNaira(a.amount)}
                              </span>
                            ))}
                      </TableCell>
                      <TableCell>{r.method ? titleCase(r.method) : '—'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.payment_reference ?? '—'}
                      </TableCell>
                      <TableNumeric
                        className={r.status === 'reversed' && r.reverses_id ? 'text-destructive' : 'font-medium'}
                      >
                        {r.reverses_id ? `(${formatNaira(r.amount)})` : formatNaira(r.amount)}
                      </TableNumeric>
                      <TableCell>
                        {r.status === 'reversed' ? (
                          <Badge tone="danger">Reversed</Badge>
                        ) : (
                          <Badge tone="success">Recorded</Badge>
                        )}
                      </TableCell>
                      {canRecord ? (
                        <TableCell className="text-right">
                          {r.status === 'recorded' && !r.reverses_id ? (
                            <ConfirmAction
                              title="Reverse repayment"
                              description="A reversal posts a compensating entry. The original receipt is never edited or deleted."
                              confirmLabel="Reverse repayment"
                              triggerLabel="Reverse"
                              triggerVariant="ghost"
                              triggerSize="sm"
                              destructive
                              reasonPlaceholder="e.g. Payment returned unpaid by the bank"
                              action={(reason) => reverseRepayment(r.id, reason)}
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
        </>
      )}
    </>
  )
}
