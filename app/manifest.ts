import type { MetadataRoute } from 'next'

/** PWA manifest — the app installs to the home screen on Android and iOS. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MaalRise — Operations & Finance',
    short_name: 'MaalRise',
    description:
      'Internal operations and financial management for MaalRise, a product of Maalvest Investment Limited.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#faf8f2',
    theme_color: '#0f3d2e',
    categories: ['business', 'finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
