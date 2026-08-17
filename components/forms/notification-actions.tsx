'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCheck, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { markNotificationsRead, runDailyJobs } from '@/app/actions/closing'

/**
 * The daily alert job normally runs on a schedule; this lets staff refresh on
 * demand, which also covers deployments where pg_cron is unavailable.
 */
export function NotificationActions({ hasUnread }: { hasUnread: boolean }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      const result = await action()
      if (result.ok) {
        toast.success(result.message ?? 'Done.')
        router.refresh()
      } else {
        toast.error(result.error ?? 'Something went wrong.')
      }
    })
  }

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run(() => runDailyJobs())}
      >
        <RefreshCw className="h-4 w-4" />
        Refresh alerts
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={pending || !hasUnread}
        onClick={() => run(() => markNotificationsRead())}
      >
        <CheckCheck className="h-4 w-4" />
        Mark all read
      </Button>
    </div>
  )
}
