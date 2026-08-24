import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser, can } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { approveMurabahaSale } from '@/app/actions/finance'
import { formatNaira, formatNumber, formatPercent, toNumber } from '@/lib/money'
import { formatDate, formatDateTime, describeDue } from '@/lib/dates'
import { PageHeader, StatCard, Section, DetailRow } from '@/components/ui/page'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableNumeric, TableRow,
} from '@/components/ui/table'
import { ConfirmAction } from '@/components/ui/confirm-dialog'
import type {
  Business, MurabahaSale, MurabahaSaleItem, ProcurementOrder, Product,
  Repayment, RepaymentAllocation,
} from '@/lib/database.types'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('murabaha_sales')
    .select('contract_number')
    .eq('id', id)
    .maybeSingle()
  return { title: data?.contract_number ?? 'Murābaḥah sale' }
}

export default async function MurabahaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: saleRow } = await supabase
    .from('murabaha_sales')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!saleRow) notFound()
  const sale = saleRow as MurabahaSale

  const [
    { data: itemRows }, { data: productRows }, { data: businessRow },
    { data: allocationRows }, { data: batchRow },
  ] = await Promise.all([
    supabase.from('murabaha_sale_items').select('*').eq('murabaha_sale_id', id),
    supabase.from('products').select('id, name, product_code'),
    supabase.from('businesses').select('*').eq('id', sale.business_id).maybeSingle(),
    supabase.from('repayment_allocations').select('*').eq('murabaha_sale_id', id),
    sale.procurement_order_id
      ? supabase
          .from('procurement_orders')
          .select('id, batch_number')
          .eq('id', sale.procurement_order_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const items = (itemRows ?? []) as MurabahaSaleItem[]
  const products = new Map(
    ((productRows ?? []) as Pick<Product, 'id' | 'name' | 'product_code'>[]).map((p) => [p.id, p]),
  )
  const business = businessRow as Business | null
  const allocations = (allocationRows ?? []) as RepaymentAllocation[]
  const batch = batchRow as Pick<ProcurementOrder, 'id' | 'batch_number'> | null

  const { data: repaymentRows } = allocations.length
    ? await supabase
        .from('repayments')
        .select('*')
        .in('id', allocations.map((a) => a.repayment_id))
        .order('payment_date')
    : { data: [] }

  const repayments = (repaymentRows ?? []) as Repayment[]
  const repaymentById = new Map(repayments.map((r) => [r.id, r]))

  const outstanding = toNumber(sale.selling_price) - toNumber(sale.amount_paid)
  const canApprove = can(user.role, 'approve')
  const pendingApproval = ['draft', 'awaiting_approval'].includes(sale.status)
  const isCreator = sale.created_by === user.id

  return (
    <>
      <PageHeader
        title={sale.contract_number}
        description={`${business?.name ?? 'Business'} · sold ${formatDate(sale.sale_date)}`}
        breadcrumb={[
          { label: 'Murābaḥah sales', href: '/murabaha' },
          { label: sale.contract_number },
        ]}
        actions={<StatusBadge status={sale.status} className="self-center" />}
      />

      {pendingApproval ? (
        <Card className="mb-5 border-warning/40 bg-warning/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div className="text-sm">
              <p className="font-medium">Awaiting approval</p>
              <p className="text-muted-foreground">
                Stock is reserved but the goods have not been released. Approving fixes the
                selling price permanently.
              </p>
            </div>
            {canApprove && !isCreator ? (
              <ConfirmAction
                title="Approve Murābaḥah sale"
                description="This releases the goods from inventory, creates the receivable, and records the revenue and cost of goods sold."
                confirmLabel="Approve sale"
                triggerLabel="Approve sale"
                reasonPlaceholder="e.g. Contract signed by both parties"
                action={approveMurabahaSale.bind(null, sale.id)}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {isCreator
                  ? 'You prepared this contract, so someone else must approve it.'
                  : 'Awaiting the CEO or an Accounts Officer.'}
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* --- The Murabaha disclosure, always visible --------------------- */}
      <Card className="mb-6 border-gold/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Murābaḥah terms</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
            <dl className="divide-y">
              <DetailRow label="MaalRise's disclosed cost">
                {formatNaira(sale.total_cost)}
              </DetailRow>
              <DetailRow label="Agreed markup">{formatPercent(sale.markup_rate)}</DetailRow>
              <DetailRow label="Murābaḥah profit">{formatNaira(sale.markup_amount)}</DetailRow>
              <DetailRow label="Final selling price">
                <strong className="text-base">{formatNaira(sale.selling_price)}</strong>
              </DetailRow>
            </dl>
            <dl className="divide-y">
              <DetailRow label="Amount paid">{formatNaira(sale.amount_paid)}</DetailRow>
              <DetailRow label="Outstanding amount">
                <strong className={outstanding > 0 ? 'text-destructive' : 'text-success'}>
                  {formatNaira(outstanding)}
                </strong>
              </DetailRow>
              <DetailRow label="Repayment period">{sale.repayment_period_days} days</DetailRow>
              <DetailRow label="Due date">
                {formatDate(sale.due_date)}
                {['active', 'partially_paid', 'overdue'].includes(sale.status) ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {describeDue(sale.due_date)}
                  </span>
                ) : null}
              </DetailRow>
            </dl>
          </div>

          {sale.price_frozen ? (
            <p className="mt-4 rounded-md bg-success/10 p-3 text-sm text-success">
              This selling price was fixed on approval. Late repayment does not increase the amount
              owed.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Cost of goods sold" money={sale.total_cost} />
        <StatCard label="Revenue" money={sale.selling_price} />
        <StatCard label="Gross profit" money={sale.markup_amount} tone="positive" />
        <StatCard label="Outstanding" money={outstanding}
                  tone={outstanding > 0 ? 'negative' : 'positive'} />
      </div>

      <div className="space-y-8">
        <Section
          title="Goods sold"
          description={
            batch ? `From procurement batch ${batch.batch_number}` : undefined
          }
        >
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Cost per unit</TableHead>
                  <TableHead className="text-right">Total cost</TableHead>
                  <TableHead className="text-right">Price per unit</TableHead>
                  <TableHead className="text-right">Total price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const product = products.get(item.product_id)
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <span className="block font-medium">{product?.name ?? 'Product'}</span>
                        <span className="block text-xs text-muted-foreground">
                          {product?.product_code}
                        </span>
                      </TableCell>
                      <TableNumeric>{formatNumber(item.quantity)}</TableNumeric>
                      <TableNumeric>{formatNaira(item.unit_cost)}</TableNumeric>
                      <TableNumeric>{formatNaira(item.total_cost)}</TableNumeric>
                      <TableNumeric>{formatNaira(item.unit_selling_price)}</TableNumeric>
                      <TableNumeric className="font-medium">
                        {formatNaira(item.total_selling_price)}
                      </TableNumeric>
                    </TableRow>
                  )
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="font-medium">
                    Total
                  </TableCell>
                  <TableNumeric>{formatNaira(sale.total_cost)}</TableNumeric>
                  <TableCell />
                  <TableNumeric className="font-semibold">
                    {formatNaira(sale.selling_price)}
                  </TableNumeric>
                </TableRow>
              </TableFooter>
            </Table>
          </Card>
          {batch ? (
            <Link
              href={`/procurement/${batch.id}`}
              className="text-sm text-primary hover:underline"
            >
              View the source procurement batch →
            </Link>
          ) : null}
        </Section>

        <Section title="Repayments received">
          {allocations.length === 0 ? (
            <EmptyState
              title="No repayments yet"
              description={`The full ${formatNaira(sale.selling_price)} is outstanding.`}
            />
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Allocated</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allocations.map((a) => {
                    const r = repaymentById.get(a.repayment_id)
                    const reversed = r?.status === 'reversed'
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{r?.receipt_number ?? '—'}</TableCell>
                        <TableCell>{formatDate(r?.payment_date)}</TableCell>
                        <TableCell className="text-muted-foreground">{r?.method ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {r?.payment_reference ?? '—'}
                        </TableCell>
                        <TableNumeric className={toNumber(a.amount) < 0 ? 'text-destructive' : undefined}>
                          {formatNaira(a.amount)}
                        </TableNumeric>
                        <TableCell>
                          {reversed ? <Badge tone="danger">Reversed</Badge> : null}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="font-medium">
                      Total received
                    </TableCell>
                    <TableNumeric className="font-semibold">
                      {formatNaira(sale.amount_paid)}
                    </TableNumeric>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </Card>
          )}
        </Section>

        <Section title="Contract record">
          <Card>
            <CardContent className="pt-6">
              <dl className="grid gap-x-8 sm:grid-cols-2">
                <DetailRow label="Business">{business?.name ?? '—'}</DetailRow>
                <DetailRow label="Contact">{business?.contact_person ?? '—'}</DetailRow>
                <DetailRow label="Sale date">{formatDate(sale.sale_date)}</DetailRow>
                <DetailRow label="Approved">
                  {sale.approved_at ? formatDateTime(sale.approved_at) : 'Not approved'}
                </DetailRow>
              </dl>
              {sale.notes ? (
                <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">{sale.notes}</p>
              ) : null}
            </CardContent>
          </Card>
        </Section>
      </div>
    </>
  )
}
