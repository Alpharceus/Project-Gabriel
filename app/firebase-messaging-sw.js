/* Gabriel service worker.
   Handles FCM web-push directly (data-only messages: {id, ts, n, ct}),
   decrypts with the shared key from IndexedDB, and renders the notification
   — the push payload itself is ciphertext end to end.
   Also caches the app shell so the PWA installs and opens offline. */

const SHELL_CACHE = "gabriel-shell-v2";
const SHELL = ["/", "/index.html", "/styles.css", "/app.js", "/crypto.js",
               "/db.js", "/config.js", "/manifest.webmanifest",
               "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== SHELL_CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(SHELL_CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

/* ── IndexedDB (shared contract with db.js: gabriel/kv) ── */
function idbGet(k) {
  return new Promise((res, rej) => {
    const rq = indexedDB.open("gabriel", 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore("kv");
    rq.onerror = () => rej(rq.error);
    rq.onsuccess = () => {
      const db = rq.result;
      const g = db.transaction("kv").objectStore("kv").get(k);
      g.onsuccess = () => { db.close(); res(g.result); };
      g.onerror = () => rej(g.error);
    };
  });
}

/* ── Crypto (mirror of crypto.js — classic script, so inlined) ── */
const b64uToBytes = s => Uint8Array.from(
  atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4)),
  c => c.charCodeAt(0));
const b64ToBytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function decryptMsg(data) {
  const keyB64 = await idbGet("key");
  if (!keyB64) throw new Error("no key in this browser yet");
  const key = await crypto.subtle.importKey("raw", b64uToBytes(keyB64), "AES-GCM", false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(data.n), additionalData: new TextEncoder().encode(data.id) },
    key, b64ToBytes(data.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

/* ── Push ── */
self.addEventListener("push", e => {
  e.waitUntil((async () => {
    const raw = e.data?.json() ?? {};
    const data = raw.data || raw;           // FCM wraps data messages
    if (!data.ct) return;

    // If the app is open and focused, the live feed already shows it.
    const wins = await clients.matchAll({ type: "window", includeUncontrolled: true });
    if (wins.some(w => w.focused && w.visibilityState === "visible")) return;

    let title = "Gabriel", body = "New message", url = null;
    try {
      const m = await decryptMsg(data);
      const self_src = await idbGet("src");
      if (m.src === self_src) return;       // own message echoed back
      title = m.src;
      body = m.body;
      if (m.kind === "url") url = m.body.trim();
    } catch { /* key missing/wrong — show a generic notification */ }

    await self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.id,
      data: { url },
    });
  })());
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    if (e.notification.data?.url) return clients.openWindow(e.notification.data.url);
    const wins = await clients.matchAll({ type: "window", includeUncontrolled: true });
    if (wins.length) return wins[0].focus();
    return clients.openWindow("/");
  })());
});
