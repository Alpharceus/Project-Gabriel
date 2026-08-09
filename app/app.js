// Gabriel PWA — Firestore live sync, E2E crypto, FCM registration, UI.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  setPersistence, browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import {
  getFirestore, collection, doc, setDoc, query, orderBy, limit,
  onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import {
  getMessaging, getToken, isSupported as messagingSupported,
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging.js";

import { CONFIG } from "./config.js";
import { importKey, encrypt, decrypt, uuid } from "./crypto.js";
import { idbSet } from "./db.js";

const VERSION = "v3.0";
const $ = id => document.getElementById(id);

/* ── Firebase bootstrap ─────────────────────────────────────────── */
async function firebaseConfig() {
  if (CONFIG.firebase) return CONFIG.firebase;
  const r = await fetch("/__/firebase/init.json"); // auto-served on Firebase Hosting
  if (!r.ok) throw new Error("No Firebase config: fill app/config.js or host on Firebase Hosting");
  return r.json();
}
let fbApp;
try {
  fbApp = initializeApp(await firebaseConfig());
} catch (err) {
  document.body.innerHTML =
    `<div style="display:grid;place-items:center;height:100vh;padding:24px;text-align:center">
       <p><strong>Gabriel isn't configured yet.</strong><br>${err.message}</p></div>`;
  throw err;
}
const auth = getAuth(fbApp);
// Stay signed in until an explicit sign-out (survives restarts and updates).
await setPersistence(auth, browserLocalPersistence).catch(() => {});
const fs = getFirestore(fbApp);

let swReg = null;
if ("serviceWorker" in navigator) {
  swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js")
    .catch(() => null);
}

/* ── Local settings ─────────────────────────────────────────────── */
// One-time setup links: /#k=<e2e key>&s=<device name>. The fragment never
// reaches any server; it's saved locally and stripped from the URL.
async function bootstrapFromHash() {
  if (!location.hash) return;
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get("k")) {
    await settings.set(h.get("s") || settings.src || "phone", h.get("k"));
  }
  history.replaceState(null, "", location.pathname);
}

const settings = {
  get src() { return localStorage.getItem("gabriel_src") || ""; },
  get key() { return localStorage.getItem("gabriel_key") || ""; },
  async set(src, key) {
    localStorage.setItem("gabriel_src", src.trim());
    localStorage.setItem("gabriel_key", key.trim());
    await idbSet("key", key.trim());   // the service worker decrypts with this
    await idbSet("src", src.trim());
  },
};

/* ── Screens ────────────────────────────────────────────────────── */
function show(name) {
  for (const s of ["screen-login", "screen-setup", "screen-chat"])
    $(s).hidden = s !== name;
}
const toast = msg => {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 3200);
};

/* ── Chat state ─────────────────────────────────────────────────── */
const msgs = new Map();     // id -> {id, ts, src, kind, body}
let aesKey = null;
let unsub = null;

const hue = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const avatarColor = src => `hsl(${hue(src)} 55% 48%)`;
const esc = s => s.replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const linkify = (body, kind) => {
  if (kind === "url") {
    const u = esc(body.trim());
    return `<a href="${u}" target="_blank" rel="noopener">${u}</a>`;
  }
  return esc(body).replace(/https?:\/\/[^\s<]+/g,
    u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
};

function render() {
  const feed = $("feed");
  const stick = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
  const list = [...msgs.values()].sort((a, b) => a.ts.localeCompare(b.ts));
  const frag = document.createDocumentFragment();

  if (!list.length) {
    const d = document.createElement("div");
    d.className = "empty";
    d.innerHTML = "<strong>No messages yet</strong><span>Say something to your devices.</span>";
    frag.appendChild(d);
  }

  let prev = null;
  for (const m of list) {
    const dt = new Date(m.ts);
    const day = dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    if (!prev || day !== prev.day) {
      const d = document.createElement("div");
      d.className = "day"; d.innerHTML = `<span>${day}</span>`;
      frag.appendChild(d);
      prev = null;
    }
    const mine = m.src === settings.src;
    const grouped = prev && prev.src === m.src && (dt - prev.dt) < 5 * 60e3;
    const el = document.createElement("div");
    el.className = "msg" + (mine ? " mine" : "") + (grouped ? "" : " head");
    const time = dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    const avatar = mine ? "" :
      `<div class="avatar" style="background:${avatarColor(m.src)}">${esc(m.src[0]?.toUpperCase() || "?")}</div>`;
    const meta = grouped ? "" :
      `<div class="meta">${mine ? time : `${esc(m.src)} · ${time}`}</div>`;
    el.innerHTML = `${avatar}<div class="stack">${meta}<div class="bubble">${linkify(m.body, m.kind)}</div></div>`;
    frag.appendChild(el);
    prev = { src: m.src, dt, day };
  }
  feed.replaceChildren(frag);
  if (stick) feed.scrollTop = feed.scrollHeight;
}

/* ── Live sync ──────────────────────────────────────────────────── */
async function startChat() {
  show("screen-chat");
  $("set-src-label").textContent = settings.src;
  $("set-email-label").textContent = auth.currentUser?.email || "";
  $("about-ver").textContent = VERSION;
  aesKey = await importKey(settings.key);
  msgs.clear(); render();

  const q = query(collection(fs, "messages"), orderBy("sts", "desc"), limit(400));
  if (unsub) unsub();
  unsub = onSnapshot(q, async snap => {
    setConn(true);
    let changed = false;
    for (const d of snap.docChanges()) {
      if (d.type === "removed") continue;
      const m = d.doc.data();
      if (!m.id || msgs.has(m.id)) continue;
      try {
        const payload = await decrypt(aesKey, m.id, m.n, m.ct);
        msgs.set(m.id, { id: m.id, ts: m.ts, ...payload });
        changed = true;
      } catch { /* wrong key / tampered — skip */ }
    }
    if (changed) render();
  }, err => { console.error(err); setConn(false); });
}

function setConn(ok) {
  const c = $("conn");
  c.textContent = ok ? "live · encrypted" : "reconnecting…";
  c.className = "conn " + (ok ? "on" : "off");
}

/* ── Sending ────────────────────────────────────────────────────── */
async function sendMsg() {
  const box = $("box");
  const body = box.value.trim();
  if (!body || !aesKey) return;
  const kind = /^https?:\/\/\S+$/.test(body) ? "url" : "text";
  const id = uuid();
  const ts = new Date().toISOString().slice(0, 19) + "+00:00";
  const { n, ct } = await encrypt(aesKey, id, { src: settings.src, kind, body });
  box.value = ""; box.style.height = "auto"; updateSendState();
  try {
    await setDoc(doc(fs, "messages", id),
      { v: 3, id, ts, n, ct, sts: serverTimestamp() });
  } catch (err) {
    toast("Send failed: " + err.message);
    box.value = body; updateSendState();
  }
}

/* ── Notifications ──────────────────────────────────────────────── */
async function enableNotifications() {
  try {
    if (!swReg || !(await messagingSupported())) throw new Error("not supported here");
    if (!CONFIG.vapidKey) throw new Error("vapidKey missing in app/config.js");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error("permission " + perm);
    const token = await getToken(getMessaging(fbApp),
      { vapidKey: CONFIG.vapidKey, serviceWorkerRegistration: swReg });
    await setDoc(doc(fs, "devices", token),
      { token, name: settings.src, updated: serverTimestamp() });
    toast("Notifications on for this device ✓");
  } catch (err) {
    toast("Notifications: " + err.message);
  }
}

/* ── Wiring ─────────────────────────────────────────────────────── */
$("login-form").onsubmit = async e => {
  e.preventDefault();
  $("login-error").hidden = true;
  try {
    await signInWithEmailAndPassword(auth, $("login-email").value, $("login-pass").value);
  } catch (err) {
    $("login-error").textContent = err.code || err.message;
    $("login-error").hidden = false;
  }
};

$("setup-form").onsubmit = async e => {
  e.preventDefault();
  $("setup-error").hidden = true;
  try {
    await importKey($("setup-key").value.trim());  // validate before saving
    await settings.set($("setup-src").value, $("setup-key").value);
    startChat();
  } catch {
    $("setup-error").textContent = "That key isn't a valid 32-byte base64 key.";
    $("setup-error").hidden = false;
  }
};

const sheet = { open() { $("sheet").hidden = $("sheet-backdrop").hidden = false; },
                close() { $("sheet").hidden = $("sheet-backdrop").hidden = true; } };
$("btn-settings").onclick = sheet.open;
$("sheet-backdrop").onclick = sheet.close;
$("btn-notify").onclick = () => { sheet.close(); enableNotifications(); };
$("btn-edit-setup").onclick = () => {
  sheet.close();
  $("setup-src").value = settings.src; $("setup-key").value = settings.key;
  show("screen-setup");
};
$("btn-signout").onclick = async () => { sheet.close(); if (unsub) unsub(); await signOut(auth); };

const box = $("box");
function updateSendState() { $("sendbtn").disabled = !box.value.trim(); }
box.addEventListener("input", () => {
  box.style.height = "auto";
  box.style.height = Math.min(box.scrollHeight, 132) + "px";
  updateSendState();
});
box.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); }
});
$("sendbtn").onclick = sendMsg;

await bootstrapFromHash();
onAuthStateChanged(auth, user => {
  if (!user) { show("screen-login"); if (unsub) { unsub(); unsub = null; } }
  else if (!settings.src || !settings.key) show("screen-setup");
  else startChat();
});
