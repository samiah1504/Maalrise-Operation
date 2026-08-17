import { Receipt } from 'lucide-react'
import { requireRole, can, requireUser, requireCycle } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { createClient } from '@/lib/supabase/server'
import { approveExpense } from '@/app/actions/finance'
import { formatNaira, toNumber } from '@/lib/money'
import { formatDate } from '@/lib/dates'
import { PageHeader, StatCard } from '@/components/ui/page'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { ListFilters, enumFilter } from '@/components/tables/list-filters'
import { CardList, RecordCard, TableWrap } from '@/components/tables/record-list'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumeric, TableRow,
} from '@/components/ui/table'
import { ConfirmAction } from '@/components/ui/confirm-dialog'
import { RecordDialog } from '@/components/forms/record-dialog'
import { PayExpenseDialog } from '@/components/forms/expense-actions'
import type {
  BankAccount, Expense, ExpenseCategory, ExpenseStatus, MurabahaSale, ProcurementOrder,
} from '@/lib/database.types'

export const metadata = { title: 'Expenses' }

const STATUSES: readonly ExpenseStatus[] = [
  'draft', 'awaiting_approval', 'approved', 'rejected', 'paid', 'cancelled',
]

export default async function ExpensesPage({
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

  let query = supabase
    .from('expenses')
    .select('*')
    .eq('investment_cycle_id', cycle.investment_cycle_id)

  if (params.q) query = query.or(`expense_number.ilike.%${params.q}%,description.ilike.%${params.q}%`)
  if (params.status) query = query.eq('status', params.status as ExpenseStatus)
  if (params.category) query = query.eq('category_id', params.category)

  const [
    { data: expenseRows }, { data: categoryRows }, { data: accountRows },
    { data: batchRows }, { data: saleRows },
  ] = await Promise.all([
    query.order('expense_date', { ascending: false }),
    supabase.from('expense_categories').select('*').eq('is_active', true).order('name'),
    supabase.from('bank_accounts').select('id, name').eq('is_active', true).order('name'),
    supabase
      .from('procurement_orders')
      .select('id, batch_number')
      .eq('investment_cycle_id', cycle.investment_cycle_id)
      .order('batch_number', { ascending: false }),
    supabase
      .from('murabaha_sales')
      .select('id, contract_number')
      .eq('investment_cycle_id', cycle.investment_cycle_id)
      .order('contract_number', { ascending: false }),
  ])

  const expenses = (expenseRows ?? []) as Expense[]
  const categories = (categoryRows ?? []) as ExpenseCategory[]
  const accounts = (accountRows ?? []) as Pick<BankAccount, 'id' | 'name'>[]
  const batches = (batchRows ?? []) as Pick<ProcurementOrder, 'id' | 'batch_number'>[]
  const sales = (saleRows ?? []) as Pick<MurabahaSale, 'id' | 'contract_number'>[]

  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const canEdit = can(user.role, 'manageFinance')
  const approvalLimit = Number(settings['expense.approval_limit'])

  const fields = [
    {
      name: 'category_id', label: 'Category', type: 'select' as const, required: true,
      options: categories.map((c) => ({
        value: c.id,
        label: c.is_direct_cost ? `${c.name} (direct cost)` : c.name,
      })),
    },
    { name: 'expense_date', label: 'Date', type: 'date' as const, required: true },
    {
      name: 'amount', label: 'Amount (₦)', type: 'number' as const, required: true,
      hint: `Above ${formatNaira(approvalLimit)} this will need approval before it can be paid`,
    },
    { name: 'description', label: 'Description', required: true, wide: true },
    {
      name: 'procurement_order_id', label: 'Linked procurement batch', type: 'select' as const,
      options: batches.map((b) => ({ value: b.id, label: b.batch_number })),
    },
    {
      name: 'murabaha_sale_id', label: 'Linked Murābaḥah contract', type: 'select' as const,
      options: sales.map((s) => ({ value: s.id, label: s.contract_number })),
    },
    { name: 'notes', label: 'Notes', type: 'textarea' as const },
  ]

  const awaiting = expenses.filter((e) => e.status === 'awaiting_approval')
  const approvedUnpaid = expenses.filter((e) => e.status === 'approved')

  // Direct procurement costs are capitalised into landed cost, so only the rest
  // are operating expenses in the P&L.
  const operating = expenses
    .filter((e) => ['approved', 'paid'].includes(e.status))
    .filter((e) => !categoryById.get(e.category_id)?.is_direct_cost)
    .reduce((sum, e) => sum + toNumber(e.amount), 0)

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Operating costs for the cycle. Direct procurement costs live on the batch instead, so nothing is counted twice."
        actions={
          canEdit && categories.length > 0 ? (
            <RecordDialog
              entity="expense"
              title="Record expense"
              description={`Expenses above ${formatNaira(approvalLimit)} are held for approval automatically.`}
              fields={fields}
              defaultValues={{
                expense_date: new Date().toISOString().slice(0, 10),
                is_general_admin: true,
                investment_cycle_id: cycle.investment_cycle_id,
              }}
            />
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Operating expenses" money={operating} />
        <StatCard label="Awaiting approval" value={String(awaiting.length)}
                  tone={awaiting.length > 0 ? 'gold' : 'muted'} />
        <StatCard label="Approved, unpaid" value={String(approvedUnpaid.length)} />
        <StatCard label="Approval limit" money={approvalLimit} tone="muted"
                  hint="Set in Settings" />
      </div>

      <ListFilters
        searchPlaceholder="Search by number or description…"
        filters={[
          enumFilter('status', 'Status', STATUSES),
          { name: 'category', label: 'Categories', options: categories.map((c) => ({ value: c.id, label: c.name })) },
        ]}
      />

      {expenses.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No expenses recorded"
          description="Record salaries, software, professional fees and other running costs here."
        />
      ) : (
        <>
          <CardList>
            {expenses.map((e) => {
              const category = categoryById.get(e.category_id)
              return (
                <RecordCard
                  key={e.id}
                  title={e.description}
                  subtitle={`${e.expense_number} · ${formatDate(e.expense_date)}`}
                  badge={<StatusBadge status={e.status} />}
                  rows={[
                    { label: 'Amount', value: formatNaira(e.amount) },
                    { label: 'Category', value: category?.name ?? '—' },
                    {
                      label: 'Treatment',
                      value: category?.is_direct_cost ? 'Capitalised' : 'Operating',
                    },
                    { label: 'Paid', value: e.cash_transaction_id ? 'Yes' : 'No' },
                  ]}
                  footer={
                    canEdit ? (
                      <div className="flex flex-wrap gap-2">
                        {e.status === 'awaiting_approval' && e.created_by !== user.id ? (
                          <ConfirmAction
                            title="Approve expense"
                            description={`${e.description} — ${formatNaira(e.amount)}`}
                            confirmLabel="Approve"
                            triggerLabel="Approve"
                            triggerSize="sm"
                            action={(reason) => approveExpense(e.id, reason)}
                          />
                        ) : null}
                        {e.status === 'approved' ? (
                          <PayExpenseDialog
                            expenseId={e.id}
                            description={e.description}
                            amount={e.amount}
                            accounts={accounts}
                          />
                        ) : null}
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
                  <TableHead>Expense</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Treatment</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  {canEdit ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((e) => {
                  const category = categoryById.get(e.category_id)
                  return (
                    <TableRow key={e.id}>
                      <TableCell>
                        <span className="block font-medium">{e.description}</span>
                        <span className="block text-xs text-muted-foreground">
                          {e.expense_number}
                        </span>
                      </TableCell>
                      <TableCell>{formatDate(e.expense_date)}</TableCell>
                      <TableCell className="text-muted-foreground">{category?.name ?? '—'}</TableCell>
                      <TableCell>
                        {category?.is_direct_cost ? (
                          <Badge tone="info">Capitalised</Badge>
                        ) : (
                          <Badge tone="neutral">Operating</Badge>
                        )}
                      </TableCell>
                      <TableNumeric className="font-medium">{formatNaira(e.amount)}</TableNumeric>
                      <TableCell>
                        <StatusBadge status={e.status} />
                      </TableCell>
                      {canEdit ? (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {e.status === 'awaiting_approval' && e.created_by !== user.id ? (
                              <ConfirmAction
                                title="Approve expense"
                                description={`${e.description} — ${formatNaira(e.amount)}`}
                                confirmLabel="Approve"
                                triggerLabel="Approve"
                                triggerVariant="ghost"
                                triggerSize="sm"
                                action={(reason) => approveExpense(e.id, reason)}
                              />
                            ) : null}
                            {e.status === 'approved' ? (
                              <PayExpenseDialog
                                expenseId={e.id}
                                description={e.description}
                                amount={e.amount}
                                accounts={accounts}
                              />
                            ) : null}
                          </div>
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
