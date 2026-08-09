// Tiny IndexedDB key-value store, shared contract with the service worker
// (which inlines its own copy — keep DB/store names in sync: gabriel/kv).

const open = () => new Promise((res, rej) => {
  const rq = indexedDB.open("gabriel", 1);
  rq.onupgradeneeded = () => rq.result.createObjectStore("kv");
  rq.onsuccess = () => res(rq.result);
  rq.onerror = () => rej(rq.error);
});

export async function idbSet(k, v) {
  const db = await open();
  return new Promise((res, rej) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(v, k);
    tx.oncomplete = () => { db.close(); res(); };
    tx.onerror = () => rej(tx.error);
  });
}

export async function idbGet(k) {
  const db = await open();
  return new Promise((res, rej) => {
    const rq = db.transaction("kv").objectStore("kv").get(k);
    rq.onsuccess = () => { db.close(); res(rq.result); };
    rq.onerror = () => rej(rq.error);
  });
}
