import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'MaalRise — Operations & Finance',
    template: '%s · MaalRise',
  },
  description:
    'Internal operations and financial management for MaalRise, a product of Maalvest Investment Limited.',
  applicationName: 'MaalRise',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'MaalRise',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#4f2574' },
    { media: '(prefers-color-scheme: dark)', color: '#20163a' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        {children}
        <Toaster
          position="top-center"
          richColors
          closeButton
          toastOptions={{ className: 'text-sm' }}
        />
      </body>
    </html>
  )
}
