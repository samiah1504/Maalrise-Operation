import Link from 'next/link'
import { BadgeCheck } from 'lucide-react'
import { requireUser, can, requireCycle } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { approveExpense, approveMurabahaSale, approveProcurement, finaliseLandedCost } from '@/app/actions/finance'
import { formatNaira, toNumber } from '@/lib/money'
import { formatDate, formatDateTime } from '@/lib/dates'
import { titleCase } from '@/lib/utils'
import { PageHeader, StatCard } from '@/components/ui/page'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { ConfirmAction } from '@/components/ui/confirm-dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumeric, TableRow,
} from '@/components/ui/table'
import { TableWrap } from '@/components/tables/record-list'
import type {
  Approval, Expense, ExpenseCategory, MurabahaSale, Profile, ProcurementOrder,
} from '@/lib/database.types'

export const metadata = { title: 'Approvals' }

/**
 * A single inbox for everything waiting on a decision, gathered from the source
 * records rather than a queue table — so nothing can sit here after it has
 * already been dealt with elsewhere.
 */
export default async function ApprovalsPage() {
  const user = await requireUser()
  const cycle = await requireCycle()
  const supabase = await createClient()

  const [
    { data: procurementRows }, { data: saleRows }, { data: expenseRows },
    { data: categoryRows }, { data: unfinalisedRows }, { data: decidedRows },
    { data: profileRows },
  ] = await Promise.all([
    supabase
      .from('procurement_orders')
      .select('*')
      .eq('investment_cycle_id', cycle.investment_cycle_id)
      .in('status', ['draft', 'awaiting_approval']),
    supabase
      .from('murabaha_sales')
      .select('*')
      .eq('investment_cycle_id', cycle.investment_cycle_id)
      .in('status', ['draft', 'awaiting_approval']),
    supabase
      .from('expenses')
      .select('*')
      .eq('investment_cycle_id', cycle.investment_cycle_id)
      .eq('status', 'awaiting_approval'),
    supabase.from('expense_categories').select('*'),
    supabase
      .from('procurement_orders')
      .select('*')
      .eq('investment_cycle_id', cycle.investment_cycle_id)
      .eq('landed_cost_finalised', false)
      .in('status', ['received', 'partially_received', 'clearing']),
    supabase.from('approvals').select('*').order('decided_at', { ascending: false }).limit(30),
    supabase.from('profiles').select('id, full_name'),
  ])

  const procurements = (procurementRows ?? []) as ProcurementOrder[]
  const sales = (saleRows ?? []) as MurabahaSale[]
  const expenses = (expenseRows ?? []) as Expense[]
  const categories = new Map(((categoryRows ?? []) as ExpenseCategory[]).map((c) => [c.id, c]))
  const unfinalised = (unfinalisedRows ?? []) as ProcurementOrder[]
  const decided = (decidedRows ?? []) as Approval[]
  const profiles = new Map(
    ((profileRows ?? []) as Pick<Profile, 'id' | 'full_name'>[]).map((p) => [p.id, p.full_name]),
  )

  const canApprove = can(user.role, 'approve')
  const total = procurements.length + sales.length + expenses.length + unfinalised.length

  /** The creator of a record may never approve it. */
  function blockedBecauseCreator(createdBy: string | null) {
    return createdBy === user.id
  }

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Everything waiting on a decision. The person who created a record can never approve it."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Procurement orders" value={String(procurements.length)} />
        <StatCard label="Landed cost" value={String(unfinalised.length)} />
        <StatCard label="Murābaḥah sales" value={String(sales.length)} />
        <StatCard label="Expenses" value={String(expenses.length)} />
      </div>

      {!canApprove ? (
        <Card className="mb-5">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            You can see what is pending, but only the CEO and Accounts Officers may approve.
          </CardContent>
        </Card>
      ) : null}

      {total === 0 ? (
        <EmptyState
          icon={BadgeCheck}
          title="Nothing waiting for approval"
          description="Procurement orders, landed cost finalisations, Murābaḥah sales and high-value expenses appear here."
        />
      ) : (
        <div className="space-y-8">
          {procurements.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-base font-semibold">Procurement orders</h2>
              {procurements.map((p) => (
                <ApprovalRow
                  key={p.id}
                  title={p.batch_number}
                  href={`/procurement/${p.id}`}
                  meta={`Raised ${formatDate(p.procurement_date)} by ${profiles.get(p.created_by ?? '') ?? 'staff'}`}
                  amount={p.total_cost_naira}
                  blocked={blockedBecauseCreator(p.created_by)}
                  canApprove={canApprove}
                  action={
                    <ConfirmAction
                      title="Approve procurement order"
                      description={`${p.batch_number} — ${formatNaira(p.total_cost_naira)}. Approving allows supplier payments to be recorded.`}
                      confirmLabel="Approve"
                      triggerLabel="Approve"
                      triggerSize="sm"
                      action={(reason) => approveProcurement(p.id, reason)}
                    />
                  }
                />
              ))}
            </section>
          ) : null}

          {unfinalised.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-base font-semibold">Landed cost finalisation</h2>
              <p className="text-sm text-muted-foreground">
                These batches have arrived but their landed cost is still provisional. Goods cannot
                be sold under Murābaḥah until it is finalised.
              </p>
              {unfinalised.map((p) => (
                <ApprovalRow
                  key={p.id}
                  title={p.batch_number}
                  href={`/procurement/${p.id}`}
                  meta={`Purchase ${formatNaira(p.total_cost_naira)} plus ${formatNaira(p.allocated_costs_naira)} direct costs`}
                  amount={toNumber(p.total_cost_naira) + toNumber(p.allocated_costs_naira)}
                  blocked={blockedBecauseCreator(p.created_by)}
                  canApprove={canApprove}
                  action={
                    <ConfirmAction
                      title="Finalise landed cost"
                      description="Once finalised, no further cost lines can be added and this becomes the disclosed Murābaḥah cost."
                      confirmLabel="Finalise"
                      triggerLabel="Finalise"
                      triggerVariant="gold"
                      triggerSize="sm"
                      action={(reason) => finaliseLandedCost(p.id, reason)}
                    />
                  }
                />
              ))}
            </section>
          ) : null}

          {sales.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-base font-semibold">Murābaḥah sales</h2>
              {sales.map((s) => (
                <ApprovalRow
                  key={s.id}
                  title={s.contract_number}
                  href={`/murabaha/${s.id}`}
                  meta={`Cost ${formatNaira(s.total_cost)} plus profit ${formatNaira(s.markup_amount)}`}
                  amount={s.selling_price}
                  blocked={blockedBecauseCreator(s.created_by)}
                  canApprove={canApprove}
                  action={
                    <ConfirmAction
                      title="Approve Murābaḥah sale"
                      description="Approving releases the goods, creates the receivable and fixes the selling price permanently."
                      confirmLabel="Approve sale"
                      triggerLabel="Approve"
                      triggerSize="sm"
                      action={(reason) => approveMurabahaSale(s.id, reason)}
                    />
                  }
                />
              ))}
            </section>
          ) : null}

          {expenses.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-base font-semibold">Expenses above the approval limit</h2>
              {expenses.map((e) => (
                <ApprovalRow
                  key={e.id}
                  title={e.description}
                  href="/expenses"
                  meta={`${e.expense_number} · ${categories.get(e.category_id)?.name ?? ''} · ${formatDate(e.expense_date)}`}
                  amount={e.amount}
                  blocked={blockedBecauseCreator(e.created_by)}
                  canApprove={canApprove}
                  action={
                    <ConfirmAction
                      title="Approve expense"
                      description={`${e.description} — ${formatNaira(e.amount)}`}
                      confirmLabel="Approve"
                      triggerLabel="Approve"
                      triggerSize="sm"
                      action={(reason) => approveExpense(e.id, reason)}
                    />
                  }
                />
              ))}
            </section>
          ) : null}
        </div>
      )}

      {/* --- Decision history ------------------------------------------- */}
      {decided.length > 0 ? (
        <section className="mt-10 space-y-3">
          <h2 className="text-base font-semibold">Recent decisions</h2>
          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Requested by</TableHead>
                  <TableHead>Approved by</TableHead>
                  <TableHead>Decided</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {decided.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.title}</TableCell>
                    <TableCell>{titleCase(a.approval_type)}</TableCell>
                    <TableNumeric>{a.amount ? formatNaira(a.amount) : '—'}</TableNumeric>
                    <TableCell className="text-muted-foreground">
                      {profiles.get(a.requested_by ?? '') ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {profiles.get(a.approver_id ?? '') ?? '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatDateTime(a.decided_at)}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                      {a.reason ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrap>
        </section>
      ) : null}
    </>
  )
}

function ApprovalRow({
  title,
  href,
  meta,
  amount,
  blocked,
  canApprove,
  action,
}: {
  title: string
  href: string
  meta: string
  amount: string | number
  blocked: boolean
  canApprove: boolean
  action: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
        <div className="min-w-0">
          <Link href={href} className="font-medium hover:underline">
            {title}
          </Link>
          <p className="text-xs text-muted-foreground">{meta}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="tabular font-semibold">{formatNaira(amount)}</span>
          {!canApprove ? null : blocked ? (
            <Badge tone="warning">You raised this</Badge>
          ) : (
            action
          )}
        </div>
      </CardContent>
    </Card>
  )
}
