/* LEONE — service worker : appli installable, hors connexion et notifications.
   Stratégie « réseau d'abord » : le site est toujours à jour, et la copie locale
   ne sert que si le réseau est indisponible. Les données (Supabase) ne sont jamais mises en cache. */
const CACHE = "leone-v1";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "css/style.css",
  "js/config.js", "js/i18n.js", "js/guide-seed.js", "js/store.js", "js/residence.js", "js/community.js", "js/app.js",
  "icons/icon-192.png", "icons/badge-96.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return; // Supabase, polices… : réseau seulement
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: "LEONE", body: e.data ? e.data.text() : "" }; }
  const url = typeof d.url === "string" && /^#\/[A-Za-z0-9/_-]{0,80}$/.test(d.url) ? d.url : "#/";
  e.waitUntil(self.registration.showNotification(String(d.title || "LEONE").slice(0, 80), {
    body: String(d.body || "").slice(0, 240),
    icon: "icons/icon-192.png",
    badge: "icons/badge-96.png",
    data: { url },
    tag: "leone-" + url
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL(self.registration.scope + (e.notification.data && e.notification.data.url || "#/")).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const w of list) if (w.url.startsWith(self.registration.scope)) { w.navigate(target); return w.focus(); }
    return self.clients.openWindow(target);
  }));
});
