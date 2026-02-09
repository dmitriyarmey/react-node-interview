const store = new Map();
const listeners = new Map();

export class Timestamp {
  constructor(seconds, nanoseconds) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }

  static now() {
    return Timestamp.fromMillis(Date.now());
  }

  static fromMillis(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const nanoseconds = Math.floor((milliseconds - seconds * 1000) * 1e6);
    return new Timestamp(seconds, nanoseconds);
  }

  static fromDate(date) {
    return Timestamp.fromMillis(date.getTime());
  }

  toDate() {
    return new Date(this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6));
  }

  toMillis() {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
  }
}

const generateId = () =>
  Math.random().toString(36).slice(2, 10) +
  Math.random().toString(36).slice(2, 10);

const clone = (value) => {
  if (value instanceof Timestamp) {
    return new Timestamp(value.seconds, value.nanoseconds);
  }
  if (Array.isArray(value)) {
    return value.map(clone);
  }
  if (value && typeof value === "object") {
    const next = {};
    Object.entries(value).forEach(([key, val]) => {
      next[key] = clone(val);
    });
    return next;
  }
  return value;
};

export const timestampToDate = (value) => {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value.seconds === "number") {
    return new Date(
      value.seconds * 1000 + Math.floor((value.nanoseconds ?? 0) / 1e6)
    );
  }
  return null;
};

const ensureCollection = (path) => {
  if (!store.has(path)) {
    store.set(path, new Map());
  }
  return store.get(path);
};

const notify = (path, snapshot) => {
  const subs = listeners.get(path);
  if (!subs) return;
  subs.forEach((callback) => callback(snapshot));
};

const createDocSnapshot = (collectionPath, id, data) => ({
  id,
  exists: () => Boolean(data),
  data: () => (data ? clone(data) : undefined),
  ref: { _type: "doc", path: `${collectionPath}/${id}` },
});

const createCollectionSnapshot = (collectionPath) => {
  const collection = ensureCollection(collectionPath);
  const docs = Array.from(collection.entries()).map(([id, data]) =>
    createDocSnapshot(collectionPath, id, data)
  );
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: (fn) => docs.forEach(fn),
    docChanges: () => docs.map((doc) => ({ type: "added", doc })),
    ref: { _type: "collection", path: collectionPath },
  };
};

const emitCollection = (collectionPath) => {
  notify(collectionPath, createCollectionSnapshot(collectionPath));
};

const emitDoc = (collectionPath, id) => {
  const collection = ensureCollection(collectionPath);
  const data = collection.get(id);
  notify(`${collectionPath}/${id}`, createDocSnapshot(collectionPath, id, data));
  emitCollection(collectionPath);
};

const splitDocPath = (path) => {
  const parts = path.split("/").filter(Boolean);
  const id = parts.pop();
  return { collectionPath: parts.join("/"), id };
};

export const getMockFirestore = () => ({ _type: "db" });

export const collection = (db, path) => ({ _type: "collection", path });

export const doc = (...args) => {
  if (args.length === 2 && args[0]?._type === "collection") {
    return { _type: "doc", path: `${args[0].path}/${args[1]}` };
  }
  if (args.length >= 2 && args[0]?._type === "db") {
    const path = args.slice(1).join("/");
    return { _type: "doc", path };
  }
  throw new Error("Invalid doc() arguments");
};

export const getDocs = async (collectionRef) =>
  createCollectionSnapshot(collectionRef.path);

export const getDoc = async (docRef) => {
  const { collectionPath, id } = splitDocPath(docRef.path);
  const collection = ensureCollection(collectionPath);
  return createDocSnapshot(collectionPath, id, collection.get(id));
};

export const addDoc = async (collectionRef, data) => {
  const id = generateId();
  const collection = ensureCollection(collectionRef.path);
  collection.set(id, clone(data));
  emitDoc(collectionRef.path, id);
  return { _type: "doc", path: `${collectionRef.path}/${id}` };
};

export const setDoc = async (docRef, data, options = {}) => {
  const { collectionPath, id } = splitDocPath(docRef.path);
  const collection = ensureCollection(collectionPath);
  if (options.merge && collection.has(id)) {
    collection.set(id, { ...collection.get(id), ...clone(data) });
  } else {
    collection.set(id, clone(data));
  }
  emitDoc(collectionPath, id);
};

export const updateDoc = async (docRef, data) => {
  const { collectionPath, id } = splitDocPath(docRef.path);
  const collection = ensureCollection(collectionPath);
  if (!collection.has(id)) {
    throw new Error(`Document ${docRef.path} does not exist`);
  }
  collection.set(id, { ...collection.get(id), ...clone(data) });
  emitDoc(collectionPath, id);
};

export const deleteDoc = async (docRef) => {
  const { collectionPath, id } = splitDocPath(docRef.path);
  const collection = ensureCollection(collectionPath);
  collection.delete(id);
  emitDoc(collectionPath, id);
};

export const onSnapshot = (ref, callback) => {
  const path = ref.path;
  if (!listeners.has(path)) {
    listeners.set(path, new Set());
  }
  listeners.get(path).add(callback);

  if (ref._type === "collection") {
    callback(createCollectionSnapshot(path));
  } else if (ref._type === "doc") {
    const { collectionPath, id } = splitDocPath(path);
    const collection = ensureCollection(collectionPath);
    callback(createDocSnapshot(collectionPath, id, collection.get(id)));
  }

  return () => {
    const subs = listeners.get(path);
    if (!subs) return;
    subs.delete(callback);
    if (subs.size === 0) {
      listeners.delete(path);
    }
  };
};

export const replaceCollection = (collectionPath, items, options = {}) => {
  store.set(collectionPath, new Map());
  const idField = options.idField ?? "id";
  const collection = ensureCollection(collectionPath);
  items.forEach((item) => {
    const id = item[idField] ?? generateId();
    const data = { ...item };
    if (idField in data) {
      delete data[idField];
    }
    collection.set(id, clone(data));
  });
  emitCollection(collectionPath);
};
