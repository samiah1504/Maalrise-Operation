import { LoginForm } from '@/components/forms/login-form'

export const metadata = { title: 'Sign in' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams

  return (
    <main className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      {/* Brand panel — hidden on phones so the form is the first thing seen */}
      <div className="relative hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-gold text-lg font-bold text-gold-foreground">
            M
          </span>
          <div>
            <p className="text-lg font-semibold tracking-tight">MaalRise</p>
            <p className="text-xs text-primary-foreground/70">Maalvest Investment Limited</p>
          </div>
        </div>

        <div className="max-w-md space-y-4">
          <h2 className="text-2xl font-semibold leading-snug">
            Every naira, accounted for.
          </h2>
          <p className="text-sm leading-relaxed text-primary-foreground/80">
            Procurement, inventory, Murābaḥah sales, repayments and investor reporting
            across the full 12-month investment cycle — from capital received to capital
            redeployed.
          </p>
          <ul className="space-y-2 text-sm text-primary-foreground/80">
            {[
              'Cash at hand, cash in stock and inventory, never double counted',
              'Landed cost as the disclosed Murābaḥah cost basis',
              'Maker–checker approvals and a permanent audit trail',
            ].map((line) => (
              <li key={line} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                {line}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-primary-foreground/60">
          Internal system. Authorised staff only.
        </p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 lg:hidden">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
              M
            </span>
            <div>
              <p className="text-lg font-semibold tracking-tight">MaalRise</p>
              <p className="text-xs text-muted-foreground">Maalvest Investment Limited</p>
            </div>
          </div>

          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
            <p className="text-sm text-muted-foreground">
              Use the work email address your administrator set up for you.
            </p>
          </div>

          <LoginForm next={next} />
        </div>
      </div>
    </main>
  )
}
