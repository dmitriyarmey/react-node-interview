import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import {
  collection,
  doc,
  getDocs,
  getMockFirestore,
  replaceCollection,
  Timestamp,
  updateDoc,
} from "../../db/mockFirestore.js";

const MockFirestoreContext = createContext(null);

/**
 * @typedef {"New"|"Consigned"|"Arrived"|"Inspected"|"On Block"|"Sold"|"Paid"} VehicleStatus
 * @typedef {Object} BaseVehicle
 * @property {string} vin
 * @property {string} make
 * @property {string} model
 * @property {VehicleStatus} status
 */

const initialUsers = [
  { id: "u1", name: "Alex Chen", role: "Designer" },
  { id: "u2", name: "Priya Patel", role: "Engineer" },
  { id: "u3", name: "Jordan Smith", role: "Product" },
];

const vehicleStatuses = [
  "New",
  "Consigned",
  "Arrived",
  "Inspected",
  "On Block",
  "Sold",
  "Paid",
];

const vehicleSeeds = [
  { make: "Honda", model: "Accord", basePrice: 14850 },
  { make: "Toyota", model: "Camry", basePrice: 18200 },
  { make: "Ford", model: "F-150", basePrice: 28900 },
  { make: "Chevrolet", model: "Silverado", basePrice: 31250 },
  { make: "Nissan", model: "Altima", basePrice: 17650 },
  { make: "Hyundai", model: "Elantra", basePrice: 16400 },
  { make: "Kia", model: "Sorento", basePrice: 23100 },
  { make: "BMW", model: "3 Series", basePrice: 36400 },
  { make: "Audi", model: "A4", basePrice: 38200 },
  { make: "Subaru", model: "Outback", basePrice: 25600 },
];

const buildVin = (index) => `VIN${String(index + 1).padStart(8, "0")}`;

/** @type {Array<BaseVehicle & { id: string; ownerId: string; updatedBy: string }> } */
const initialVehicles = Array.from({ length: 100 }, (_, index) => {
  const seed = vehicleSeeds[index % vehicleSeeds.length];
  const owner = initialUsers[index % initialUsers.length];
  const updater = initialUsers[(index + 1) % initialUsers.length];
  return {
    id: `v${index + 1}`,
    vin: buildVin(index),
    make: seed.make,
    model: seed.model,
    status: vehicleStatuses[index % vehicleStatuses.length],
    book_price: seed.basePrice + (index % 10) * 250,
    updatedAt: Timestamp.now(),
    ownerId: owner.id,
    updatedBy: updater.id,
  };
});

export function MockFirestoreProvider({ children }) {
  const db = useMemo(() => getMockFirestore(), []);
  const seededRef = useRef(false);

  useEffect(() => {
    if (!seededRef.current) {
      seededRef.current = true;
      replaceCollection("users", initialUsers, { idField: "id" });
      replaceCollection("vehicles", initialVehicles, { idField: "id" });
    }

    const vehicleCollection = collection(db, "vehicles");
    const userCollection = collection(db, "users");

    const interval = setInterval(async () => {
      const [vehicleSnapshot, userSnapshot] = await Promise.all([
        getDocs(vehicleCollection),
        getDocs(userCollection),
      ]);
      if (vehicleSnapshot.empty) return;

      const target =
        vehicleSnapshot.docs[
          Math.floor(Math.random() * vehicleSnapshot.docs.length)
        ];
      const current = target.data() ?? {};
      const availableUsers = userSnapshot.empty
        ? initialUsers
        : userSnapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }));
      const randomUser =
        availableUsers[Math.floor(Math.random() * availableUsers.length)];
      const shouldChangePrice = Math.random() < 0.7;
      const priceDelta = Math.round(Math.random() * 900 - 450);
      const nextUpdates = {
        updatedAt: Timestamp.now(),
        updatedBy: randomUser?.id ?? initialUsers[0].id,
      };

      if (shouldChangePrice) {
        const basePrice =
          typeof current.book_price === "number" ? current.book_price : 15000;
        nextUpdates.book_price = Math.max(500, basePrice + priceDelta);
      }

      await updateDoc(doc(vehicleCollection, target.id), nextUpdates);
    }, 500);

    return () => clearInterval(interval);
  }, [db]);

  const value = useMemo(() => ({ db }), [db]);

  return (
    <MockFirestoreContext.Provider value={value}>
      {children}
    </MockFirestoreContext.Provider>
  );
}

export function useMockFirestore() {
  const context = useContext(MockFirestoreContext);
  if (!context) {
    throw new Error("useMockFirestore must be used within a MockFirestoreProvider");
  }
  return context;
}
