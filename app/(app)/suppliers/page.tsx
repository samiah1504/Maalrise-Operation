import Link from 'next/link'
import { Handshake, Star } from 'lucide-react'
import { requireUser, can } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatNaira, formatNumber, toNumber } from '@/lib/money'
import { titleCase } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page'
import { StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { ListFilters, enumFilter } from '@/components/tables/list-filters'
import { Pagination, PAGE_SIZE, pageFrom, rangeFor } from '@/components/tables/pagination'
import { CardList, RecordCard, TableWrap } from '@/components/tables/record-list'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumeric, TableRow,
} from '@/components/ui/table'
import { RecordDialog } from '@/components/forms/record-dialog'
import type { Supplier, SupplierPerformance } from '@/lib/database.types'

export const metadata = { title: 'Suppliers' }

const STATUSES = ['active', 'under_review', 'suspended', 'inactive'] as const

const FIELDS = [
  { name: 'name', label: 'Supplier name', required: true },
  { name: 'contact_person', label: 'Contact person' },
  { name: 'country', label: 'Country', required: true },
  { name: 'currency', label: 'Currency', required: true, hint: 'The currency you buy in, e.g. USD' },
  { name: 'phone', label: 'Phone', type: 'tel' as const },
  { name: 'email', label: 'Email', type: 'email' as const },
  { name: 'wechat', label: 'WeChat' },
  { name: 'whatsapp', label: 'WhatsApp' },
  { name: 'address', label: 'Address', type: 'textarea' as const },
  { name: 'bank_details', label: 'Bank details', type: 'textarea' as const },
  { name: 'products_supplied', label: 'Products supplied', type: 'textarea' as const },
  { name: 'rating', label: 'Rating', type: 'number' as const, step: '0.1', hint: '0 to 5' },
  {
    name: 'avg_production_days', label: 'Average production time', type: 'number' as const,
    hint: 'In days',
  },
  {
    name: 'avg_delivery_days', label: 'Average delivery time', type: 'number' as const,
    hint: 'In days',
  },
  {
    name: 'status', label: 'Status', type: 'select' as const, required: true,
    options: STATUSES.map((s) => ({ value: s, label: titleCase(s) })),
  },
  { name: 'notes', label: 'Notes', type: 'textarea' as const },
]

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const user = await requireUser()
  const supabase = await createClient()
  const page = pageFrom(params)
  const { from, to } = rangeFor(page)

  let query = supabase.from('suppliers').select('*', { count: 'exact' })

  if (params.q) {
    query = query.or(
      `name.ilike.%${params.q}%,contact_person.ilike.%${params.q}%,country.ilike.%${params.q}%`,
    )
  }
  if (params.status) query = query.eq('status', params.status as Supplier['status'])

  const sort = params.sort ?? 'name'
  const [{ data, count }, { data: perf }] = await Promise.all([
    query.order(sort === 'recent' ? 'created_at' : 'name', { ascending: sort !== 'recent' }).range(from, to),
    supabase.from('v_supplier_performance').select('*'),
  ])

  const suppliers = (data ?? []) as Supplier[]
  const performance = new Map(
    ((perf ?? []) as SupplierPerformance[]).map((p) => [p.supplier_id, p]),
  )
  const canEdit = can(user.role, 'manageOperations')

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Manufacturers and suppliers MaalRise buys from, with their trading history."
        actions={
          canEdit ? (
            <RecordDialog
              entity="supplier"
              title="Add supplier"
              description="Capture the supplier's contact, payment and lead-time details."
              fields={FIELDS}
              defaultValues={{ country: 'China', currency: 'USD', status: 'active' }}
            />
          ) : null
        }
      />

      <ListFilters
        searchPlaceholder="Search by name, contact or country…"
        filters={[enumFilter('status', 'Status', STATUSES)]}
        sortOptions={[
          { value: 'name', label: 'Sort: Name' },
          { value: 'recent', label: 'Sort: Newest first' },
        ]}
      />

      {suppliers.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title="No suppliers yet"
          description="Add the manufacturers MaalRise procures from so procurement batches can be raised against them."
        />
      ) : (
        <>
          <CardList>
            {suppliers.map((s) => {
              const p = performance.get(s.id)
              return (
                <RecordCard
                  key={s.id}
                  title={s.name}
                  subtitle={`${s.country}${s.contact_person ? ` · ${s.contact_person}` : ''}`}
                  badge={<StatusBadge status={s.status} />}
                  rows={[
                    { label: 'Batches', value: formatNumber(p?.batch_count ?? 0) },
                    { label: 'Purchase value', value: formatNaira(p?.total_purchase_value ?? 0) },
                    { label: 'Currency', value: s.currency },
                    {
                      label: 'Avg. delivery',
                      value: s.avg_delivery_days ? `${s.avg_delivery_days} days` : '—',
                    },
                  ]}
                  footer={
                    canEdit ? (
                      <RecordDialog
                        entity="supplier"
                        recordId={s.id}
                        title={`Edit ${s.name}`}
                        fields={FIELDS}
                        defaultValues={s as unknown as Record<string, unknown>}
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
                  <TableHead>Supplier</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead className="text-right">Batches</TableHead>
                  <TableHead className="text-right">Purchase value</TableHead>
                  <TableHead className="text-right">Avg. cycle days</TableHead>
                  <TableHead>Status</TableHead>
                  {canEdit ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((s) => {
                  const p = performance.get(s.id)
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        <Link href={`/procurement?supplier=${s.id}`} className="hover:underline">
                          {s.name}
                        </Link>
                      </TableCell>
                      <TableCell>{s.country}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.contact_person ?? '—'}
                      </TableCell>
                      <TableCell>
                        {s.rating ? (
                          <span className="inline-flex items-center gap-1">
                            <Star className="h-3.5 w-3.5 fill-gold text-gold" />
                            {toNumber(s.rating).toFixed(1)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableNumeric>{formatNumber(p?.batch_count ?? 0)}</TableNumeric>
                      <TableNumeric>{formatNaira(p?.total_purchase_value ?? 0)}</TableNumeric>
                      <TableNumeric>
                        {p && toNumber(p.avg_capital_cycle_days) > 0
                          ? formatNumber(p.avg_capital_cycle_days, 1)
                          : '—'}
                      </TableNumeric>
                      <TableCell>
                        <StatusBadge status={s.status} />
                      </TableCell>
                      {canEdit ? (
                        <TableCell className="text-right">
                          <RecordDialog
                            entity="supplier"
                            recordId={s.id}
                            title={`Edit ${s.name}`}
                            fields={FIELDS}
                            defaultValues={s as unknown as Record<string, unknown>}
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

          <Pagination page={page} total={count ?? 0} pageSize={PAGE_SIZE} />
        </>
      )}
    </>
  )
}
