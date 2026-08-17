'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, type FieldValues } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Pencil, Plus } from 'lucide-react'
import type { z } from 'zod'
import {
  bankAccountSchema, businessSchema, cycleSchema, expenseSchema, investorSchema,
  productSchema, shipmentSchema, supplierSchema,
} from '@/lib/schemas'
import { Button, type ButtonProps } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls'
import type { ActionResult } from '@/app/actions/helpers'
import { cn } from '@/lib/utils'

/**
 * One form component behind every record dialog. Field definitions are plain
 * data (so they can be built in a Server Component), while the Zod schema is
 * picked up here by name — the same schema the server action re-validates with.
 */
const SCHEMAS = {
  cycle: cycleSchema,
  investor: investorSchema,
  supplier: supplierSchema,
  product: productSchema,
  business: businessSchema,
  bankAccount: bankAccountSchema,
  shipment: shipmentSchema,
  expense: expenseSchema,
} satisfies Record<string, z.ZodTypeAny>

export type SchemaName = keyof typeof SCHEMAS

export interface FormField {
  name: string
  label: string
  type?: 'text' | 'number' | 'date' | 'textarea' | 'select' | 'email' | 'tel' | 'url'
  options?: { value: string; label: string }[]
  required?: boolean
  hint?: string
  placeholder?: string
  step?: string
  /** Full width on the two-column grid. Defaults to true for textareas. */
  wide?: boolean
  disabled?: boolean
}

export function EntityFormDialog({
  title,
  description,
  schema,
  fields,
  defaultValues,
  action,
  triggerLabel,
  triggerVariant = 'default',
  triggerSize,
  submitLabel,
  open: controlledOpen,
  onOpenChange,
  hideTrigger,
  triggerIcon = 'plus',
}: {
  title: string
  description?: string
  schema: SchemaName
  fields: FormField[]
  defaultValues?: Record<string, unknown>
  action: (values: unknown) => Promise<ActionResult<unknown>>
  triggerLabel?: string
  triggerVariant?: ButtonProps['variant']
  triggerSize?: ButtonProps['size']
  submitLabel?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  hideTrigger?: boolean
  triggerIcon?: 'plus' | 'edit' | 'none'
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  const router = useRouter()

  const form = useForm<FieldValues>({
    resolver: zodResolver(SCHEMAS[schema]),
    defaultValues,
  })

  const {
    register, handleSubmit, reset, setError,
    formState: { errors, isSubmitting },
  } = form

  useEffect(() => {
    if (open) reset(defaultValues)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function onSubmit(values: FieldValues) {
    const result = await action(values)

    if (result.ok) {
      toast.success(result.message ?? 'Saved.')
      setOpen(false)
      router.refresh()
      return
    }

    if (result.fieldErrors) {
      for (const [name, message] of Object.entries(result.fieldErrors)) {
        setError(name as never, { message })
      }
    }
    toast.error(result.error)
  }

  return (
    <>
      {hideTrigger ? null : (
        <Button variant={triggerVariant} size={triggerSize} onClick={() => setOpen(true)}>
          {triggerIcon === 'plus' ? <Plus className="h-4 w-4" /> : null}
          {triggerIcon === 'edit' ? <Pencil className="h-4 w-4" /> : null}
          {triggerLabel ?? title}
        </Button>
      )}

      <Dialog open={open} onOpenChange={(next) => !isSubmitting && setOpen(next)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((field) => {
                const error = errors[field.name]?.message as string | undefined
                const wide = field.wide ?? field.type === 'textarea'

                return (
                  <Field
                    key={field.name}
                    label={field.label}
                    htmlFor={field.name}
                    error={error}
                    hint={field.hint}
                    required={field.required}
                    className={cn(wide && 'sm:col-span-2')}
                  >
                    {field.type === 'textarea' ? (
                      <Textarea
                        id={field.name}
                        rows={3}
                        placeholder={field.placeholder}
                        disabled={field.disabled}
                        {...register(field.name)}
                      />
                    ) : field.type === 'select' ? (
                      <Select id={field.name} disabled={field.disabled} {...register(field.name)}>
                        {!field.required ? <option value="">— None —</option> : null}
                        {field.options?.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Input
                        id={field.name}
                        type={field.type ?? 'text'}
                        step={field.step ?? (field.type === 'number' ? 'any' : undefined)}
                        inputMode={field.type === 'number' ? 'decimal' : undefined}
                        placeholder={field.placeholder}
                        disabled={field.disabled}
                        {...register(field.name)}
                      />
                    )}
                  </Field>
                )
              })}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" loading={isSubmitting}>
                {submitLabel ?? 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Edit trigger used in list rows. */
export function EditRecordButton(
  props: Omit<Parameters<typeof EntityFormDialog>[0], 'triggerLabel' | 'triggerVariant'>,
) {
  return (
    <EntityFormDialog
      {...props}
      triggerLabel="Edit"
      triggerVariant="ghost"
      triggerSize="sm"
      triggerIcon="edit"
      submitLabel="Save changes"
    />
  )
}
