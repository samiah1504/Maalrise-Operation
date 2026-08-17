import Link from 'next/link'
import { Boxes } from 'lucide-react'
import { requireUser, can, requireCycle } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { createClient } from '@/lib/supabase/server'
import { approveMurabahaSale } from '@/app/actions/finance'
import { formatNaira, formatPercent, toNumber } from '@/lib/money'
import { formatDate, describeDue } from '@/lib/dates'
import { PageHeader, StatCard, DetailRow } from '@/components/ui/page'
import { StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { ListFilters, enumFilter } from '@/components/tables/list-filters'
import { CardList, RecordCard, TableWrap } from '@/components/tables/record-list'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumeric, TableRow,
} from '@/components/ui/table'
import { ConfirmAction } from '@/components/ui/confirm-dialog'
import { MurabahaForm, type SellableLot } from '@/components/forms/murabaha-form'
import type {
  Business, InventoryValuationRow, MurabahaSale, MurabahaStatus, ProcurementOrder,
} from '@/lib/database.types'

export const metadata = { title: 'Murābaḥah Sales' }

const STATUSES: readonly MurabahaStatus[] = [
  'draft', 'awaiting_approval', 'approved', 'goods_released', 'active',
  'partially_paid', 'fully_paid', 'overdue', 'disputed', 'cancelled',
]

export default async function MurabahaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const user = await requireUser()
  const cycle = await requireCycle()
  const settings = await getSettings()
  const supabase = await createClient()

  let query = supabase
    .from('murabaha_sales')
    .select('*')
    .eq('investment_cycle_id', cycle.investment_cycle_id)

  if (params.q) query = query.ilike('contract_number', `%${params.q}%`)
  if (params.status) query = query.eq('status', params.status as MurabahaStatus)
  if (params.business) query = query.eq('business_id', params.business)

  const [{ data }, { data: businessRows }, { data: lotRows }, { data: finalisedBatches }] =
    await Promise.all([
      query.order('sale_date', { ascending: false }),
      supabase
        .from('businesses')
        .select('id, name, standard_repayment_days')
        .eq('status', 'active')
        .order('name'),
      supabase
        .from('v_inventory_valuation')
        .select('*')
        .eq('investment_cycle_id', cycle.investment_cycle_id)
        .gt('quantity_available', 0),
      supabase
        .from('procurement_orders')
        .select('id')
        .eq('investment_cycle_id', cycle.investment_cycle_id)
        .eq('landed_cost_finalised', true),
    ])

  const sales = (data ?? []) as MurabahaSale[]
  const businesses = (businessRows ?? []) as Pick<
    Business, 'id' | 'name' | 'standard_repayment_days'
  >[]
  const businessName = new Map(businesses.map((b) => [b.id, b.name]))
  const canEdit = can(user.role, 'manageOperations')
  const canApprove = can(user.role, 'approve')

  // Goods must be owned and fully costed before they can be sold.
  const sellableBatchIds = new Set(
    ((finalisedBatches ?? []) as Pick<ProcurementOrder, 'id'>[]).map((b) => b.id),
  )
  const lots: SellableLot[] = ((lotRows ?? []) as InventoryValuationRow[])
    .filter((l) => sellableBatchIds.has(l.procurement_order_id))
    .map((l) => ({
      inventory_lot_id: l.inventory_lot_id,
      product_name: l.product_name,
      product_code: l.product_code,
      batch_number: l.batch_number,
      quantity_available: l.quantity_available,
      unit_landed_cost: l.unit_landed_cost,
    }))

  const active = sales.filter((s) =>
    ['approved', 'goods_released', 'active', 'partially_paid', 'overdue'].includes(s.status),
  )
  const totalSales = sales
    .filter((s) => s.status !== 'draft' && s.status !== 'cancelled' && s.status !== 'awaiting_approval')
    .reduce((sum, s) => sum + toNumber(s.selling_price), 0)
  const totalProfit = sales
    .filter((s) => s.status !== 'draft' && s.status !== 'cancelled' && s.status !== 'awaiting_approval')
    .reduce((sum, s) => sum + toNumber(s.markup_amount), 0)
  const outstanding = active.reduce(
    (sum, s) => sum + toNumber(s.selling_price) - toNumber(s.amount_paid),
    0,
  )
  const awaiting = sales.filter((s) => ['draft', 'awaiting_approval'].includes(s.status))

  return (
    <>
      <PageHeader
        title="Murābaḥah sales"
        description={`${cycle.name} · Cost-plus sales of goods MaalRise owns, to an operating business.`}
        actions={
          canEdit && businesses.length > 0 && lots.length > 0 ? (
            <MurabahaForm
              businesses={businesses}
              lots={lots}
              cycleId={cycle.investment_cycle_id}
              cycleName={cycle.name}
              defaultMarkup={Number(settings['murabaha.default_markup'])}
              defaultRepaymentDays={Number(settings['murabaha.default_repayment_days'])}
            />
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total sales" money={totalSales} />
        <StatCard label="Murābaḥah profit" money={totalProfit} tone="positive" />
        <StatCard label="Outstanding" money={outstanding} href="/receivables" />
        <StatCard label="Awaiting approval" value={String(awaiting.length)}
                  tone={awaiting.length > 0 ? 'gold' : 'muted'} />
      </div>

      <ListFilters
        searchPlaceholder="Search by contract number…"
        filters={[
          enumFilter('status', 'Status', STATUSES),
          { name: 'business', label: 'Businesses', options: businesses.map((b) => ({ value: b.id, label: b.name })) },
        ]}
      />

      {sales.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No Murābaḥah contracts yet"
          description={
            lots.length === 0
              ? 'Goods must be received into inventory and their landed cost finalised before they can be sold.'
              : 'Create the first contract from inventory MaalRise already owns.'
          }
        />
      ) : (
        <>
          <CardList>
            {sales.map((s) => (
              <RecordCard
                key={s.id}
                href={`/murabaha/${s.id}`}
                title={s.contract_number}
                subtitle={`${businessName.get(s.business_id) ?? ''} · ${formatDate(s.sale_date)}`}
                badge={<StatusBadge status={s.status} />}
                rows={[
                  { label: 'Disclosed cost', value: formatNaira(s.total_cost) },
                  { label: 'Profit', value: formatNaira(s.markup_amount) },
                  { label: 'Selling price', value: formatNaira(s.selling_price) },
                  {
                    label: 'Outstanding',
                    value: formatNaira(toNumber(s.selling_price) - toNumber(s.amount_paid)),
                  },
                ]}
              />
            ))}
          </CardList>

          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contract</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Sale date</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Markup</TableHead>
                  <TableHead className="text-right">Selling price</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  {canApprove ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((s) => {
                  const isCreator = s.created_by === user.id
                  const pendingApproval = ['draft', 'awaiting_approval'].includes(s.status)
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Link href={`/murabaha/${s.id}`} className="font-medium hover:underline">
                          {s.contract_number}
                        </Link>
                        {s.price_frozen ? (
                          <span className="block text-xs text-success">Price fixed</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {businessName.get(s.business_id) ?? '—'}
                      </TableCell>
                      <TableCell>{formatDate(s.sale_date)}</TableCell>
                      <TableNumeric>{formatNaira(s.total_cost)}</TableNumeric>
                      <TableNumeric>
                        {formatNaira(s.markup_amount)}
                        <span className="block text-xs text-muted-foreground">
                          {formatPercent(s.markup_rate)}
                        </span>
                      </TableNumeric>
                      <TableNumeric className="font-medium">{formatNaira(s.selling_price)}</TableNumeric>
                      <TableNumeric>{formatNaira(s.amount_paid)}</TableNumeric>
                      <TableNumeric>
                        {formatNaira(toNumber(s.selling_price) - toNumber(s.amount_paid))}
                      </TableNumeric>
                      <TableCell className="text-xs">
                        {formatDate(s.due_date)}
                        <span className="block text-muted-foreground">
                          {['active', 'partially_paid', 'overdue'].includes(s.status)
                            ? describeDue(s.due_date)
                            : ''}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={s.status} />
                      </TableCell>
                      {canApprove ? (
                        <TableCell className="text-right">
                          {pendingApproval && !isCreator ? (
                            <ConfirmAction
                              title="Approve Murābaḥah sale"
                              description="Approving releases the goods, creates the receivable and fixes the selling price permanently."
                              confirmLabel="Approve sale"
                              triggerLabel="Approve"
                              triggerSize="sm"
                              reasonPlaceholder="e.g. Contract signed by both parties"
                              details={
                                <dl className="space-y-1">
                                  <DetailRow label="Disclosed cost">{formatNaira(s.total_cost)}</DetailRow>
                                  <DetailRow label="Murābaḥah profit">
                                    {formatNaira(s.markup_amount)}
                                  </DetailRow>
                                  <DetailRow label="Selling price">
                                    <strong>{formatNaira(s.selling_price)}</strong>
                                  </DetailRow>
                                  <DetailRow label="Due">{formatDate(s.due_date)}</DetailRow>
                                </dl>
                              }
                              action={(reason) => approveMurabahaSale(s.id, reason)}
                            />
                          ) : pendingApproval ? (
                            <span className="text-xs text-muted-foreground">
                              Needs another approver
                            </span>
                          ) : null}
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
