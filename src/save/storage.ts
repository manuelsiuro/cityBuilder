/**
 * Minimal IndexedDB key/value wrapper. IndexedDB stores via structured clone,
 * so typed-array city layers can be persisted directly without serialization.
 */
const DB_NAME = "citybuilder";
const STORE = "saves";

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run<T>(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return getDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = op(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export function idbSet(key: string, value: unknown): Promise<unknown> {
  return run("readwrite", (s) => s.put(value, key));
}

export function idbGet(key: string): Promise<unknown> {
  return run("readonly", (s) => s.get(key));
}

export function idbDelete(key: string): Promise<unknown> {
  return run("readwrite", (s) => s.delete(key));
}

export function idbKeys(): Promise<IDBValidKey[]> {
  return run("readonly", (s) => s.getAllKeys());
}
