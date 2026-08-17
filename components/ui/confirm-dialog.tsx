'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Field, Textarea } from '@/components/ui/form-controls'
import type { ActionResult } from '@/app/actions/helpers'

/**
 * The single confirmation used before every financial or destructive action.
 * The reason is mandatory by default and is written to the audit trail, so the
 * "why" of a change is always recoverable (brief §25).
 */
export function ConfirmAction({
  title,
  description,
  confirmLabel = 'Confirm',
  triggerLabel,
  triggerVariant = 'default',
  triggerSize,
  triggerIcon,
  requireReason = true,
  reasonLabel = 'Reason',
  reasonPlaceholder = 'Briefly, why is this being done?',
  destructive = false,
  disabled = false,
  details,
  action,
  onDone,
}: {
  title: string
  description?: string
  confirmLabel?: string
  triggerLabel: string
  triggerVariant?: ButtonProps['variant']
  triggerSize?: ButtonProps['size']
  triggerIcon?: ReactNode
  requireReason?: boolean
  reasonLabel?: string
  reasonPlaceholder?: string
  destructive?: boolean
  disabled?: boolean
  details?: ReactNode
  action: (reason: string) => Promise<ActionResult<unknown>>
  onDone?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function submit() {
    if (requireReason && reason.trim().length < 3) {
      setError('Give a short reason — it is written to the audit trail.')
      return
    }
    setError(null)

    startTransition(async () => {
      const result = await action(reason.trim())
      if (result.ok) {
        toast.success(result.message ?? 'Done.')
        setOpen(false)
        setReason('')
        router.refresh()
        onDone?.()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <>
      <Button
        variant={triggerVariant}
        size={triggerSize}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {triggerIcon}
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {destructive ? <AlertTriangle className="h-5 w-5 text-destructive" /> : null}
              {title}
            </DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>

          {details ? (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">{details}</div>
          ) : null}

          {requireReason ? (
            <Field label={reasonLabel} htmlFor="confirm-reason" error={error ?? undefined} required>
              <Textarea
                id="confirm-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={reasonPlaceholder}
                rows={3}
              />
            </Field>
          ) : error ? (
            <p className="text-sm font-medium text-destructive">{error}</p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant={destructive ? 'destructive' : 'default'}
              onClick={submit}
              loading={pending}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
