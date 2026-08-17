import { History } from 'lucide-react'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/dates'
import { titleCase } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { ListFilters } from '@/components/tables/list-filters'
import { Pagination, PAGE_SIZE, pageFrom, rangeFor } from '@/components/tables/pagination'
import type { AuditLog, Json } from '@/lib/database.types'

export const metadata = { title: 'Audit Log' }

const TABLES = [
  'procurement_orders', 'procurement_items', 'supplier_payments', 'shipments',
  'shipment_costs', 'goods_receipts', 'inventory_lots', 'murabaha_sales',
  'repayments', 'expenses', 'cash_transactions', 'investors',
  'investor_subscriptions', 'investment_cycles', 'system_settings', 'approvals',
]

/** Columns that never carry meaning in a diff. */
const NOISE = new Set(['updated_at', 'created_at'])

/** The fields that actually changed, so the trail reads as a story. */
function diff(oldData: Json | null, newData: Json | null) {
  const before = (oldData ?? {}) as Record<string, unknown>
  const after = (newData ?? {}) as Record<string, unknown>
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])

  return [...keys]
    .filter((key) => !NOISE.has(key))
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => ({
      field: key,
      from: before[key],
      to: after[key],
    }))
}

function display(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  await requireUser()
  const supabase = await createClient()
  const page = pageFrom(params)
  const { from, to } = rangeFor(page)

  let query = supabase.from('audit_logs').select('*', { count: 'exact' })

  if (params.table) query = query.eq('table_name', params.table)
  if (params.action) query = query.eq('action', params.action as AuditLog['action'])
  if (params.q) query = query.or(`user_email.ilike.%${params.q}%,reason.ilike.%${params.q}%`)

  const { data, count } = await query.order('created_at', { ascending: false }).range(from, to)
  const entries = (data ?? []) as AuditLog[]

  return (
    <>
      <PageHeader
        title="Audit log"
        description="A permanent record of every change. Audit entries cannot be edited or deleted by anyone, including the CEO."
      />

      <ListFilters
        searchPlaceholder="Search by user or reason…"
        filters={[
          { name: 'table', label: 'Records', options: TABLES.map((t) => ({ value: t, label: titleCase(t) })) },
          {
            name: 'action',
            label: 'Actions',
            options: [
              { value: 'insert', label: 'Created' },
              { value: 'update', label: 'Changed' },
              { value: 'delete', label: 'Deleted' },
            ],
          },
        ]}
      />

      {entries.length === 0 ? (
        <EmptyState
          icon={History}
          title="No audit entries match"
          description="Every create, change and delete across the system is recorded here automatically."
        />
      ) : (
        <>
          <div className="space-y-3">
            {entries.map((entry) => {
              const changes = entry.action === 'update' ? diff(entry.old_data, entry.new_data) : []

              return (
                <Card key={entry.id}>
                  <CardContent className="pt-6">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            tone={
                              entry.action === 'insert'
                                ? 'success'
                                : entry.action === 'delete'
                                  ? 'danger'
                                  : 'info'
                            }
                          >
                            {entry.action === 'insert'
                              ? 'Created'
                              : entry.action === 'delete'
                                ? 'Deleted'
                                : 'Changed'}
                          </Badge>
                          <span className="font-medium">{titleCase(entry.table_name)}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {entry.user_email ?? 'System'} · {formatDateTime(entry.created_at)}
                        </p>
                      </div>
                      {entry.record_id ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {entry.record_id.slice(0, 8)}
                        </span>
                      ) : null}
                    </div>

                    {entry.reason ? (
                      <p className="mt-3 rounded-md border-l-2 border-gold bg-muted/40 px-3 py-2 text-sm">
                        {entry.reason}
                      </p>
                    ) : null}

                    {changes.length > 0 ? (
                      <ul className="mt-3 space-y-1 text-xs">
                        {changes.slice(0, 8).map((change) => (
                          <li key={change.field} className="flex flex-wrap gap-1">
                            <span className="font-medium">{titleCase(change.field)}:</span>
                            <span className="text-destructive line-through">
                              {display(change.from)}
                            </span>
                            <span className="text-muted-foreground">→</span>
                            <span className="text-success">{display(change.to)}</span>
                          </li>
                        ))}
                        {changes.length > 8 ? (
                          <li className="text-muted-foreground">
                            and {changes.length - 8} more field
                            {changes.length - 8 === 1 ? '' : 's'}
                          </li>
                        ) : null}
                      </ul>
                    ) : null}
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <Pagination page={page} total={count ?? 0} pageSize={PAGE_SIZE} />
        </>
      )}
    </>
  )
}
