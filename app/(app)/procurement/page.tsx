import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'
import { requireUser, can, requireCycle } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatNaira, formatNumber, toNumber } from '@/lib/money'
import { formatDate } from '@/lib/dates'
import { PageHeader, StatCard } from '@/components/ui/page'
import { StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { ListFilters } from '@/components/tables/list-filters'
import { enumFilter } from '@/lib/filters'
import { Pagination } from '@/components/tables/pagination'
import { PAGE_SIZE, pageFrom, rangeFor } from '@/lib/pagination'
import { CardList, RecordCard, TableWrap } from '@/components/tables/record-list'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumeric, TableRow,
} from '@/components/ui/table'
import { ProcurementForm } from '@/components/forms/procurement-form'
import type {
  BatchPosition, ProcurementOrder, ProcurementStatus, Product, Supplier,
} from '@/lib/database.types'

export const metadata = { title: 'Procurement Orders' }

const STATUSES: readonly ProcurementStatus[] = [
  'draft', 'awaiting_approval', 'approved', 'supplier_payment_pending', 'partially_paid',
  'fully_paid', 'in_production', 'production_completed', 'ready_for_shipment', 'shipped',
  'in_transit', 'at_port', 'clearing', 'partially_received', 'received', 'closed', 'cancelled',
]

export default async function ProcurementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const user = await requireUser()
  const cycle = await requireCycle()
  const supabase = await createClient()
  const page = pageFrom(params)
  const { from, to } = rangeFor(page)

  let query = supabase
    .from('procurement_orders')
    .select('*', { count: 'exact' })
    .eq('investment_cycle_id', cycle.investment_cycle_id)

  if (params.q) query = query.ilike('batch_number', `%${params.q}%`)
  if (params.status) query = query.eq('status', params.status as ProcurementStatus)
  if (params.supplier) query = query.eq('supplier_id', params.supplier)

  const [{ data, count }, { data: supplierRows }, { data: productRows }, { data: positions }] =
    await Promise.all([
      query.order('procurement_date', { ascending: false }).range(from, to),
      supabase.from('suppliers').select('id, name, currency').eq('status', 'active').order('name'),
      supabase
        .from('products')
        .select('id, name, product_code, supplier_id, purchase_cost')
        .eq('status', 'active')
        .order('name'),
      supabase
        .from('v_batch_position')
        .select('*')
        .eq('investment_cycle_id', cycle.investment_cycle_id),
    ])

  const orders = (data ?? []) as ProcurementOrder[]
  const suppliers = (supplierRows ?? []) as Pick<Supplier, 'id' | 'name' | 'currency'>[]
  const products = (productRows ?? []) as Pick<
    Product, 'id' | 'name' | 'product_code' | 'supplier_id' | 'purchase_cost'
  >[]
  const position = new Map(
    ((positions ?? []) as BatchPosition[]).map((p) => [p.procurement_order_id, p]),
  )
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]))
  const canEdit = can(user.role, 'manageOperations')

  const all = (positions ?? []) as BatchPosition[]
  const totalDeployed = all.reduce((sum, p) => sum + toNumber(p.cash_deployed), 0)
  const totalInStock = all.reduce((sum, p) => sum + toNumber(p.cash_in_stock), 0)
  const totalOwed = all.reduce((sum, p) => sum + toNumber(p.supplier_balance), 0)

  return (
    <>
      <PageHeader
        title="Procurement orders"
        description={`${cycle.name} · Each batch carries its own costs, landed cost and capital cycle.`}
        actions={
          canEdit && suppliers.length > 0 && products.length > 0 ? (
            <ProcurementForm
              suppliers={suppliers}
              products={products}
              cycleId={cycle.investment_cycle_id}
              cycleName={cycle.name}
            />
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Batches" value={formatNumber(count ?? 0)} />
        <StatCard label="Capital deployed" money={totalDeployed} />
        <StatCard label="Cash in Stock" money={totalInStock} hint="Paid for, not yet received" />
        <StatCard label="Owed to suppliers" money={totalOwed} tone="muted" />
      </div>

      <ListFilters
        searchPlaceholder="Search by batch number…"
        filters={[
          enumFilter('status', 'Status', STATUSES),
          { name: 'supplier', label: 'Suppliers', options: suppliers.map((s) => ({ value: s.id, label: s.name })) },
        ]}
      />

      {orders.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="No procurement batches yet"
          description={
            suppliers.length === 0 || products.length === 0
              ? 'Add at least one supplier and one product first, then raise a procurement batch.'
              : 'Raise the first batch to start deploying capital into goods.'
          }
        />
      ) : (
        <>
          <CardList>
            {orders.map((o) => {
              const p = position.get(o.id)
              return (
                <RecordCard
                  key={o.id}
                  href={`/procurement/${o.id}`}
                  title={o.batch_number}
                  subtitle={`${supplierName.get(o.supplier_id) ?? 'Supplier'} · ${formatDate(o.procurement_date)}`}
                  badge={<StatusBadge status={o.status} />}
                  rows={[
                    { label: 'Purchase cost', value: formatNaira(o.total_cost_naira) },
                    { label: 'Paid', value: formatNaira(o.amount_paid_naira) },
                    { label: 'Cash in stock', value: formatNaira(p?.cash_in_stock ?? 0) },
                    {
                      label: 'Landed cost',
                      value: o.landed_cost_finalised
                        ? formatNaira(p?.landed_cost_total ?? 0)
                        : 'Not finalised',
                    },
                  ]}
                />
              )
            })}
          </CardList>

          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Purchase cost</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Direct costs</TableHead>
                  <TableHead className="text-right">Cash in stock</TableHead>
                  <TableHead>Expected arrival</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => {
                  const p = position.get(o.id)
                  return (
                    <TableRow key={o.id}>
                      <TableCell>
                        <Link href={`/procurement/${o.id}`} className="font-medium hover:underline">
                          {o.batch_number}
                        </Link>
                        {o.landed_cost_finalised ? (
                          <span className="block text-xs text-success">Landed cost finalised</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {supplierName.get(o.supplier_id) ?? '—'}
                      </TableCell>
                      <TableCell>{formatDate(o.procurement_date)}</TableCell>
                      <TableNumeric>{formatNaira(o.total_cost_naira)}</TableNumeric>
                      <TableNumeric>{formatNaira(o.amount_paid_naira)}</TableNumeric>
                      <TableNumeric>{formatNaira(p?.direct_costs ?? 0)}</TableNumeric>
                      <TableNumeric>{formatNaira(p?.cash_in_stock ?? 0)}</TableNumeric>
                      <TableCell>{formatDate(o.expected_arrival_date)}</TableCell>
                      <TableCell>
                        <StatusBadge status={o.status} />
                      </TableCell>
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
