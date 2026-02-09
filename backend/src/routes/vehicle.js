import { Router } from "express";
import {
  collection,
  doc,
  getMockFirestore,
  addDoc,
  setDoc,
  Timestamp,
} from "../../../frontend/db/mockFirestore.js";

const router = Router();
const db = getMockFirestore();

const normalizeUpdatedAt = (value) => {
  if (!value) return value;
  if (value instanceof Timestamp) return value;
  if (typeof value === "number") {
    return Timestamp.fromMillis(value);
  }
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return Timestamp.fromDate(date);
    }
  }
  return value;
};

router.patch("/", async (request, response) => {
  const { id, updates } = request.body ?? {};
  if (!id) {
    response.status(400).json({ error: "id is required" });
    return;
  }
  const nextUpdates = { ...(updates ?? {}) };
  if ("updatedAt" in nextUpdates) {
    nextUpdates.updatedAt = normalizeUpdatedAt(nextUpdates.updatedAt);
  }
  try {
    await setDoc(doc(collection(db, "vehicles"), id), nextUpdates, {
      merge: true,
    });
    response.json({ ok: true });
  } catch (error) {
    response.status(500).json({ error: "update_failed" });
  }
});

router.post("/", async (request, response) => {
  const payload = request.body ?? {};
  const nextPayload = { ...payload };
  if ("updatedAt" in nextPayload) {
    nextPayload.updatedAt = normalizeUpdatedAt(nextPayload.updatedAt);
  }
  if (!nextPayload.updatedAt) {
    nextPayload.updatedAt = Timestamp.now();
  }
  try {
    const docRef = await addDoc(collection(db, "vehicles"), nextPayload);
    const id = docRef.path.split("/").pop();
    response.status(201).json({ id });
  } catch (error) {
    response.status(500).json({ error: "create_failed" });
  }
});

export default router;
