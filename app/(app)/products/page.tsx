import { Package } from 'lucide-react'
import { requireUser, can } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatNaira, formatPercentValue, toNumber } from '@/lib/money'
import { titleCase } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page'
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
import { RecordDialog } from '@/components/forms/record-dialog'
import type { Product, ProductProfitability, Supplier } from '@/lib/database.types'

export const metadata = { title: 'Products' }

const CATEGORIES = [
  'office_furniture', 'home_furniture', 'children_furniture', 'kids_ride_on_cars', 'other',
] as const

const STATUSES = ['active', 'inactive', 'discontinued'] as const

function fields(suppliers: Pick<Supplier, 'id' | 'name'>[]) {
  return [
    { name: 'product_code', label: 'Product code', required: true, hint: 'e.g. MR-P-0001' },
    { name: 'name', label: 'Product name', required: true },
    {
      name: 'category', label: 'Category', type: 'select' as const, required: true,
      options: CATEGORIES.map((c) => ({ value: c, label: titleCase(c) })),
    },
    {
      name: 'supplier_id', label: 'Supplier', type: 'select' as const,
      options: suppliers.map((s) => ({ value: s.id, label: s.name })),
    },
    { name: 'model', label: 'Model' },
    { name: 'colour_options', label: 'Colour options', hint: 'Comma separated' },
    { name: 'dimensions', label: 'Size or dimensions' },
    { name: 'packaging_details', label: 'Packaging details' },
    { name: 'unit_of_measure', label: 'Unit of measurement', required: true },
    {
      name: 'weight_kg', label: 'Weight (kg)', type: 'number' as const,
      hint: 'Used when costs are allocated by weight',
    },
    {
      name: 'volume_cbm', label: 'Volume (cbm)', type: 'number' as const,
      hint: 'Used when costs are allocated by volume',
    },
    { name: 'purchase_currency', label: 'Purchase currency', required: true },
    { name: 'purchase_cost', label: 'Purchase cost', type: 'number' as const, required: true },
    { name: 'est_shipping_cost', label: 'Estimated shipping cost (₦)', type: 'number' as const },
    { name: 'est_landed_cost', label: 'Estimated landed cost (₦)', type: 'number' as const },
    {
      name: 'expected_selling_price', label: 'Expected Murābaḥah price (₦)', type: 'number' as const,
      hint: 'The actual price is set from the finalised landed cost at the point of sale',
    },
    { name: 'image_url', label: 'Image URL', type: 'url' as const },
    {
      name: 'status', label: 'Status', type: 'select' as const, required: true,
      options: STATUSES.map((s) => ({ value: s, label: titleCase(s) })),
    },
    { name: 'description', label: 'Description', type: 'textarea' as const },
    { name: 'notes', label: 'Notes', type: 'textarea' as const },
  ]
}

/** Expected margin, previewed from the catalogue estimates. */
function expectedMargin(p: Product): number {
  const landed = toNumber(p.est_landed_cost)
  if (landed <= 0) return 0
  return ((toNumber(p.expected_selling_price) - landed) / landed) * 100
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const user = await requireUser()
  const supabase = await createClient()
  const page = pageFrom(params)
  const { from, to } = rangeFor(page)

  let query = supabase.from('products').select('*', { count: 'exact' })

  if (params.q) {
    query = query.or(`name.ilike.%${params.q}%,product_code.ilike.%${params.q}%,model.ilike.%${params.q}%`)
  }
  if (params.category) query = query.eq('category', params.category as Product['category'])
  if (params.status) query = query.eq('status', params.status as Product['status'])
  if (params.supplier) query = query.eq('supplier_id', params.supplier)

  const [{ data, count }, { data: supplierRows }, { data: profitability }] = await Promise.all([
    query.order('name').range(from, to),
    supabase.from('suppliers').select('id, name').order('name'),
    supabase.from('v_product_profitability').select('*'),
  ])

  const products = (data ?? []) as Product[]
  const suppliers = (supplierRows ?? []) as Pick<Supplier, 'id' | 'name'>[]
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]))
  const profit = new Map(
    ((profitability ?? []) as ProductProfitability[]).map((p) => [p.product_id, p]),
  )
  const canEdit = can(user.role, 'manageOperations')
  const formFields = fields(suppliers)

  return (
    <>
      <PageHeader
        title="Product catalogue"
        description="Everything MaalRise buys, with cost estimates and realised margins."
        actions={
          canEdit ? (
            <RecordDialog
              entity="product"
              title="Add product"
              fields={formFields}
              defaultValues={{
                category: 'other',
                status: 'active',
                unit_of_measure: 'unit',
                purchase_currency: 'USD',
                purchase_cost: 0,
                est_shipping_cost: 0,
                est_landed_cost: 0,
                expected_selling_price: 0,
              }}
            />
          ) : null
        }
      />

      <ListFilters
        searchPlaceholder="Search by name, code or model…"
        filters={[
          enumFilter('category', 'Category', CATEGORIES),
          enumFilter('status', 'Status', STATUSES),
          { name: 'supplier', label: 'Suppliers', options: suppliers.map((s) => ({ value: s.id, label: s.name })) },
        ]}
      />

      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products yet"
          description="Add the furniture and children's cars MaalRise procures so they can be added to a procurement batch."
        />
      ) : (
        <>
          <CardList>
            {products.map((p) => (
              <RecordCard
                key={p.id}
                title={p.name}
                subtitle={`${p.product_code} · ${titleCase(p.category)}`}
                badge={<StatusBadge status={p.status} />}
                rows={[
                  { label: 'Supplier', value: p.supplier_id ? supplierName.get(p.supplier_id) ?? '—' : '—' },
                  { label: 'Purchase cost', value: `${p.purchase_currency} ${toNumber(p.purchase_cost).toFixed(2)}` },
                  { label: 'Est. landed cost', value: formatNaira(p.est_landed_cost) },
                  { label: 'Expected margin', value: formatPercentValue(expectedMargin(p)) },
                ]}
                footer={
                  canEdit ? (
                    <RecordDialog
                      entity="product"
                      recordId={p.id}
                      title={`Edit ${p.name}`}
                      fields={formFields}
                      defaultValues={p as unknown as Record<string, unknown>}
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
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Purchase cost</TableHead>
                  <TableHead className="text-right">Est. landed cost</TableHead>
                  <TableHead className="text-right">Expected margin</TableHead>
                  <TableHead className="text-right">Realised margin</TableHead>
                  <TableHead>Status</TableHead>
                  {canEdit ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => {
                  const realised = profit.get(p.id)
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <span className="block font-medium">{p.name}</span>
                        <span className="block text-xs text-muted-foreground">{p.product_code}</span>
                      </TableCell>
                      <TableCell>{titleCase(p.category)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.supplier_id ? supplierName.get(p.supplier_id) ?? '—' : '—'}
                      </TableCell>
                      <TableNumeric>
                        {p.purchase_currency} {toNumber(p.purchase_cost).toFixed(2)}
                      </TableNumeric>
                      <TableNumeric>{formatNaira(p.est_landed_cost)}</TableNumeric>
                      <TableNumeric>{formatPercentValue(expectedMargin(p))}</TableNumeric>
                      <TableNumeric>
                        {realised && toNumber(realised.quantity_sold) > 0
                          ? formatPercentValue(realised.margin_pct)
                          : '—'}
                      </TableNumeric>
                      <TableCell>
                        <StatusBadge status={p.status} />
                      </TableCell>
                      {canEdit ? (
                        <TableCell className="text-right">
                          <RecordDialog
                            entity="product"
                            recordId={p.id}
                            title={`Edit ${p.name}`}
                            fields={formFields}
                            defaultValues={p as unknown as Record<string, unknown>}
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
