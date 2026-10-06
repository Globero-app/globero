// Cola offline de posiciones de baliza en IndexedDB.
export type QueuedPoint = {
  key?: number;
  beacon_id: string;
  user_id: string;
  lat: number;
  lon: number;
  altitude_m: number | null;
  speed_kmh: number | null;
  heading: number | null;
  accuracy_m: number | null;
  recorded_at: string;
};

const DB = "globero-beacon";
const STORE = "points";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "key", autoIncrement: true });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { res(req.result); db.close(); };
    t.onerror = () => { rej(t.error); db.close(); };
  });
}

export const queuePoint = (p: QueuedPoint) => tx("readwrite", (s) => s.add(p));
export const getQueued = () => tx<QueuedPoint[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedPoint[]>);
export const countQueued = () => tx<number>("readonly", (s) => s.count());
export async function removeQueued(keys: number[]) {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const t = db.transaction(STORE, "readwrite");
    keys.forEach((k) => t.objectStore(STORE).delete(k));
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
  db.close();
}
