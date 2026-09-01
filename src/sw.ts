/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

// Push is not a supplement here — it is the entire messaging channel. The
// database holds no email address, so every alert, offer and newsletter ping
// arrives through this handler.

declare const self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)

// ---------------------------------------------------------------- images
//
// Every photo in the directory is remote — Glide's old bucket, Photobucket,
// Webflow, and our own Supabase bucket — and none of those origins let us set
// a cache header. Google's serves `max-age=3600`, so an hour after a visit the
// browser throws the artwork away and refetches megabytes of it. The splash
// cards alone are ~2.5MB of PNG, which is the second of blankness you see on a
// cold card.
//
// CacheFirst rather than StaleWhileRevalidate, because these URLs are
// immutable in practice: `replaceItemImage` names every upload with a
// timestamp, so swapping a picture mints a new URL rather than overwriting
// bytes behind the old one. There is nothing to revalidate — a cached hit is
// always the right answer, and a background revalidation would only spend a
// request per image per visit to prove it.
//
// Opaque responses (status 0) have to be cacheable here: an <img> for another
// origin is a no-cors request, and every one of these hosts is another origin.

// Map tiles come through as `destination: 'image'` too, but a panned map can
// mint hundreds of them. They get their own bucket so a session on Shop Queer
// can't evict the directory's artwork.
registerRoute(
  ({ url }) => url.hostname.endsWith('.basemaps.cartocdn.com'),
  new CacheFirst({
    cacheName: 'map-tiles',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 14, purgeOnQuotaError: true }),
    ],
  }),
)

registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      // Roughly the whole directory (150 pictures) plus room for events and
      // profiles. `purgeOnQuotaError` matters because opaque responses are
      // padded to a fixed size against quota, so the ceiling arrives sooner
      // than the byte count suggests.
      new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 60, purgeOnQuotaError: true }),
    ],
  }),
)

self.addEventListener('install', () => { void self.skipWaiting() })
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()) })

interface PushPayload {
  title?: string
  body?: string
  url?: string
  tag?: string
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = {}
  try {
    payload = event.data?.json() ?? {}
  } catch {
    payload = { body: event.data?.text() }
  }

  const title = payload.title || 'LGBTQ.UT'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.tag,
      data: { url: payload.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string })?.url ?? '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Reuse an open tab when there is one rather than piling up windows.
      for (const client of clients) {
        if ('focus' in client) {
          void client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
