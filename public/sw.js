const CACHE_NAME = "switchback-route-shell-v2"
const SHELL = ["/", "/icon.svg", "/manifest.webmanifest"]

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys
      .filter((key) => key.startsWith("switchback-") && key !== CACHE_NAME)
      .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return
  const cacheable = url.origin === self.location.origin || url.hostname === "tiles.openfreemap.org"
  if (!cacheable) return

  if (request.mode === "navigate") {
    const cacheRootNavigation = url.pathname === "/" && url.search === ""
    event.respondWith(
      fetch(request).then((response) => {
        if (cacheRootNavigation && response.ok) {
          const copy = response.clone()
          void caches.open(CACHE_NAME).then((cache) => cache.put("/", copy))
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

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok || response.type === "opaque") {
        const copy = response.clone()
        void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
      }
      return response
    }))
  )
})
