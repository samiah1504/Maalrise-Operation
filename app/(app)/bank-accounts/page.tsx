import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { requireRole, can, requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatNaira, formatForeign, toNumber } from '@/lib/money'
import { titleCase } from '@/lib/utils'
import { PageHeader, StatCard } from '@/components/ui/page'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { CardList, RecordCard, TableWrap } from '@/components/tables/record-list'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumeric, TableRow,
} from '@/components/ui/table'
import { RecordDialog } from '@/components/forms/record-dialog'
import type { AccountBalance, BankAccount } from '@/lib/database.types'

export const metadata = { title: 'Bank Accounts' }

const TYPES = ['bank', 'cash', 'foreign_currency', 'wallet', 'other'] as const

const FIELDS = [
  { name: 'name', label: 'Account name', required: true },
  {
    name: 'account_type', label: 'Account type', type: 'select' as const, required: true,
    options: TYPES.map((t) => ({ value: t, label: titleCase(t) })),
  },
  { name: 'bank_name', label: 'Bank name' },
  { name: 'account_number', label: 'Account number' },
  { name: 'currency', label: 'Currency', required: true },
  {
    name: 'opening_balance', label: 'Opening balance', type: 'number' as const, required: true,
    hint: 'The balance before MaalRise started recording transactions here',
  },
  { name: 'notes', label: 'Notes', type: 'textarea' as const },
]

export default async function BankAccountsPage() {
  await requireRole('ceo', 'accounts', 'auditor')
  const user = await requireUser()
  const supabase = await createClient()

  const [{ data: balances }, { data: accounts }] = await Promise.all([
    supabase.from('v_account_balances').select('*').order('name'),
    supabase.from('bank_accounts').select('*').order('name'),
  ])

  const rows = (balances ?? []) as AccountBalance[]
  const raw = new Map(((accounts ?? []) as BankAccount[]).map((a) => [a.id, a]))
  const canEdit = can(user.role, 'manageFinance')

  // Cash at Hand is the sum of active accounts only.
  const cashAtHand = rows
    .filter((r) => r.is_active)
    .reduce((sum, r) => sum + toNumber(r.balance), 0)

  return (
    <>
      <PageHeader
        title="Bank accounts"
        description="Every naira of Cash at Hand sits in one of these accounts."
        actions={
          canEdit ? (
            <RecordDialog
              entity="bankAccount"
              title="Add account"
              fields={FIELDS}
              defaultValues={{ account_type: 'bank', currency: 'NGN', opening_balance: 0, is_active: true }}
            />
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Cash at Hand" money={cashAtHand} tone="gold" icon={Wallet} />
        <StatCard label="Active accounts" value={String(rows.filter((r) => r.is_active).length)} />
        <StatCard
          label="Naira accounts"
          value={String(rows.filter((r) => r.currency === 'NGN').length)}
        />
        <StatCard
          label="Foreign currency accounts"
          value={String(rows.filter((r) => r.currency !== 'NGN').length)}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Add the bank, cash and wallet accounts MaalRise operates so inflows and outflows can be recorded."
        />
      ) : (
        <>
          <CardList>
            {rows.map((r) => (
              <RecordCard
                key={r.bank_account_id}
                title={r.name}
                subtitle={[r.bank_name, r.account_number].filter(Boolean).join(' · ') || undefined}
                badge={
                  <Badge tone={r.is_active ? 'success' : 'neutral'}>
                    {r.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                }
                rows={[
                  { label: 'Type', value: titleCase(r.account_type) },
                  { label: 'Currency', value: r.currency },
                  { label: 'Opening balance', value: formatNaira(r.opening_balance) },
                  {
                    label: 'Balance',
                    value:
                      r.currency === 'NGN'
                        ? formatNaira(r.balance)
                        : formatForeign(r.balance, r.currency),
                  },
                ]}
                footer={
                  canEdit && raw.get(r.bank_account_id) ? (
                    <RecordDialog
                      entity="bankAccount"
                      recordId={r.bank_account_id}
                      title={`Edit ${r.name}`}
                      fields={FIELDS}
                      defaultValues={raw.get(r.bank_account_id) as unknown as Record<string, unknown>}
                      triggerVariant="outline"
                      triggerSize="sm"
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
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Opening</TableHead>
                  <TableHead className="text-right">Movement</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.bank_account_id}>
                    <TableCell>
                      <Link href={`/cashbook?account=${r.bank_account_id}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      {r.bank_name ? (
                        <span className="block text-xs text-muted-foreground">
                          {r.bank_name} {r.account_number ? `· ${r.account_number}` : ''}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>{titleCase(r.account_type)}</TableCell>
                    <TableCell>{r.currency}</TableCell>
                    <TableNumeric>{formatNaira(r.opening_balance)}</TableNumeric>
                    <TableNumeric
                      className={toNumber(r.movement) < 0 ? 'text-destructive' : 'text-success'}
                    >
                      {formatNaira(r.movement)}
                    </TableNumeric>
                    <TableNumeric className="font-semibold">{formatNaira(r.balance)}</TableNumeric>
                    <TableCell className="text-right">
                      {canEdit && raw.get(r.bank_account_id) ? (
                        <RecordDialog
                          entity="bankAccount"
                          recordId={r.bank_account_id}
                          title={`Edit ${r.name}`}
                          fields={FIELDS}
                          defaultValues={raw.get(r.bank_account_id) as unknown as Record<string, unknown>}
                          triggerVariant="ghost"
                          triggerSize="sm"
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrap>
        </>
      )}
    </>
  )
}
