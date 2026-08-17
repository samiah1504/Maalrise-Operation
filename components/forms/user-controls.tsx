'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Select } from '@/components/ui/form-controls'
import { Button } from '@/components/ui/button'
import { setUserActive, setUserRole } from '@/app/actions/settings'
import { ROLE_LABELS } from '@/lib/roles'
import type { UserRole } from '@/lib/database.types'

const ROLES: UserRole[] = ['ceo', 'accounts', 'operations', 'auditor']

/** Role assignment and activation. The CEO cannot change their own access. */
export function UserRoleControls({
  userId,
  currentRole,
  isActive,
  isSelf,
}: {
  userId: string
  currentRole: UserRole | null
  isActive: boolean
  isSelf: boolean
}) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  if (isSelf) {
    return (
      <p className="text-xs text-muted-foreground">
        Another CEO-level user must change your access
      </p>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={currentRole ?? ''}
        disabled={pending}
        aria-label="Role"
        className="h-9 w-auto text-sm"
        onChange={(e) => {
          const role = e.target.value as UserRole
          startTransition(async () => {
            const result = await setUserRole(userId, role)
            if (result.ok) {
              toast.success(result.message ?? 'Role updated.')
              router.refresh()
            } else {
              toast.error(result.error)
            }
          })
        }}
      >
        <option value="" disabled>
          Assign a role…
        </option>
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABELS[role]}
          </option>
        ))}
      </Select>

      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const result = await setUserActive(userId, !isActive)
            if (result.ok) {
              toast.success(result.message ?? 'Updated.')
              router.refresh()
            } else {
              toast.error(result.error)
            }
          })
        }}
      >
        {isActive ? 'Deactivate' : 'Reactivate'}
      </Button>
    </div>
  )
}
