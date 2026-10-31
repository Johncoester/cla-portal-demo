/* file-store.js : where the MOCK adapter keeps uploaded file CONTENTS (the bytes), separate from the document records.
 * Bug fixed here (Matt, Oct 31: "Upload ID doesn't work on the test account"): the mock used to put every uploaded file, as a base64 data URL,
 * inside the ONE localStorage value that holds all demo data. Browsers allow about 5 MB per site for localStorage, so after one or two phone
 * photos (or a few files from earlier testers on the same browser) every upload failed with "Browser storage for this demo is full", and a
 * typical phone photo (2-8 MB) was refused outright by the old 1.5 MB demo limit. Now the bytes go to IndexedDB (hundreds of MB available)
 * and only the record (name, size, who, visibility) stays in localStorage. Supabase mode uses Storage (bucket 'deal-documents') instead.
 * There is deliberately NO per-file delete here (documents are permanent). clearAll() is only used by "reset demo data". */
const DB = 'cla-portal-new:files'; const OS = 'files';
export function indexedDbFileStore(idb = globalThis.indexedDB) {
  let opening = null;
  const open = () => opening || (opening = new Promise((res, rej) => { const r = idb.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(OS)) r.result.createObjectStore(OS); };
    r.onsuccess = () => res(r.result); r.onerror = () => { opening = null; rej(r.error || new Error('Could not open file storage.')); }; }));
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(OS, mode); const st = t.objectStore(OS); let out;
    const q = fn(st); if (q) q.onsuccess = () => { out = q.result; }; t.oncomplete = () => res(out); t.onerror = () => rej(t.error || new Error('Could not save the file.')); t.onabort = () => rej(t.error || new Error('Could not save the file.')); }); };
  return { kind: 'indexeddb', put: (key, dataUrl) => tx('readwrite', (st) => st.put(dataUrl, key)), get: (key) => tx('readonly', (st) => st.get(key)), clearAll: () => tx('readwrite', (st) => st.clear()) };
}
// in-memory version for tests (or a browser without IndexedDB): same contract
export function memoryFileStore() { const m = new Map(); return { kind: 'memory', put: async (k, v) => { m.set(k, v); }, get: async (k) => m.get(k), clearAll: async () => { m.clear(); }, size: () => m.size }; }
