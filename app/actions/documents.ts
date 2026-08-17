'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { describeDbError, fail, guard, ok, run } from './helpers'
import { optionalText, optionalUuid, requiredText } from '@/lib/schemas'

/**
 * Document metadata. The file itself is uploaded straight to Supabase Storage
 * from the browser using the signed-in user's own session, so it is subject to
 * the same storage policies — the service-role key is never involved.
 */
const documentSchema = z.object({
  doc_type: z.enum([
    'investor_payment_proof', 'supplier_invoice', 'purchase_order', 'quotation',
    'shipping_invoice', 'packing_list', 'bill_of_lading', 'customs_document',
    'clearing_receipt', 'goods_receipt_evidence', 'murabaha_contract',
    'business_invoice', 'repayment_proof', 'expense_receipt', 'bank_statement',
    'investor_report', 'annual_closing_report', 'supplier_document',
    'product_image', 'other',
  ]),
  title: requiredText('Title'),
  file_path: requiredText('File path', 500),
  file_size: z.coerce.number().int().min(0).optional(),
  mime_type: optionalText(120),
  record_table: optionalText(64),
  record_id: optionalUuid,
  investment_cycle_id: optionalUuid,
  notes: optionalText(),
})

export async function recordDocument(raw: unknown) {
  return run(async () => {
    const parsed = documentSchema.safeParse(raw)
    if (!parsed.success) {
      return fail('Please complete the document details.')
    }

    const { user, supabase } = await guard('ceo', 'operations', 'accounts')

    const { data, error } = await supabase
      .from('documents')
      .insert({ ...parsed.data, uploaded_by: user.id })
      .select('id')
      .single()

    if (error) return fail(describeDbError(error))

    revalidatePath('/documents')
    return ok(data, 'Document uploaded and linked.')
  })
}

/**
 * Short-lived signed URL. The documents bucket is private, so a file is only
 * ever reachable through a link minted for a signed-in user.
 */
export async function getDocumentUrl(path: string) {
  return run(async () => {
    const { supabase } = await guard()

    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(path, 300)

    if (error || !data) {
      return fail('That file could not be opened. It may have been moved or removed.')
    }

    return ok({ url: data.signedUrl })
  })
}

export async function deleteDocument(id: string) {
  return run(async () => {
    const { supabase } = await guard('ceo')

    const { data: document } = await supabase
      .from('documents')
      .select('file_path')
      .eq('id', id)
      .maybeSingle()

    const { error } = await supabase.from('documents').delete().eq('id', id)
    if (error) return fail(describeDbError(error))

    if (document?.file_path) {
      await supabase.storage.from('documents').remove([document.file_path])
    }

    revalidatePath('/documents')
    return ok({ id }, 'Document removed.')
  })
}
