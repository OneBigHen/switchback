// Switchback service worker — bounded, separated caches (SB-019).
//
// - Shell (navigation + app shell): network-first, small bounded cache.
// - Build assets (/_next/static/**): cache-first, bounded (hashed URLs are
//   immutable, so this is safe and fast).
// - Tiles (tiles.openfreemap.org): bounded cache-first so storage cannot
//   grow without limit.
// - Images: stale-while-revalidate, bounded.
// - Same-origin /api/*: never cached (no fake offline success).

const SHELL_CACHE = "switchback-shell-v3"
const BUILD_CACHE = "switchback-build-v3"
const TILE_CACHE = "switchback-tiles-v3"
const IMAGE_CACHE = "switchback-images-v3"
const ACTIVE_CACHES = [SHELL_CACHE, BUILD_CACHE, TILE_CACHE, IMAGE_CACHE]

const SHELL = ["/", "/icon.svg", "/manifest.webmanifest"]

/** Bounded caches: evict oldest entries (insertion order) past the cap. */
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= maxEntries) return
  const toDelete = keys.slice(0, keys.length - maxEntries)
  await Promise.all(toDelete.map((key) => cache.delete(key)))
}

async function cachePut(cacheName, request, response, maxEntries) {
  const cache = await caches.open(cacheName)
  await cache.put(request, response)
  await trimCache(cacheName, maxEntries)
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith("switchback-") && !ACTIVE_CACHES.includes(key))
        .map((key) => caches.delete(key))))
      .then(() => Promise.all(ACTIVE_CACHES.map((name) => trimCache(name, 500))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return
  const url = new URL(request.url)
  // Same-origin API responses are never cached: an offline API must fail
  // honestly instead of serving a stale fake success.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return

  // Navigation: network-first with a shell fallback.
  if (request.mode === "navigate") {
    const cacheRootNavigation = url.pathname === "/" && url.search === ""
    event.respondWith(
      fetch(request).then((response) => {
        if (cacheRootNavigation && response.ok) {
          const copy = response.clone()
          void cachePut(SHELL_CACHE, "/", copy, 8)
        }
        return response
      }).catch(() => caches.match(request)
        .then((cached) => cached || caches.match("/"))
        .then((cached) => cached || new Response("Switchback is offline and this page is not cached yet.", {
          status: 503,
          headers: { "content-type": "text/plain" }
        })))
    )
    return
  }

  // Hashed build assets: immutable, cache-first.
  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          void cachePut(BUILD_CACHE, request, copy, 200)
        }
        return response
      }))
    )
    return
  }

  // Vector tiles: bounded cache-first.
  if (url.hostname === "tiles.openfreemap.org") {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok || response.type === "opaque") {
          const copy = response.clone()
          void cachePut(TILE_CACHE, request, copy, 500)
        }
        return response
      }))
    )
    return
  }

  // Everything else (images, fonts): stale-while-revalidate, bounded.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok || response.type === "opaque") {
          const copy = response.clone()
          void cachePut(IMAGE_CACHE, request, copy, 100)
        }
        return response
      }).catch(() => cached)
      return cached || network
    })
  )
})
