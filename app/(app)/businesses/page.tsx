import { Building2 } from 'lucide-react'
import { requireUser, can } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatNaira, toNumber } from '@/lib/money'
import { titleCase } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page'
import { StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { CardList, RecordCard, TableWrap } from '@/components/tables/record-list'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumeric, TableRow,
} from '@/components/ui/table'
import { RecordDialog } from '@/components/forms/record-dialog'
import type { Business, ReceivableRow } from '@/lib/database.types'

export const metadata = { title: 'Businesses' }

const STATUSES = ['active', 'suspended', 'inactive'] as const

const FIELDS = [
  { name: 'name', label: 'Business name', required: true },
  { name: 'contact_person', label: 'Contact person' },
  { name: 'phone', label: 'Phone', type: 'tel' as const },
  { name: 'email', label: 'Email', type: 'email' as const },
  { name: 'registration_details', label: 'Registration details', hint: 'e.g. RC number' },
  { name: 'credit_limit', label: 'Credit limit (₦)', type: 'number' as const, required: true },
  {
    name: 'standard_repayment_days', label: 'Standard repayment period (days)',
    type: 'number' as const, required: true,
    hint: 'Typically 30 to 45 days',
  },
  {
    name: 'status', label: 'Status', type: 'select' as const, required: true,
    options: STATUSES.map((s) => ({ value: s, label: titleCase(s) })),
  },
  { name: 'address', label: 'Address', type: 'textarea' as const },
  { name: 'notes', label: 'Notes', type: 'textarea' as const },
]

export default async function BusinessesPage() {
  const user = await requireUser()
  const supabase = await createClient()

  const [{ data }, { data: receivables }] = await Promise.all([
    supabase.from('businesses').select('*').order('name'),
    supabase.from('v_receivables').select('*'),
  ])

  const businesses = (data ?? []) as Business[]
  const rec = (receivables ?? []) as ReceivableRow[]
  const canEdit = can(user.role, 'manageOperations')

  const exposure = new Map<string, { outstanding: number; contracts: number }>()
  for (const r of rec) {
    if (!['approved', 'goods_released', 'active', 'partially_paid', 'overdue'].includes(r.status)) {
      continue
    }
    const current = exposure.get(r.business_id) ?? { outstanding: 0, contracts: 0 }
    exposure.set(r.business_id, {
      outstanding: current.outstanding + toNumber(r.outstanding),
      contracts: current.contracts + 1,
    })
  }

  return (
    <>
      <PageHeader
        title="Businesses"
        description="Operating businesses MaalRise sells to under Murābaḥah. Their own retail sales are not MaalRise sales."
        actions={
          canEdit ? (
            <RecordDialog
              entity="business"
              title="Add business"
              fields={FIELDS}
              defaultValues={{ status: 'active', credit_limit: 0, standard_repayment_days: 45 }}
            />
          ) : null
        }
      />

      {businesses.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No businesses yet"
          description="Add the operating business that buys goods from MaalRise under a Murābaḥah contract."
        />
      ) : (
        <>
          <CardList>
            {businesses.map((b) => {
              const e = exposure.get(b.id)
              return (
                <RecordCard
                  key={b.id}
                  title={b.name}
                  subtitle={b.contact_person ?? undefined}
                  badge={<StatusBadge status={b.status} />}
                  rows={[
                    { label: 'Outstanding', value: formatNaira(e?.outstanding ?? 0) },
                    { label: 'Open contracts', value: String(e?.contracts ?? 0) },
                    { label: 'Credit limit', value: formatNaira(b.credit_limit) },
                    { label: 'Repayment period', value: `${b.standard_repayment_days} days` },
                  ]}
                  footer={
                    canEdit ? (
                      <RecordDialog
                        entity="business"
                        recordId={b.id}
                        title={`Edit ${b.name}`}
                        fields={FIELDS}
                        defaultValues={b as unknown as Record<string, unknown>}
                        triggerVariant="outline"
                        triggerSize="sm"
                      />
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
                  <TableHead>Business</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Credit limit</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Headroom</TableHead>
                  <TableHead className="text-right">Repayment</TableHead>
                  <TableHead>Status</TableHead>
                  {canEdit ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {businesses.map((b) => {
                  const outstanding = exposure.get(b.id)?.outstanding ?? 0
                  const headroom = toNumber(b.credit_limit) - outstanding
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {b.contact_person ?? '—'}
                        {b.phone ? <span className="block text-xs">{b.phone}</span> : null}
                      </TableCell>
                      <TableNumeric>{formatNaira(b.credit_limit)}</TableNumeric>
                      <TableNumeric>{formatNaira(outstanding)}</TableNumeric>
                      <TableNumeric className={headroom < 0 ? 'text-destructive' : undefined}>
                        {formatNaira(headroom)}
                      </TableNumeric>
                      <TableNumeric>{b.standard_repayment_days} days</TableNumeric>
                      <TableCell>
                        <StatusBadge status={b.status} />
                      </TableCell>
                      {canEdit ? (
                        <TableCell className="text-right">
                          <RecordDialog
                            entity="business"
                            recordId={b.id}
                            title={`Edit ${b.name}`}
                            fields={FIELDS}
                            defaultValues={b as unknown as Record<string, unknown>}
                            triggerVariant="ghost"
                            triggerSize="sm"
                          />
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
