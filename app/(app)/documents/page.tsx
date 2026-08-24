import { FileText } from 'lucide-react'
import { requireUser, can, requireCycle } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/dates'
import { titleCase } from '@/lib/utils'
import { PageHeader, StatCard } from '@/components/ui/page'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { ListFilters } from '@/components/tables/list-filters'
import { Pagination } from '@/components/tables/pagination'
import { PAGE_SIZE, pageFrom, rangeFor } from '@/lib/pagination'
import { CardList, RecordCard, TableWrap } from '@/components/tables/record-list'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { DocumentLink, DocumentUpload } from '@/components/forms/document-upload'
import type { DocumentRow, DocumentType, Profile } from '@/lib/database.types'

export const metadata = { title: 'Documents' }

const DOC_TYPES: readonly DocumentType[] = [
  'supplier_invoice', 'purchase_order', 'quotation', 'shipping_invoice', 'packing_list',
  'bill_of_lading', 'customs_document', 'clearing_receipt', 'goods_receipt_evidence',
  'murabaha_contract', 'business_invoice', 'repayment_proof', 'investor_payment_proof',
  'expense_receipt', 'bank_statement', 'investor_report', 'annual_closing_report',
  'supplier_document', 'product_image', 'other',
]

function fileSize(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default async function DocumentsPage({
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
    .from('documents')
    .select('*', { count: 'exact' })
    .eq('investment_cycle_id', cycle.investment_cycle_id)

  if (params.q) query = query.or(`title.ilike.%${params.q}%,notes.ilike.%${params.q}%`)
  if (params.type) query = query.eq('doc_type', params.type as DocumentType)

  const [
    { data, count }, { data: profileRows }, { data: batchRows },
    { data: saleRows }, { data: supplierRows }, { data: repaymentRows },
  ] = await Promise.all([
    query.order('created_at', { ascending: false }).range(from, to),
    supabase.from('profiles').select('id, full_name'),
    supabase
      .from('procurement_orders')
      .select('id, batch_number')
      .eq('investment_cycle_id', cycle.investment_cycle_id)
      .order('batch_number', { ascending: false }),
    supabase
      .from('murabaha_sales')
      .select('id, contract_number')
      .eq('investment_cycle_id', cycle.investment_cycle_id)
      .order('contract_number', { ascending: false }),
    supabase.from('suppliers').select('id, name').order('name'),
    supabase
      .from('repayments')
      .select('id, receipt_number')
      .eq('investment_cycle_id', cycle.investment_cycle_id)
      .order('receipt_number', { ascending: false }),
  ])

  const documents = (data ?? []) as DocumentRow[]
  const profiles = new Map(
    ((profileRows ?? []) as Pick<Profile, 'id' | 'full_name'>[]).map((p) => [p.id, p.full_name]),
  )
  const canUpload = can(user.role, 'manageOperations')

  const links = [
    {
      table: 'procurement_orders',
      label: 'Procurement batch',
      options: (batchRows ?? []).map((b) => ({ id: b.id, label: b.batch_number })),
    },
    {
      table: 'murabaha_sales',
      label: 'Murābaḥah contract',
      options: (saleRows ?? []).map((s) => ({ id: s.id, label: s.contract_number })),
    },
    {
      table: 'suppliers',
      label: 'Supplier',
      options: (supplierRows ?? []).map((s) => ({ id: s.id, label: s.name })),
    },
    {
      table: 'repayments',
      label: 'Repayment receipt',
      options: (repaymentRows ?? []).map((r) => ({ id: r.id, label: r.receipt_number })),
    },
  ]

  const labelFor = new Map<string, string>()
  for (const group of links) {
    for (const option of group.options) labelFor.set(option.id, option.label)
  }

  return (
    <>
      <PageHeader
        title="Documents"
        description="Invoices, bills of lading, contracts and payment evidence, linked to the transactions they support."
        actions={
          canUpload ? (
            <DocumentUpload cycleId={cycle.investment_cycle_id} links={links} />
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Documents" value={String(count ?? 0)} icon={FileText} />
        <StatCard
          label="Linked to a record"
          value={String(documents.filter((d) => d.record_id).length)}
        />
        <StatCard
          label="Contracts"
          value={String(documents.filter((d) => d.doc_type === 'murabaha_contract').length)}
        />
        <StatCard
          label="Payment evidence"
          value={String(
            documents.filter((d) =>
              ['repayment_proof', 'investor_payment_proof', 'expense_receipt'].includes(d.doc_type),
            ).length,
          )}
        />
      </div>

      <ListFilters
        searchPlaceholder="Search by title or notes…"
        filters={[
          {
            name: 'type',
            label: 'Types',
            options: DOC_TYPES.map((t) => ({ value: t, label: titleCase(t) })),
          },
        ]}
      />

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description="Upload supplier invoices, bills of lading, Murābaḥah contracts and payment proof so every figure can be traced to its source."
        />
      ) : (
        <>
          <CardList>
            {documents.map((d) => (
              <RecordCard
                key={d.id}
                title={d.title}
                subtitle={titleCase(d.doc_type)}
                badge={<Badge tone="neutral">{fileSize(d.file_size)}</Badge>}
                rows={[
                  {
                    label: 'Linked to',
                    value: d.record_id ? labelFor.get(d.record_id) ?? 'Record' : '—',
                  },
                  { label: 'Uploaded by', value: profiles.get(d.uploaded_by ?? '') ?? '—' },
                ]}
                footer={<DocumentLink path={d.file_path} label="Open document" />}
              />
            ))}
          </CardList>

          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Linked to</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded by</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <span className="block font-medium">{d.title}</span>
                      {d.notes ? (
                        <span className="block text-xs text-muted-foreground">{d.notes}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge tone="neutral">{titleCase(d.doc_type)}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {d.record_id ? labelFor.get(d.record_id) ?? 'Record' : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fileSize(d.file_size)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {profiles.get(d.uploaded_by ?? '') ?? '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatDateTime(d.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DocumentLink path={d.file_path} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrap>

          <Pagination page={page} total={count ?? 0} pageSize={PAGE_SIZE} />
        </>
      )}
    </>
  )
}
