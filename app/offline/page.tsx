import { WifiOff } from 'lucide-react'

export const metadata = { title: 'Offline' }

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="max-w-sm space-y-3 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted">
          <WifiOff className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="text-lg font-semibold">You are offline</h1>
        <p className="text-sm text-muted-foreground">
          MaalRise needs a connection to show live figures. Financial data is never served
          from the cache, so nothing you see here could be out of date. Reconnect and try
          again.
        </p>
      </div>
    </main>
  )
}
