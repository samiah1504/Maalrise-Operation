import Link from 'next/link'
import { Banknote, FileDown } from 'lucide-react'
import { requireRole, requireCycle } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatNaira, toNumber } from '@/lib/money'
import { formatDate } from '@/lib/dates'
import { titleCase } from '@/lib/utils'
import { PageHeader, StatCard } from '@/components/ui/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import { ListFilters } from '@/components/tables/list-filters'
import { enumFilter } from '@/lib/filters'
import { Pagination } from '@/components/tables/pagination'
import { PAGE_SIZE, pageFrom, rangeFor } from '@/lib/pagination'
import { CardList, RecordCard, TableWrap } from '@/components/tables/record-list'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumeric, TableRow,
} from '@/components/ui/table'
import type { AccountBalance, CashCategory, CashTransaction } from '@/lib/database.types'

export const metadata = { title: 'Cashbook' }

const INFLOW_CATEGORIES: CashCategory[] = [
  'investor_capital', 'business_repayment', 'supplier_refund', 'other_income',
]

const CATEGORIES: readonly CashCategory[] = [
  'investor_capital', 'business_repayment', 'supplier_refund', 'other_income',
  'supplier_payment', 'shipping', 'clearing', 'customs', 'local_transport',
  'salaries', 'software', 'bank_charges', 'professional_fees', 'office_expense',
  'investor_payout', 'other_expense',
]

export default async function CashbookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  await requireRole('ceo', 'accounts', 'auditor')
  const cycle = await requireCycle()
  const supabase = await createClient()
  const page = pageFrom(params)
  const { from, to } = rangeFor(page)

  let query = supabase
    .from('cash_transactions')
    .select('*', { count: 'exact' })
    .eq('investment_cycle_id', cycle.investment_cycle_id)

  if (params.q) query = query.or(`description.ilike.%${params.q}%,payment_reference.ilike.%${params.q}%`)
  if (params.account) query = query.eq('bank_account_id', params.account)
  if (params.direction) query = query.eq('direction', params.direction as 'inflow' | 'outflow')
  if (params.category) query = query.eq('category', params.category as CashCategory)
  if (params.from) query = query.gte('transaction_date', params.from)
  if (params.to) query = query.lte('transaction_date', params.to)

  const [{ data, count }, { data: balanceRows }, { data: allRows }] = await Promise.all([
    query
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to),
    supabase.from('v_account_balances').select('*').order('name'),
    supabase
      .from('cash_transactions')
      .select('direction, amount')
      .eq('investment_cycle_id', cycle.investment_cycle_id),
  ])

  const transactions = (data ?? []) as CashTransaction[]
  const balances = (balanceRows ?? []) as AccountBalance[]
  const accountName = new Map(balances.map((b) => [b.bank_account_id, b.name]))

  const all = (allRows ?? []) as Pick<CashTransaction, 'direction' | 'amount'>[]
  const inflows = all
    .filter((t) => t.direction === 'inflow')
    .reduce((sum, t) => sum + toNumber(t.amount), 0)
  const outflows = all
    .filter((t) => t.direction === 'outflow')
    .reduce((sum, t) => sum + toNumber(t.amount), 0)
  const cashAtHand = balances
    .filter((b) => b.is_active)
    .reduce((sum, b) => sum + toNumber(b.balance), 0)

  return (
    <>
      <PageHeader
        title="Cashbook"
        description={`Every inflow and outflow for ${cycle.name}. This is the single source of truth for Cash at Hand.`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/api/reports/cashbook?cycle=${cycle.investment_cycle_id}&format=xlsx`}>
              <FileDown className="h-4 w-4" />
              Export
            </Link>
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Cash at Hand" money={cashAtHand} tone="gold" icon={Banknote} />
        <StatCard label="Total inflows" money={inflows} tone="positive" />
        <StatCard label="Total outflows" money={outflows} tone="negative" />
        <StatCard label="Transactions" value={String(count ?? 0)} />
      </div>

      <ListFilters
        searchPlaceholder="Search by description or payment reference…"
        filters={[
          {
            name: 'account',
            label: 'Accounts',
            options: balances.map((b) => ({ value: b.bank_account_id, label: b.name })),
          },
          {
            name: 'direction',
            label: 'Direction',
            options: [
              { value: 'inflow', label: 'Inflows' },
              { value: 'outflow', label: 'Outflows' },
            ],
          },
          enumFilter('category', 'Categories', CATEGORIES),
        ]}
      />

      {transactions.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="No cash transactions yet"
          description="The cashbook fills automatically as capital is received, suppliers are paid, costs are settled and repayments arrive."
        />
      ) : (
        <>
          <CardList>
            {transactions.map((t) => (
              <RecordCard
                key={t.id}
                title={t.description ?? titleCase(t.category)}
                subtitle={`${formatDate(t.transaction_date)} · ${accountName.get(t.bank_account_id) ?? ''}`}
                badge={
                  <Badge tone={t.direction === 'inflow' ? 'success' : 'danger'}>
                    {t.direction === 'inflow' ? 'In' : 'Out'}
                  </Badge>
                }
                rows={[
                  { label: 'Amount', value: formatNaira(t.amount) },
                  { label: 'Category', value: titleCase(t.category) },
                  { label: 'Reference', value: t.payment_reference ?? '—' },
                  { label: 'Reversal', value: t.is_reversal ? 'Yes' : 'No' },
                ]}
              />
            ))}
          </CardList>

          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Inflow</TableHead>
                  <TableHead className="text-right">Outflow</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(t.transaction_date)}
                    </TableCell>
                    <TableCell>
                      {t.procurement_order_id ? (
                        <Link
                          href={`/procurement/${t.procurement_order_id}`}
                          className="font-medium hover:underline"
                        >
                          {t.description ?? titleCase(t.category)}
                        </Link>
                      ) : (
                        <span className="font-medium">{t.description ?? titleCase(t.category)}</span>
                      )}
                      {t.is_reversal ? (
                        <Badge tone="danger" className="ml-2">
                          Reversal
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge tone={INFLOW_CATEGORIES.includes(t.category) ? 'success' : 'neutral'}>
                        {titleCase(t.category)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {accountName.get(t.bank_account_id) ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.payment_reference ?? '—'}
                    </TableCell>
                    <TableNumeric className="text-success">
                      {t.direction === 'inflow' ? formatNaira(t.amount) : ''}
                    </TableNumeric>
                    <TableNumeric className="text-destructive">
                      {t.direction === 'outflow' ? formatNaira(t.amount) : ''}
                    </TableNumeric>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrap>

          <Pagination page={page} total={count ?? 0} pageSize={PAGE_SIZE} />
        </>
      )}

      {/* Balances by account, so the cashbook always reconciles to the accounts */}
      <div className="mt-8">
        <h2 className="mb-3 text-base font-semibold">Balances by account</h2>
        <TableWrap>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Opening</TableHead>
                <TableHead className="text-right">Movement</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balances.map((b) => (
                <TableRow key={b.bank_account_id}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell>{titleCase(b.account_type)}</TableCell>
                  <TableNumeric>{formatNaira(b.opening_balance)}</TableNumeric>
                  <TableNumeric>{formatNaira(b.movement)}</TableNumeric>
                  <TableNumeric className="font-semibold">{formatNaira(b.balance)}</TableNumeric>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      </div>
    </>
  )
}
