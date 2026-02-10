type DocData = Record<string, unknown>;

export type DbRef = { _type: "db" };
export type CollectionRef = { _type: "collection"; path: string };
export type DocRef = { _type: "doc"; path: string };

export type DocSnapshot<T extends DocData = DocData> = {
  id: string;
  exists: () => boolean;
  data: () => T | undefined;
  ref: DocRef;
};

export type CollectionSnapshot<T extends DocData = DocData> = {
  docs: DocSnapshot<T>[];
  size: number;
  empty: boolean;
  forEach: (fn: (doc: DocSnapshot<T>) => void) => void;
  docChanges: () => Array<{ type: "added"; doc: DocSnapshot<T> }>;
  ref: CollectionRef;
};

type SnapshotListener = (snapshot: CollectionSnapshot | DocSnapshot) => void;

const store: Map<string, Map<string, DocData>> = new Map();
const listeners: Map<string, Set<SnapshotListener>> = new Map();

export class Timestamp {
  seconds: number;
  nanoseconds: number;

  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }

  static now() {
    return Timestamp.fromMillis(Date.now());
  }

  static fromMillis(milliseconds: number) {
    const seconds = Math.floor(milliseconds / 1000);
    const nanoseconds = Math.floor((milliseconds - seconds * 1000) * 1e6);
    return new Timestamp(seconds, nanoseconds);
  }

  static fromDate(date: Date) {
    return Timestamp.fromMillis(date.getTime());
  }

  toDate() {
    return new Date(this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6));
  }

  toMillis() {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
  }
}

type TimestampLike = { seconds: number; nanoseconds?: number };

const isTimestampLike = (value: unknown): value is TimestampLike =>
  typeof value === "object" &&
  value !== null &&
  "seconds" in value &&
  typeof (value as { seconds: unknown }).seconds === "number";

const generateId = () =>
  Math.random().toString(36).slice(2, 10) +
  Math.random().toString(36).slice(2, 10);

const clone = <T>(value: T): T => {
  if (value instanceof Timestamp) {
    return new Timestamp(value.seconds, value.nanoseconds) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => clone(item)) as T;
  }
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
      next[key] = clone(val);
    });
    return next as T;
  }
  return value;
};

export const timestampToDate = (value: unknown) => {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (isTimestampLike(value)) {
    return new Date(
      value.seconds * 1000 + Math.floor((value.nanoseconds ?? 0) / 1e6)
    );
  }
  return null;
};

const ensureCollection = (path: string) => {
  if (!store.has(path)) {
    store.set(path, new Map());
  }
  return store.get(path)!;
};

const notify = (path: string, snapshot: CollectionSnapshot | DocSnapshot) => {
  const subs = listeners.get(path);
  if (!subs) return;
  subs.forEach((callback) => callback(snapshot));
};

const createDocSnapshot = <T extends DocData = DocData>(
  collectionPath: string,
  id: string,
  data?: T
): DocSnapshot<T> => ({
  id,
  exists: () => Boolean(data),
  data: () => (data ? clone(data) : undefined),
  ref: { _type: "doc", path: `${collectionPath}/${id}` },
});

const createCollectionSnapshot = <T extends DocData = DocData>(
  collectionPath: string
): CollectionSnapshot<T> => {
  const collection = ensureCollection(collectionPath);
  const docs = Array.from(collection.entries()).map(([id, data]) =>
    createDocSnapshot(collectionPath, id, data as T)
  );
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: (fn) => docs.forEach(fn),
    docChanges: () => docs.map((doc) => ({ type: "added" as const, doc })),
    ref: { _type: "collection", path: collectionPath },
  };
};

const emitCollection = (collectionPath: string) => {
  notify(collectionPath, createCollectionSnapshot(collectionPath));
};

const emitDoc = (collectionPath: string, id: string) => {
  const collection = ensureCollection(collectionPath);
  const data = collection.get(id);
  notify(`${collectionPath}/${id}`, createDocSnapshot(collectionPath, id, data));
  emitCollection(collectionPath);
};

const splitDocPath = (path: string) => {
  const parts = path.split("/").filter(Boolean);
  const id = parts.pop() ?? "";
  return { collectionPath: parts.join("/"), id };
};

export const getMockFirestore = (): DbRef => ({ _type: "db" });

export const collection = (db: DbRef, path: string): CollectionRef => ({
  _type: "collection",
  path,
});

const isCollectionRef = (value: unknown): value is CollectionRef =>
  typeof value === "object" &&
  value !== null &&
  (value as CollectionRef)._type === "collection";

const isDbRef = (value: unknown): value is DbRef =>
  typeof value === "object" &&
  value !== null &&
  (value as DbRef)._type === "db";

export function doc(collectionRef: CollectionRef, id: string): DocRef;
export function doc(db: DbRef, ...path: string[]): DocRef;
export function doc(...args: unknown[]): DocRef {
  if (args.length === 2 && isCollectionRef(args[0])) {
    return { _type: "doc", path: `${args[0].path}/${String(args[1])}` };
  }
  if (args.length >= 2 && isDbRef(args[0])) {
    const path = (args as [DbRef, ...string[]]).slice(1).join("/");
    return { _type: "doc", path };
  }
  throw new Error("Invalid doc() arguments");
}

export const getDocs = async <T extends DocData = DocData>(
  collectionRef: CollectionRef
) => createCollectionSnapshot<T>(collectionRef.path);

export const getDoc = async <T extends DocData = DocData>(docRef: DocRef) => {
  const { collectionPath, id } = splitDocPath(docRef.path);
  const collection = ensureCollection(collectionPath);
  return createDocSnapshot<T>(
    collectionPath,
    id,
    collection.get(id) as T | undefined
  );
};

export const addDoc = async <T extends DocData = DocData>(
  collectionRef: CollectionRef,
  data: T
) => {
  const id = generateId();
  const collection = ensureCollection(collectionRef.path);
  collection.set(id, clone(data));
  emitDoc(collectionRef.path, id);
  return { _type: "doc", path: `${collectionRef.path}/${id}` };
};

export const setDoc = async <T extends DocData = DocData>(
  docRef: DocRef,
  data: T,
  options: { merge?: boolean } = {}
) => {
  const { collectionPath, id } = splitDocPath(docRef.path);
  const collection = ensureCollection(collectionPath);
  if (options.merge && collection.has(id)) {
    const current = (collection.get(id) ?? {}) as DocData;
    collection.set(id, { ...current, ...clone(data) });
  } else {
    collection.set(id, clone(data));
  }
  emitDoc(collectionPath, id);
};

export const updateDoc = async <T extends DocData = DocData>(
  docRef: DocRef,
  data: Partial<T>
) => {
  const { collectionPath, id } = splitDocPath(docRef.path);
  const collection = ensureCollection(collectionPath);
  if (!collection.has(id)) {
    throw new Error(`Document ${docRef.path} does not exist`);
  }
  const current = (collection.get(id) ?? {}) as DocData;
  collection.set(id, { ...current, ...clone(data) });
  emitDoc(collectionPath, id);
};

export const deleteDoc = async (docRef: DocRef) => {
  const { collectionPath, id } = splitDocPath(docRef.path);
  const collection = ensureCollection(collectionPath);
  collection.delete(id);
  emitDoc(collectionPath, id);
};

export const onSnapshot = <T extends DocData = DocData>(
  ref: CollectionRef | DocRef,
  callback: (snapshot: CollectionSnapshot<T> | DocSnapshot<T>) => void
) => {
  const path = ref.path;
  if (!listeners.has(path)) {
    listeners.set(path, new Set());
  }
  const listener = callback as SnapshotListener;
  listeners.get(path)!.add(listener);

  if (ref._type === "collection") {
    callback(createCollectionSnapshot<T>(path));
  } else if (ref._type === "doc") {
    const { collectionPath, id } = splitDocPath(path);
    const collection = ensureCollection(collectionPath);
    callback(createDocSnapshot<T>(collectionPath, id, collection.get(id) as T));
  }

  return () => {
    const subs = listeners.get(path);
    if (!subs) return;
    subs.delete(listener);
    if (subs.size === 0) {
      listeners.delete(path);
    }
  };
};

export const replaceCollection = <T extends DocData = DocData>(
  collectionPath: string,
  items: T[],
  options: { idField?: string } = {}
) => {
  store.set(collectionPath, new Map());
  const idField = options.idField ?? "id";
  const collection = ensureCollection(collectionPath);
  items.forEach((item) => {
    const rawItem = item as Record<string, unknown>;
    const id = (rawItem[idField] as string | undefined) ?? generateId();
    const data: Record<string, unknown> = { ...rawItem };
    if (idField in data) {
      delete data[idField];
    }
    collection.set(id, clone(data));
  });
  emitCollection(collectionPath);
};
