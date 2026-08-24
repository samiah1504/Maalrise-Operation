import Link from 'next/link'
import { PackageCheck } from 'lucide-react'
import { requireUser, can, requireCycle } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { confirmGoodsReceipt } from '@/app/actions/finance'
import { formatNaira, formatNumber, toNumber } from '@/lib/money'
import { formatDate, formatDateTime } from '@/lib/dates'
import { PageHeader, StatCard, DetailRow } from '@/components/ui/page'
import { StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { ListFilters } from '@/components/tables/list-filters'
import { enumFilter } from '@/lib/filters'
import { CardList, RecordCard, TableWrap } from '@/components/tables/record-list'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumeric, TableRow,
} from '@/components/ui/table'
import { ConfirmAction } from '@/components/ui/confirm-dialog'
import { GoodsReceiptForm, type ReceivableItem } from '@/components/forms/goods-receipt-form'
import type {
  GoodsReceipt, GoodsReceiptItem, GoodsReceiptStatus, ProcurementItem,
  ProcurementOrder, Product, Warehouse,
} from '@/lib/database.types'

export const metadata = { title: 'Goods Receipts' }

const STATUSES: readonly GoodsReceiptStatus[] = [
  'pending_inspection', 'partially_received', 'fully_received', 'damaged', 'disputed', 'closed',
]

export default async function GoodsReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const user = await requireUser()
  const cycle = await requireCycle()
  const supabase = await createClient()

  let query = supabase
    .from('goods_receipts')
    .select('*')
    .eq('investment_cycle_id', cycle.investment_cycle_id)

  if (params.q) query = query.ilike('grn_number', `%${params.q}%`)
  if (params.status) query = query.eq('status', params.status as GoodsReceiptStatus)
  if (params.batch) query = query.eq('procurement_order_id', params.batch)

  const [
    { data: receiptRows }, { data: batchRows }, { data: itemRows },
    { data: productRows }, { data: warehouseRows }, { data: receiptItemRows },
  ] = await Promise.all([
    query.order('received_date', { ascending: false }),
    supabase
      .from('procurement_orders')
      .select('id, batch_number, landed_cost_finalised, status')
      .eq('investment_cycle_id', cycle.investment_cycle_id)
      .not('status', 'in', '("draft","awaiting_approval","cancelled","closed")')
      .order('batch_number', { ascending: false }),
    supabase.from('procurement_items').select('*'),
    supabase.from('products').select('id, name, product_code'),
    supabase.from('warehouses').select('id, name').eq('is_active', true).order('name'),
    supabase.from('goods_receipt_items').select('*'),
  ])

  const receipts = (receiptRows ?? []) as GoodsReceipt[]
  const batches = (batchRows ?? []) as (Pick<
    ProcurementOrder, 'id' | 'batch_number' | 'landed_cost_finalised' | 'status'
  >)[]
  const items = (itemRows ?? []) as ProcurementItem[]
  const products = new Map(
    ((productRows ?? []) as Pick<Product, 'id' | 'name' | 'product_code'>[]).map((p) => [p.id, p]),
  )
  const warehouses = (warehouseRows ?? []) as Pick<Warehouse, 'id' | 'name'>[]
  const receiptItems = (receiptItemRows ?? []) as GoodsReceiptItem[]

  const batchNumber = new Map(batches.map((b) => [b.id, b.batch_number]))
  const canEdit = can(user.role, 'manageOperations')

  // Only lines with an outstanding quantity can still be received.
  const itemsByBatch: Record<string, ReceivableItem[]> = {}
  for (const b of batches) {
    const open = items
      .filter((i) => i.procurement_order_id === b.id)
      .map((i) => ({
        procurement_item_id: i.id,
        product_id: i.product_id,
        product_name: products.get(i.product_id)?.name ?? 'Product',
        product_code: products.get(i.product_id)?.product_code ?? '',
        outstanding: toNumber(i.quantity) - toNumber(i.quantity_received),
        landed_cost_per_unit: i.landed_cost_per_unit,
      }))
      .filter((i) => i.outstanding > 0)
    if (open.length) itemsByBatch[b.id] = open
  }

  const receivableBatches = batches.filter((b) => itemsByBatch[b.id]?.length)

  const linesFor = (receiptId: string) => receiptItems.filter((i) => i.goods_receipt_id === receiptId)
  const totals = (receiptId: string) =>
    linesFor(receiptId).reduce(
      (acc, l) => ({
        received: acc.received + toNumber(l.quantity_received),
        sellable: acc.sellable + toNumber(l.sellable_quantity),
        damaged: acc.damaged + toNumber(l.damaged_quantity) + toNumber(l.rejected_quantity),
        missing: acc.missing + toNumber(l.missing_quantity),
      }),
      { received: 0, sellable: 0, damaged: 0, missing: 0 },
    )

  const pending = receipts.filter((r) => !r.confirmed_at)

  return (
    <>
      <PageHeader
        title="Goods receipts"
        description="What actually arrived, inspected and counted, before it becomes inventory."
        actions={
          canEdit && receivableBatches.length > 0 && warehouses.length > 0 ? (
            <GoodsReceiptForm
              batches={receivableBatches}
              warehouses={warehouses}
              itemsByBatch={itemsByBatch}
            />
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Receipts" value={String(receipts.length)} />
        <StatCard
          label="Awaiting confirmation"
          value={String(pending.length)}
          tone={pending.length > 0 ? 'gold' : 'muted'}
          hint="Value only enters inventory once confirmed"
        />
        <StatCard label="Fully received" value={String(receipts.filter((r) => r.status === 'fully_received').length)} />
        <StatCard label="Batches awaiting goods" value={String(receivableBatches.length)} />
      </div>

      <ListFilters
        searchPlaceholder="Search by GRN number…"
        filters={[
          enumFilter('status', 'Status', STATUSES),
          { name: 'batch', label: 'Batches', options: batches.map((b) => ({ value: b.id, label: b.batch_number })) },
        ]}
      />

      {receipts.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title="No goods receipts yet"
          description="When a batch arrives at the warehouse, record what was received, damaged or missing."
        />
      ) : (
        <>
          <CardList>
            {receipts.map((r) => {
              const t = totals(r.id)
              return (
                <RecordCard
                  key={r.id}
                  title={r.grn_number}
                  subtitle={`${batchNumber.get(r.procurement_order_id) ?? ''} · ${formatDate(r.received_date)}`}
                  badge={<StatusBadge status={r.status} />}
                  rows={[
                    { label: 'Received', value: formatNumber(t.received) },
                    { label: 'Sellable', value: formatNumber(t.sellable) },
                    { label: 'Damaged / rejected', value: formatNumber(t.damaged) },
                    { label: 'Missing', value: formatNumber(t.missing) },
                  ]}
                  footer={
                    canEdit && !r.confirmed_at ? (
                      <ConfirmAction
                        title="Confirm goods receipt"
                        description="This moves the value out of Cash in Stock and into Inventory, and creates the inventory lots."
                        confirmLabel="Confirm receipt"
                        triggerLabel="Confirm receipt"
                        triggerVariant="gold"
                        triggerSize="sm"
                        reasonPlaceholder="e.g. Inspected on arrival, quantities agreed"
                        action={confirmGoodsReceipt.bind(null, r.id)}
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
                  <TableHead>GRN</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Sellable</TableHead>
                  <TableHead className="text-right">Damaged</TableHead>
                  <TableHead className="text-right">Missing</TableHead>
                  <TableHead>Status</TableHead>
                  {canEdit ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((r) => {
                  const t = totals(r.id)
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.grn_number}</TableCell>
                      <TableCell>
                        <Link
                          href={`/procurement/${r.procurement_order_id}`}
                          className="text-muted-foreground hover:underline"
                        >
                          {batchNumber.get(r.procurement_order_id) ?? '—'}
                        </Link>
                      </TableCell>
                      <TableCell>{formatDate(r.received_date)}</TableCell>
                      <TableNumeric>{formatNumber(t.received)}</TableNumeric>
                      <TableNumeric>{formatNumber(t.sellable)}</TableNumeric>
                      <TableNumeric className={t.damaged > 0 ? 'text-destructive' : undefined}>
                        {formatNumber(t.damaged)}
                      </TableNumeric>
                      <TableNumeric className={t.missing > 0 ? 'text-destructive' : undefined}>
                        {formatNumber(t.missing)}
                      </TableNumeric>
                      <TableCell>
                        <StatusBadge status={r.status} />
                        {r.confirmed_at ? (
                          <span className="block text-xs text-muted-foreground">
                            {formatDateTime(r.confirmed_at)}
                          </span>
                        ) : null}
                      </TableCell>
                      {canEdit ? (
                        <TableCell className="text-right">
                          {!r.confirmed_at ? (
                            <ConfirmAction
                              title="Confirm goods receipt"
                              description="This moves the value out of Cash in Stock and into Inventory, and creates the inventory lots."
                              confirmLabel="Confirm receipt"
                              triggerLabel="Confirm"
                              triggerVariant="gold"
                              triggerSize="sm"
                              reasonPlaceholder="e.g. Inspected on arrival, quantities agreed"
                              details={
                                <dl className="space-y-1">
                                  <DetailRow label="Sellable units">{formatNumber(t.sellable)}</DetailRow>
                                  <DetailRow label="Damaged or rejected">
                                    {formatNumber(t.damaged)}
                                  </DetailRow>
                                  <DetailRow label="Missing">{formatNumber(t.missing)}</DetailRow>
                                </dl>
                              }
                              action={confirmGoodsReceipt.bind(null, r.id)}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">Confirmed</span>
                          )}
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
