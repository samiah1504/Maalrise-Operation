import Link from 'next/link'
import { Ship } from 'lucide-react'
import { requireUser, can, requireCycle } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDate, daysUntil } from '@/lib/dates'
import { titleCase } from '@/lib/utils'
import { PageHeader, StatCard } from '@/components/ui/page'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { ListFilters } from '@/components/tables/list-filters'
import { enumFilter } from '@/lib/filters'
import { CardList, RecordCard, TableWrap } from '@/components/tables/record-list'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { RecordDialog } from '@/components/forms/record-dialog'
import { StatusChanger } from '@/components/forms/status-changer'
import type { ProcurementOrder, Shipment, ShipmentStatus } from '@/lib/database.types'

export const metadata = { title: 'Shipments' }

const STATUSES: readonly ShipmentStatus[] = [
  'awaiting_shipment', 'booked', 'shipped', 'in_transit', 'delayed',
  'arrived_at_port', 'clearing', 'released', 'delivered_to_warehouse', 'closed',
]

const METHODS = ['sea_freight', 'air_freight', 'land', 'courier', 'other'] as const

function fields(batches: { id: string; batch_number: string }[]) {
  return [
    {
      name: 'procurement_order_id', label: 'Procurement batch', type: 'select' as const,
      required: true,
      options: batches.map((b) => ({ value: b.id, label: b.batch_number })),
    },
    {
      name: 'method', label: 'Shipping method', type: 'select' as const, required: true,
      options: METHODS.map((m) => ({ value: m, label: titleCase(m) })),
    },
    { name: 'shipping_company', label: 'Shipping company' },
    { name: 'freight_forwarder', label: 'Freight forwarder' },
    { name: 'container_number', label: 'Container number' },
    { name: 'bill_of_lading_number', label: 'Bill of lading number' },
    { name: 'tracking_number', label: 'Tracking number' },
    { name: 'clearing_agent', label: 'Clearing agent' },
    { name: 'port_of_departure', label: 'Port of departure' },
    { name: 'port_of_arrival', label: 'Port of arrival' },
    { name: 'shipment_date', label: 'Shipment date', type: 'date' as const },
    { name: 'expected_arrival_date', label: 'Expected arrival date', type: 'date' as const },
    { name: 'actual_arrival_date', label: 'Actual arrival date', type: 'date' as const },
    { name: 'clearing_status', label: 'Clearing status' },
    {
      name: 'status', label: 'Status', type: 'select' as const, required: true,
      options: STATUSES.map((s) => ({ value: s, label: titleCase(s) })),
    },
    { name: 'delay_reason', label: 'Delay reason', type: 'textarea' as const },
    { name: 'notes', label: 'Notes', type: 'textarea' as const },
  ]
}

export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const user = await requireUser()
  const cycle = await requireCycle()
  const supabase = await createClient()

  let query = supabase
    .from('shipments')
    .select('*')
    .eq('investment_cycle_id', cycle.investment_cycle_id)

  if (params.q) {
    query = query.or(
      `shipment_number.ilike.%${params.q}%,container_number.ilike.%${params.q}%,bill_of_lading_number.ilike.%${params.q}%,tracking_number.ilike.%${params.q}%`,
    )
  }
  if (params.status) query = query.eq('status', params.status as ShipmentStatus)
  if (params.batch) query = query.eq('procurement_order_id', params.batch)

  const [{ data }, { data: batchRows }] = await Promise.all([
    query.order('expected_arrival_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('procurement_orders')
      .select('id, batch_number')
      .eq('investment_cycle_id', cycle.investment_cycle_id)
      .neq('status', 'cancelled')
      .order('batch_number', { ascending: false }),
  ])

  const shipments = (data ?? []) as Shipment[]
  const batches = (batchRows ?? []) as Pick<ProcurementOrder, 'id' | 'batch_number'>[]
  const batchNumber = new Map(batches.map((b) => [b.id, b.batch_number]))
  const canEdit = can(user.role, 'manageOperations')
  const formFields = fields(batches)

  const inTransit = shipments.filter((s) => ['shipped', 'in_transit'].includes(s.status))
  const delayed = shipments.filter((s) => s.status === 'delayed')
  const atPort = shipments.filter((s) => ['arrived_at_port', 'clearing'].includes(s.status))
  const arrivingSoon = shipments.filter((s) => {
    const days = daysUntil(s.expected_arrival_date)
    return days !== null && days >= 0 && days <= 14 && !['closed', 'delivered_to_warehouse'].includes(s.status)
  })

  return (
    <>
      <PageHeader
        title="Shipments"
        description="Goods on the water and at the port, with their documents and delays."
        actions={
          canEdit && batches.length > 0 ? (
            <RecordDialog
              entity="shipment"
              title="New shipment"
              description="One shipment per procurement batch. The cycle is inherited from the batch."
              fields={formFields}
              defaultValues={{ method: 'sea_freight', status: 'awaiting_shipment' }}
            />
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="In transit" value={String(inTransit.length)} icon={Ship} />
        <StatCard label="At port or clearing" value={String(atPort.length)} tone="gold" />
        <StatCard label="Arriving within 14 days" value={String(arrivingSoon.length)} />
        <StatCard label="Delayed" value={String(delayed.length)}
                  tone={delayed.length > 0 ? 'negative' : 'muted'} />
      </div>

      <ListFilters
        searchPlaceholder="Search by shipment, container, B/L or tracking number…"
        filters={[
          enumFilter('status', 'Status', STATUSES),
          { name: 'batch', label: 'Batches', options: batches.map((b) => ({ value: b.id, label: b.batch_number })) },
        ]}
      />

      {shipments.length === 0 ? (
        <EmptyState
          icon={Ship}
          title="No shipments yet"
          description={
            batches.length === 0
              ? 'Raise a procurement batch first — a shipment always belongs to one.'
              : 'Create a shipment record once goods leave the supplier so arrival can be tracked.'
          }
        />
      ) : (
        <>
          <CardList>
            {shipments.map((s) => (
              <RecordCard
                key={s.id}
                title={s.shipment_number}
                subtitle={batchNumber.get(s.procurement_order_id) ?? undefined}
                badge={<StatusBadge status={s.status} />}
                rows={[
                  { label: 'Method', value: titleCase(s.method) },
                  { label: 'Container', value: s.container_number ?? '—' },
                  { label: 'Departed', value: formatDate(s.shipment_date) },
                  { label: 'Expected', value: formatDate(s.expected_arrival_date) },
                ]}
                footer={
                  canEdit ? (
                    <div className="flex flex-wrap gap-2">
                      <StatusChanger
                        table="shipments"
                        id={s.id}
                        current={s.status}
                        machine="shipment"
                        revalidate={['/shipments', '/dashboard']}
                      />
                      <RecordDialog
                        entity="shipment"
                        recordId={s.id}
                        title={`Edit ${s.shipment_number}`}
                        fields={formFields}
                        defaultValues={s as unknown as Record<string, unknown>}
                        triggerVariant="outline"
                        triggerSize="sm"
                      />
                    </div>
                  ) : null
                }
              />
            ))}
          </CardList>

          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shipment</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Container / B/L</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead>Arrived</TableHead>
                  <TableHead>Status</TableHead>
                  {canEdit ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shipments.map((s) => {
                  const days = daysUntil(s.expected_arrival_date)
                  const overdue =
                    days !== null && days < 0 && !s.actual_arrival_date &&
                    !['closed', 'delivered_to_warehouse', 'released'].includes(s.status)

                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.shipment_number}</TableCell>
                      <TableCell>
                        <Link
                          href={`/procurement/${s.procurement_order_id}`}
                          className="text-muted-foreground hover:underline"
                        >
                          {batchNumber.get(s.procurement_order_id) ?? '—'}
                        </Link>
                      </TableCell>
                      <TableCell>{titleCase(s.method)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.container_number ?? '—'}
                        {s.bill_of_lading_number ? (
                          <span className="block text-xs">{s.bill_of_lading_number}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.port_of_departure && s.port_of_arrival
                          ? `${s.port_of_departure} → ${s.port_of_arrival}`
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {formatDate(s.expected_arrival_date)}
                        {overdue ? (
                          <Badge tone="danger" className="ml-2">
                            {Math.abs(days!)}d late
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>{formatDate(s.actual_arrival_date)}</TableCell>
                      <TableCell>
                        <StatusBadge status={s.status} />
                      </TableCell>
                      {canEdit ? (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <StatusChanger
                              table="shipments"
                              id={s.id}
                              current={s.status}
                              machine="shipment"
                              revalidate={['/shipments', '/dashboard']}
                              label="Status"
                            />
                            <RecordDialog
                              entity="shipment"
                              recordId={s.id}
                              title={`Edit ${s.shipment_number}`}
                              fields={formFields}
                              defaultValues={s as unknown as Record<string, unknown>}
                              triggerVariant="ghost"
                              triggerSize="sm"
                            />
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
