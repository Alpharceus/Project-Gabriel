// E2E crypto — must stay in sync with gabriel/crypto.py.
// AES-256-GCM, message id bound as AAD. Key: base64url, no padding.

const te = new TextEncoder();
const td = new TextDecoder();

export const b64uToBytes = s => Uint8Array.from(
  atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4)),
  c => c.charCodeAt(0));
export const b64ToBytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const bytesToB64 = b => btoa(String.fromCharCode(...new Uint8Array(b)));

export async function importKey(keyB64u) {
  let raw;
  try {
    raw = b64uToBytes(keyB64u);
  } catch {
    throw new Error("not valid base64");
  }
  if (raw.length !== 32) throw new Error(`decodes to ${raw.length} bytes, need 32`);
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encrypt(key, msgId, payload) {
  const n = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: n, additionalData: te.encode(msgId) },
    key, te.encode(JSON.stringify(payload)));
  return { n: bytesToB64(n), ct: bytesToB64(ct) };
}

export async function decrypt(key, msgId, nB64, ctB64) {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(nB64), additionalData: te.encode(msgId) },
    key, b64ToBytes(ctB64));
  return JSON.parse(td.decode(pt));
}

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
