import Link from 'next/link'
import { Warehouse as WarehouseIcon } from 'lucide-react'
import { requireUser, can, requireCycle } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatNaira, formatNumber, toNumber } from '@/lib/money'
import { formatDate } from '@/lib/dates'
import { titleCase } from '@/lib/utils'
import { PageHeader, StatCard } from '@/components/ui/page'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { ListFilters } from '@/components/tables/list-filters'
import { CardList, RecordCard, TableWrap } from '@/components/tables/record-list'
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableNumeric, TableRow,
} from '@/components/ui/table'
import { WriteOffDialog } from '@/components/forms/inventory-actions'
import type { InventoryValuationRow, ProductCategory, Warehouse } from '@/lib/database.types'

export const metadata = { title: 'Inventory' }

/** Stock age buckets, so slow-moving goods are visible at a glance. */
function ageBadge(days: number) {
  if (days <= 30) return <Badge tone="success">{days}d</Badge>
  if (days <= 60) return <Badge tone="info">{days}d</Badge>
  if (days <= 90) return <Badge tone="warning">{days}d</Badge>
  return <Badge tone="danger">{days}d</Badge>
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const user = await requireUser()
  const cycle = await requireCycle()
  const supabase = await createClient()

  let query = supabase
    .from('v_inventory_valuation')
    .select('*')
    .eq('investment_cycle_id', cycle.investment_cycle_id)

  if (params.q) {
    query = query.or(
      `product_name.ilike.%${params.q}%,product_code.ilike.%${params.q}%,batch_number.ilike.%${params.q}%`,
    )
  }
  if (params.warehouse) query = query.eq('warehouse_id', params.warehouse)
  if (params.category) {
    query = query.eq('product_category', params.category as ProductCategory)
  }

  const [{ data }, { data: warehouseRows }] = await Promise.all([
    query.order('received_date', { ascending: false }),
    supabase.from('warehouses').select('id, name').order('name'),
  ])

  const allLots = (data ?? []) as InventoryValuationRow[]
  const warehouses = (warehouseRows ?? []) as Pick<Warehouse, 'id' | 'name'>[]
  const canWriteOff = can(user.role, 'manageFinance')

  // Sold-out lots are history; the working view is what is still held.
  const showAll = params.view === 'all'
  const lots = showAll
    ? allLots
    : allLots.filter(
        (l) => toNumber(l.quantity_available) + toNumber(l.quantity_reserved) > 0,
      )

  const totals = lots.reduce(
    (acc, l) => ({
      value: acc.value + toNumber(l.stock_value),
      available: acc.available + toNumber(l.quantity_available),
      reserved: acc.reserved + toNumber(l.quantity_reserved),
      sold: acc.sold + toNumber(l.quantity_sold),
    }),
    { value: 0, available: 0, reserved: 0, sold: 0 },
  )

  const aged = lots.filter((l) => l.stock_age_days > 90 && toNumber(l.quantity_available) > 0)

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Goods physically held by MaalRise, valued at landed cost, and not yet sold."
        actions={
          <Link
            href={showAll ? '/inventory' : '/inventory?view=all'}
            className="text-sm text-primary hover:underline"
          >
            {showAll ? 'Show current stock only' : 'Include fully sold lots'}
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Inventory value" money={totals.value} tone="gold" icon={WarehouseIcon} />
        <StatCard label="Units available" value={formatNumber(totals.available)} />
        <StatCard label="Units reserved" value={formatNumber(totals.reserved)}
                  hint="Held for a draft Murābaḥah sale" />
        <StatCard label="Lots over 90 days old" value={String(aged.length)}
                  tone={aged.length > 0 ? 'negative' : 'muted'} />
      </div>

      <ListFilters
        searchPlaceholder="Search by product, code or batch…"
        filters={[
          { name: 'warehouse', label: 'Warehouses', options: warehouses.map((w) => ({ value: w.id, label: w.name })) },
          {
            name: 'category',
            label: 'Categories',
            options: [
              'office_furniture', 'home_furniture', 'children_furniture',
              'kids_ride_on_cars', 'other',
            ].map((c) => ({ value: c, label: titleCase(c) })),
          },
        ]}
      />

      {lots.length === 0 ? (
        <EmptyState
          icon={WarehouseIcon}
          title="No stock on hand"
          description="Inventory appears here once a goods receipt is confirmed, valued at the batch's landed cost."
        />
      ) : (
        <>
          <CardList>
            {lots.map((l) => (
              <RecordCard
                key={l.inventory_lot_id}
                title={l.product_name}
                subtitle={`${l.product_code} · ${l.batch_number}`}
                badge={ageBadge(l.stock_age_days)}
                rows={[
                  { label: 'Available', value: formatNumber(l.quantity_available) },
                  { label: 'Reserved', value: formatNumber(l.quantity_reserved) },
                  { label: 'Unit landed cost', value: formatNaira(l.unit_landed_cost) },
                  { label: 'Stock value', value: formatNaira(l.stock_value) },
                ]}
                footer={
                  canWriteOff && toNumber(l.quantity_available) > 0 ? (
                    <WriteOffDialog
                      lotId={l.inventory_lot_id}
                      productName={l.product_name}
                      available={toNumber(l.quantity_available)}
                      unitCost={l.unit_landed_cost}
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
                  <TableHead>Product</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Reserved</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right">Unit cost</TableHead>
                  <TableHead className="text-right">Stock value</TableHead>
                  {canWriteOff ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lots.map((l) => (
                  <TableRow key={l.inventory_lot_id}>
                    <TableCell>
                      <span className="block font-medium">{l.product_name}</span>
                      <span className="block text-xs text-muted-foreground">{l.product_code}</span>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/procurement/${l.procurement_order_id}`}
                        className="text-muted-foreground hover:underline"
                      >
                        {l.batch_number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{l.warehouse_name ?? '—'}</TableCell>
                    <TableCell>{formatDate(l.received_date)}</TableCell>
                    <TableCell>{ageBadge(l.stock_age_days)}</TableCell>
                    <TableNumeric>{formatNumber(l.quantity_available)}</TableNumeric>
                    <TableNumeric>{formatNumber(l.quantity_reserved)}</TableNumeric>
                    <TableNumeric>{formatNumber(l.quantity_sold)}</TableNumeric>
                    <TableNumeric>{formatNaira(l.unit_landed_cost)}</TableNumeric>
                    <TableNumeric className="font-medium">{formatNaira(l.stock_value)}</TableNumeric>
                    {canWriteOff ? (
                      <TableCell className="text-right">
                        {toNumber(l.quantity_available) > 0 ? (
                          <WriteOffDialog
                            lotId={l.inventory_lot_id}
                            productName={l.product_name}
                            available={toNumber(l.quantity_available)}
                            unitCost={l.unit_landed_cost}
                          />
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} className="font-medium">
                    Total inventory value
                  </TableCell>
                  <TableNumeric>{formatNumber(totals.available)}</TableNumeric>
                  <TableNumeric>{formatNumber(totals.reserved)}</TableNumeric>
                  <TableNumeric>{formatNumber(totals.sold)}</TableNumeric>
                  <TableCell />
                  <TableNumeric className="font-semibold">{formatNaira(totals.value)}</TableNumeric>
                  {canWriteOff ? <TableCell /> : null}
                </TableRow>
              </TableFooter>
            </Table>
          </TableWrap>
        </>
      )}
    </>
  )
}
