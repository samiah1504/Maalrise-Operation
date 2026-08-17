'use client'

import {
  saveBankAccount, saveBusiness, saveCycle, saveExpense, saveInvestor,
  saveProduct, saveShipment, saveSupplier,
} from '@/app/actions/records'
import { EntityFormDialog, type FormField, type SchemaName } from '@/components/forms/entity-form'
import type { ActionResult } from '@/app/actions/helpers'

type Entity =
  | 'cycle' | 'investor' | 'supplier' | 'product'
  | 'business' | 'bankAccount' | 'shipment' | 'expense'

const ACTIONS: Record<Entity, (values: unknown, id?: string) => Promise<ActionResult<unknown>>> = {
  cycle: saveCycle,
  investor: saveInvestor,
  supplier: saveSupplier,
  product: saveProduct,
  business: saveBusiness,
  bankAccount: saveBankAccount,
  shipment: saveShipment,
  expense: saveExpense,
}

const SCHEMA_FOR: Record<Entity, SchemaName> = {
  cycle: 'cycle',
  investor: 'investor',
  supplier: 'supplier',
  product: 'product',
  business: 'business',
  bankAccount: 'bankAccount',
  shipment: 'shipment',
  expense: 'expense',
}

/**
 * Create/edit dialog for any simple record. The page passes plain field
 * definitions; this component wires the matching Zod schema and server action.
 */
export function RecordDialog({
  entity,
  title,
  description,
  fields,
  defaultValues,
  recordId,
  triggerLabel,
  triggerVariant,
  triggerSize,
  triggerIcon,
}: {
  entity: Entity
  title: string
  description?: string
  fields: FormField[]
  defaultValues?: Record<string, unknown>
  /** Present when editing. */
  recordId?: string
  triggerLabel?: string
  triggerVariant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'gold'
  triggerSize?: 'default' | 'sm' | 'lg' | 'icon'
  triggerIcon?: 'plus' | 'edit' | 'none'
}) {
  return (
    <EntityFormDialog
      title={title}
      description={description}
      schema={SCHEMA_FOR[entity]}
      fields={fields}
      defaultValues={defaultValues}
      triggerLabel={triggerLabel}
      triggerVariant={triggerVariant}
      triggerSize={triggerSize}
      triggerIcon={triggerIcon ?? (recordId ? 'edit' : 'plus')}
      submitLabel={recordId ? 'Save changes' : 'Create'}
      action={(values) => ACTIONS[entity](values, recordId)}
    />
  )
}
