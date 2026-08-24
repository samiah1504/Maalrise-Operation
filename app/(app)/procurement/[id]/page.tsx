import { notFound } from 'next/navigation'
import Link from 'next/link'
import { BadgeCheck, Lock, PackageCheck, Ship } from 'lucide-react'
import { requireUser, can } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { approveProcurement, finaliseLandedCost } from '@/app/actions/finance'
import { formatForeign, formatNaira, formatNumber, toNumber } from '@/lib/money'
import { formatDate, formatDateTime } from '@/lib/dates'
import { titleCase } from '@/lib/utils'
import { PageHeader, StatCard, Section, DetailRow } from '@/components/ui/page'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableNumeric, TableRow,
} from '@/components/ui/table'
import { ConfirmAction } from '@/components/ui/confirm-dialog'
import { StatusChanger } from '@/components/forms/status-changer'
import {
  AllocationMethodPicker, ProcurementCostDialog, SupplierPaymentDialog,
} from '@/components/forms/procurement-actions'
import type {
  BankAccount, BatchPosition, GoodsReceipt, ProcurementItem, ProcurementOrder,
  Product, Shipment, ShipmentCost, Supplier, SupplierPayment,
} from '@/lib/database.types'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('procurement_orders')
    .select('batch_number')
    .eq('id', id)
    .maybeSingle()
  return { title: data?.batch_number ?? 'Procurement' }
}

export default async function ProcurementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: orderRow } = await supabase
    .from('procurement_orders')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!orderRow) notFound()
  const order = orderRow as ProcurementOrder

  const [
    { data: itemRows }, { data: productRows }, { data: paymentRows }, { data: costRows },
    { data: shipmentRows }, { data: receiptRows }, { data: positionRow },
    { data: supplierRow }, { data: accountRows },
  ] = await Promise.all([
    supabase.from('procurement_items').select('*').eq('procurement_order_id', id),
    supabase.from('products').select('*'),
    supabase.from('supplier_payments').select('*').eq('procurement_order_id', id).order('payment_date'),
    supabase.from('shipment_costs').select('*').eq('procurement_order_id', id).order('incurred_date'),
    supabase.from('shipments').select('*').eq('procurement_order_id', id),
    supabase.from('goods_receipts').select('*').eq('procurement_order_id', id).order('received_date'),
    supabase.from('v_batch_position').select('*').eq('procurement_order_id', id).maybeSingle(),
    supabase.from('suppliers').select('*').eq('id', order.supplier_id).maybeSingle(),
    supabase.from('bank_accounts').select('id, name').eq('is_active', true).order('name'),
  ])

  const items = (itemRows ?? []) as ProcurementItem[]
  const products = new Map(((productRows ?? []) as Product[]).map((p) => [p.id, p]))
  const payments = (paymentRows ?? []) as SupplierPayment[]
  const costs = (costRows ?? []) as ShipmentCost[]
  const shipments = (shipmentRows ?? []) as Shipment[]
  const receipts = (receiptRows ?? []) as GoodsReceipt[]
  const position = positionRow as BatchPosition | null
  const supplier = supplierRow as Supplier | null
  const accounts = (accountRows ?? []) as Pick<BankAccount, 'id' | 'name'>[]

  const canApprove = can(user.role, 'approve')
  const canEdit = can(user.role, 'manageOperations')
  const canFinance = can(user.role, 'manageFinance')

  const totalCosts = costs.reduce((sum, c) => sum + toNumber(c.amount_naira), 0)
  const landedTotal = items.reduce((sum, i) => sum + toNumber(i.landed_cost_total), 0)
  const outstandingForeign =
    toNumber(order.total_cost_foreign) -
    payments.reduce((sum, p) => sum + toNumber(p.amount_foreign), 0)

  const needsApproval = ['draft', 'awaiting_approval'].includes(order.status)
  const isCreator = order.created_by === user.id

  return (
    <>
      <PageHeader
        title={order.batch_number}
        description={`${supplier?.name ?? 'Supplier'} · raised ${formatDate(order.procurement_date)}`}
        breadcrumb={[
          { label: 'Procurement', href: '/procurement' },
          { label: order.batch_number },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={order.status} className="self-center" />
            {canEdit ? (
              <StatusChanger
                table="procurement_orders"
                id={order.id}
                current={order.status}
                machine="procurement"
                revalidate={['/procurement', `/procurement/${order.id}`, '/dashboard']}
              />
            ) : null}
          </div>
        }
      />

      {/* --- Approval gate ------------------------------------------------ */}
      {needsApproval ? (
        <Card className="mb-5 border-warning/40 bg-warning/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div className="text-sm">
              <p className="font-medium">This batch is awaiting approval</p>
              <p className="text-muted-foreground">
                No supplier payment can be recorded until it is approved. The person who created a
                batch may not approve it.
              </p>
            </div>
            {canApprove && !isCreator ? (
              <ConfirmAction
                title="Approve procurement order"
                description={`Approving ${order.batch_number} allows supplier payments to be recorded against it.`}
                confirmLabel="Approve"
                triggerLabel="Approve"
                triggerIcon={<BadgeCheck className="h-4 w-4" />}
                reasonPlaceholder="e.g. Supplier quote and specification verified"
                details={
                  <dl className="space-y-1">
                    <DetailRow label="Supplier">{supplier?.name ?? '—'}</DetailRow>
                    <DetailRow label="Total purchase cost">
                      {formatNaira(order.total_cost_naira)}
                    </DetailRow>
                    <DetailRow label="Products">{items.length}</DetailRow>
                  </dl>
                }
                action={approveProcurement.bind(null, order.id)}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {isCreator
                  ? 'You raised this batch, so someone else must approve it.'
                  : 'Awaiting approval by the CEO or an Accounts Officer.'}
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Purchase cost" money={order.total_cost_naira}
                  hint={formatForeign(order.total_cost_foreign, order.currency)} />
        <StatCard label="Paid to supplier" money={order.amount_paid_naira} />
        <StatCard label="Balance owed" money={position?.supplier_balance ?? 0} tone="muted" />
        <StatCard label="Direct costs" money={totalCosts} />
        <StatCard label="Capital deployed" money={position?.cash_deployed ?? 0} />
        <StatCard label="Cash in stock" money={position?.cash_in_stock ?? 0}
                  hint="Clears when the goods are received" />
        <StatCard label="Total landed cost" money={landedTotal} tone="gold" />
        <StatCard label="Value in inventory" money={position?.on_hand_value ?? 0} />
      </div>

      <div className="space-y-8">
        {/* --- Items and landed cost ------------------------------------- */}
        <Section
          title="Products and landed cost"
          description={
            order.landed_cost_finalised
              ? 'Landed cost is finalised. This is the disclosed cost basis for any Murābaḥah sale from this batch.'
              : 'Landed cost is provisional until it is finalised. Goods cannot be sold from this batch before then.'
          }
          actions={
            <div className="flex flex-wrap items-center gap-3">
              {canEdit ? (
                <AllocationMethodPicker
                  procurementId={order.id}
                  current={order.allocation_method}
                  disabled={order.landed_cost_finalised}
                />
              ) : null}
              {canFinance && !order.landed_cost_finalised && items.length > 0 ? (
                <ConfirmAction
                  title="Finalise landed cost"
                  description="Once finalised, no further cost lines can be added to this batch and the landed cost becomes the disclosed Murābaḥah cost."
                  confirmLabel="Finalise landed cost"
                  triggerLabel="Finalise landed cost"
                  triggerVariant="gold"
                  triggerSize="sm"
                  triggerIcon={<Lock className="h-4 w-4" />}
                  reasonPlaceholder="e.g. All shipping, customs and clearing invoices received"
                  details={
                    <dl className="space-y-1">
                      <DetailRow label="Purchase cost">{formatNaira(order.total_cost_naira)}</DetailRow>
                      <DetailRow label="Direct costs">{formatNaira(totalCosts)}</DetailRow>
                      <DetailRow label="Total landed cost">
                        <strong>{formatNaira(landedTotal)}</strong>
                      </DetailRow>
                    </dl>
                  }
                  action={finaliseLandedCost.bind(null, order.id)}
                />
              ) : null}
              {order.landed_cost_finalised ? (
                <Badge tone="success">
                  Finalised {formatDate(order.landed_cost_finalised_at)}
                </Badge>
              ) : null}
            </div>
          }
        >
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Purchase (₦)</TableHead>
                  <TableHead className="text-right">Allocated costs</TableHead>
                  <TableHead className="text-right">Landed cost</TableHead>
                  <TableHead className="text-right">Per unit</TableHead>
                  <TableHead className="text-right">Received</TableHead>
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
                      <TableNumeric>
                        {formatForeign(item.unit_price_foreign, order.currency)}
                      </TableNumeric>
                      <TableNumeric>{formatNaira(item.line_total_naira)}</TableNumeric>
                      <TableNumeric>{formatNaira(item.allocated_cost_naira)}</TableNumeric>
                      <TableNumeric className="font-medium">
                        {formatNaira(item.landed_cost_total)}
                      </TableNumeric>
                      <TableNumeric>{formatNaira(item.landed_cost_per_unit)}</TableNumeric>
                      <TableNumeric>
                        {formatNumber(item.quantity_received)} / {formatNumber(item.quantity)}
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
                  <TableNumeric>{formatNaira(order.total_cost_naira)}</TableNumeric>
                  <TableNumeric>{formatNaira(totalCosts)}</TableNumeric>
                  <TableNumeric className="font-semibold">{formatNaira(landedTotal)}</TableNumeric>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableFooter>
            </Table>
          </Card>
        </Section>

        {/* --- Supplier payments ----------------------------------------- */}
        <Section
          title="Supplier payments"
          description="Each payment records the rate used, so historical Naira values never move."
          actions={
            canFinance && !needsApproval && order.status !== 'cancelled' ? (
              <SupplierPaymentDialog
                procurementId={order.id}
                batchNumber={order.batch_number}
                currency={order.currency}
                defaultRate={order.exchange_rate}
                outstandingForeign={Math.max(outstandingForeign, 0)}
                accounts={accounts}
              />
            ) : null
          }
        >
          {payments.length === 0 ? (
            <EmptyState title="No payments recorded yet" description="The full amount is still owed to the supplier." />
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Naira</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{formatDate(p.payment_date)}</TableCell>
                      <TableNumeric>{formatForeign(p.amount_foreign, p.currency)}</TableNumeric>
                      <TableNumeric>{formatNumber(p.exchange_rate, 2)}</TableNumeric>
                      <TableNumeric className="font-medium">{formatNaira(p.amount_naira)}</TableNumeric>
                      <TableCell className="text-muted-foreground">
                        {p.payment_reference ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </Section>

        {/* --- Direct costs ---------------------------------------------- */}
        <Section
          title="Direct procurement costs"
          description="Capitalised into landed cost, so they are never also counted as operating expenses."
          actions={
            canEdit && !order.landed_cost_finalised ? (
              <ProcurementCostDialog
                procurementId={order.id}
                batchNumber={order.batch_number}
                shipmentId={shipments[0]?.id}
                accounts={accounts}
              />
            ) : null
          }
        >
          {costs.length === 0 ? (
            <EmptyState
              title="No cost lines yet"
              description="Add freight, customs, clearing and other direct costs as their invoices arrive."
            />
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cost type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costs.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{titleCase(c.cost_type)}</TableCell>
                      <TableCell className="text-muted-foreground">{c.description ?? '—'}</TableCell>
                      <TableCell>{formatDate(c.incurred_date)}</TableCell>
                      <TableCell>
                        {c.cash_transaction_id ? (
                          <Badge tone="success">Paid</Badge>
                        ) : (
                          <Badge tone="warning">Unpaid</Badge>
                        )}
                      </TableCell>
                      <TableNumeric>{formatNaira(c.amount_naira)}</TableNumeric>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="font-medium">
                      Total direct costs
                    </TableCell>
                    <TableNumeric className="font-semibold">{formatNaira(totalCosts)}</TableNumeric>
                  </TableRow>
                </TableFooter>
              </Table>
            </Card>
          )}
        </Section>

        {/* --- Shipment and receipts -------------------------------------- */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Section
            title="Shipment"
            actions={
              <Button asChild variant="outline" size="sm">
                <Link href={`/shipments?batch=${order.id}`}>
                  <Ship className="h-4 w-4" />
                  Manage
                </Link>
              </Button>
            }
          >
            {shipments.length === 0 ? (
              <EmptyState title="No shipment recorded" description="Create a shipment record once the goods leave the supplier." />
            ) : (
              shipments.map((s) => (
                <Card key={s.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm">{s.shipment_number}</CardTitle>
                      <StatusBadge status={s.status} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <dl className="divide-y">
                      <DetailRow label="Method">{titleCase(s.method)}</DetailRow>
                      <DetailRow label="Container">{s.container_number ?? '—'}</DetailRow>
                      <DetailRow label="Bill of lading">{s.bill_of_lading_number ?? '—'}</DetailRow>
                      <DetailRow label="Departed">{formatDate(s.shipment_date)}</DetailRow>
                      <DetailRow label="Expected arrival">{formatDate(s.expected_arrival_date)}</DetailRow>
                      <DetailRow label="Actual arrival">{formatDate(s.actual_arrival_date)}</DetailRow>
                    </dl>
                  </CardContent>
                </Card>
              ))
            )}
          </Section>

          <Section
            title="Goods receipts"
            actions={
              <Button asChild variant="outline" size="sm">
                <Link href={`/goods-receipts?batch=${order.id}`}>
                  <PackageCheck className="h-4 w-4" />
                  Manage
                </Link>
              </Button>
            }
          >
            {receipts.length === 0 ? (
              <EmptyState
                title="Nothing received yet"
                description="Record a goods receipt when the batch arrives at the warehouse."
              />
            ) : (
              <div className="space-y-3">
                {receipts.map((r) => (
                  <Card key={r.id}>
                    <CardContent className="flex items-center justify-between gap-3 pt-6">
                      <div>
                        <Link href={`/goods-receipts/${r.id}`} className="font-medium hover:underline">
                          {r.grn_number}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          Received {formatDate(r.received_date)}
                          {r.confirmed_at ? ` · confirmed ${formatDateTime(r.confirmed_at)}` : ''}
                        </p>
                      </div>
                      <StatusBadge status={r.status} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* --- Timeline ---------------------------------------------------- */}
        <Section title="Batch timeline">
          <Card>
            <CardContent className="pt-6">
              <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                <DetailRow label="Procurement date">{formatDate(order.procurement_date)}</DetailRow>
                <DetailRow label="Payment due">{formatDate(order.payment_due_date)}</DetailRow>
                <DetailRow label="Production start">{formatDate(order.production_start_date)}</DetailRow>
                <DetailRow label="Production completion">
                  {formatDate(order.expected_production_completion)}
                </DetailRow>
                <DetailRow label="Expected shipment">{formatDate(order.expected_shipment_date)}</DetailRow>
                <DetailRow label="Expected arrival">{formatDate(order.expected_arrival_date)}</DetailRow>
                <DetailRow label="First receipt">{formatDate(position?.first_receipt_date)}</DetailRow>
                <DetailRow label="Approved">
                  {order.approved_at ? formatDateTime(order.approved_at) : 'Not approved'}
                </DetailRow>
              </dl>
              {order.notes ? (
                <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">{order.notes}</p>
              ) : null}
            </CardContent>
          </Card>
        </Section>
      </div>
    </>
  )
}
