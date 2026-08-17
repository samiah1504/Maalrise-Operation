'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ExternalLink, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls'
import { createClient } from '@/lib/supabase/client'
import { getDocumentUrl, recordDocument } from '@/app/actions/documents'
import { titleCase } from '@/lib/utils'

const DOC_TYPES = [
  'supplier_invoice', 'purchase_order', 'quotation', 'shipping_invoice', 'packing_list',
  'bill_of_lading', 'customs_document', 'clearing_receipt', 'goods_receipt_evidence',
  'murabaha_contract', 'business_invoice', 'repayment_proof', 'investor_payment_proof',
  'expense_receipt', 'bank_statement', 'investor_report', 'annual_closing_report',
  'supplier_document', 'product_image', 'other',
] as const

const MAX_BYTES = 25 * 1024 * 1024

/**
 * Uploads straight to Supabase Storage under the signed-in user's session, then
 * records the metadata so the file is searchable and linked to its transaction.
 */
export function DocumentUpload({
  cycleId,
  links,
}: {
  cycleId: string
  links: { table: string; label: string; options: { id: string; label: string }[] }[]
}) {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [docType, setDocType] = useState<(typeof DOC_TYPES)[number]>('supplier_invoice')
  const [title, setTitle] = useState('')
  const [linkTable, setLinkTable] = useState('')
  const [linkId, setLinkId] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const linkGroup = links.find((l) => l.table === linkTable)

  async function submit() {
    setError(null)

    if (!file) {
      setError('Choose a file to upload.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('That file is larger than 25 MB. Please compress it or split it up.')
      return
    }

    setUploading(true)
    const supabase = createClient()

    // Folder by cycle and type keeps the bucket navigable as it grows.
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${cycleId}/${docType}/${Date.now()}-${safeName}`

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(path, file, { cacheControl: '3600', upsert: false })

    setUploading(false)

    if (uploadError) {
      setError(`Upload failed: ${uploadError.message}`)
      return
    }

    startTransition(async () => {
      const result = await recordDocument({
        doc_type: docType,
        title: title || file.name,
        file_path: path,
        file_size: file.size,
        mime_type: file.type,
        record_table: linkTable,
        record_id: linkId,
        investment_cycle_id: cycleId,
        notes,
      })

      if (result.ok) {
        toast.success(result.message ?? 'Document uploaded.')
        setOpen(false)
        setFile(null)
        setTitle('')
        setNotes('')
        router.refresh()
      } else {
        // The file is already in storage; remove it so nothing is orphaned.
        await supabase.storage.from('documents').remove([path])
        setError(result.error)
      }
    })
  }

  const busy = uploading || pending

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" />
        Upload document
      </Button>

      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload document</DialogTitle>
            <DialogDescription>
              Link the file to the record it belongs to so every transaction can be traced back to
              its source document.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="File" htmlFor="doc-file" required hint="Up to 25 MB">
              <Input
                id="doc-file"
                type="file"
                onChange={(e) => {
                  const chosen = e.target.files?.[0] ?? null
                  setFile(chosen)
                  if (chosen && !title) setTitle(chosen.name)
                }}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Document type" htmlFor="doc-type" required>
                <Select
                  id="doc-type"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value as (typeof DOC_TYPES)[number])}
                >
                  {DOC_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {titleCase(t)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Title" htmlFor="doc-title" required>
                <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>

              <Field label="Link to" htmlFor="doc-link-table">
                <Select
                  id="doc-link-table"
                  value={linkTable}
                  onChange={(e) => {
                    setLinkTable(e.target.value)
                    setLinkId('')
                  }}
                >
                  <option value="">Not linked</option>
                  {links.map((l) => (
                    <option key={l.table} value={l.table}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Record" htmlFor="doc-link-id">
                <Select
                  id="doc-link-id"
                  value={linkId}
                  disabled={!linkGroup}
                  onChange={(e) => setLinkId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {linkGroup?.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Notes" htmlFor="doc-notes" error={error ?? undefined}>
              <Textarea id="doc-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy}>
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Opens a private file through a short-lived signed URL. */
export function DocumentLink({ path, label }: { path: string; label?: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await getDocumentUrl(path)
          if (result.ok) {
            window.open(result.data.url, '_blank', 'noopener,noreferrer')
          } else {
            toast.error(result.error)
          }
        })
      }}
    >
      <ExternalLink className="h-4 w-4" />
      {label ?? 'Open'}
    </Button>
  )
}
