import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import { DataGrid } from "@mui/x-data-grid";
import {
  doc,
  collection,
  addDoc,
  onSnapshot,
  Timestamp,
  timestampToDate,
  setDoc,
  updateDoc,
} from "../db/mockFirestore";
import { useMockFirestore } from "./context/MockFirestoreContext";
import { useAuth } from "./context/AuthContext";

const vehicleStatusOptions = [
  "New",
  "Consigned",
  "Arrived",
  "Inspected",
  "On Block",
  "Sold",
  "Paid",
];

type User = {
  id: string;
  name: string;
  role?: string;
};

type UserRecord = Omit<User, "id">;

type Vehicle = {
  id: string;
  vin?: string;
  make?: string;
  model?: string;
  status?: string;
  book_price?: number;
  updatedAt?: Timestamp | { seconds: number; nanoseconds?: number } | number | string;
  ownerId?: string;
  updatedBy?: string;
};

type VehicleRecord = Omit<Vehicle, "id">;

type EditDraft = {
  id: string;
  vin: string;
  make: string;
  model: string;
  status: string;
  book_price: string;
  updatedAtLocal: string;
  ownerId: string;
  updatedBy: string;
  isNew: boolean;
};

type EditableField =
  | "vin"
  | "make"
  | "model"
  | "status"
  | "book_price"
  | "updatedAtLocal"
  | "ownerId"
  | "updatedBy";

const toDateTimeLocalValue = (value: unknown) => {
  const date = timestampToDate(value);
  if (!date) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

function App() {
  const { db } = useMockFirestore();
  const { currentUser, setRole } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot<UserRecord>(
      collection(db, "users"),
      (snapshot) => {
        if (!("docs" in snapshot)) return;
        const nextUsers = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          name: docSnap.data()?.name ?? "Unknown",
          role: docSnap.data()?.role,
        }));
        setUsers(nextUsers);
      }
    );
    return unsubscribe;
  }, [db]);

  useEffect(() => {
    const unsubscribe = onSnapshot<VehicleRecord>(
      collection(db, "vehicles"),
      (snapshot) => {
        if (!("docs" in snapshot)) return;
        const nextVehicles = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() ?? {}),
        }));
        setVehicles(nextVehicles);
      }
    );
    return unsubscribe;
  }, [db]);

  const ownerNameById = useMemo(() => {
    const map = new Map(users.map((user) => [user.id, user.name]));
    return map;
  }, [users]);

  const handleRoleToggle = (
    _event: ChangeEvent<HTMLInputElement>,
    checked: boolean
  ) => {
    setRole(checked ? "admin" : "user");
  };

  const handleAddMockVehicle = () => {
    setEditDraft({
      id: "",
      vin: "",
      make: "",
      model: "",
      status: vehicleStatusOptions[0],
      book_price: "",
      updatedAtLocal: "",
      ownerId: "",
      updatedBy: "",
      isNew: true,
    });
    setEditError("");
    setEditOpen(true);
  };

  const formatBookPrice = (value: unknown) => {
    if (typeof value !== "number") return "n/a";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getUpdatedAtMillis = (value: unknown) => {
    const date = timestampToDate(value);
    return date ? date.getTime() : 0;
  };

  const openEditDialog = (row: Vehicle) => {
    setEditDraft({
      id: row?.id ?? "",
      vin: row?.vin ?? "",
      make: row?.make ?? "",
      model: row?.model ?? "",
      status: row?.status ?? vehicleStatusOptions[0],
      book_price:
        typeof row?.book_price === "number"
          ? String(row.book_price)
          : "",
      updatedAtLocal: toDateTimeLocalValue(row?.updatedAt),
      ownerId: row?.ownerId ?? "",
      updatedBy: row?.updatedBy ?? "",
      isNew: false,
    });
    setEditError("");
    setEditOpen(true);
  };

  const closeEditDialog = () => {
    setEditOpen(false);
    setEditDraft(null);
    setEditError("");
  };

  const handleEditChange =
    (field: EditableField) => (event: { target: { value: string } }) => {
      const value = event.target.value;
      setEditDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
    };

  const handleSaveEdit = async () => {
    if (!editDraft) return;
    const parsedPrice = Number(editDraft.book_price);
    if (!Number.isFinite(parsedPrice)) {
      setEditError("Book price must be a valid number.");
      return;
    }
    if (!editDraft.updatedAtLocal) {
      setEditError("Updated time is required.");
      return;
    }
    const parsedDate = new Date(editDraft.updatedAtLocal);
    if (Number.isNaN(parsedDate.getTime())) {
      setEditError("Updated time is invalid.");
      return;
    }

    if (
      !editDraft.vin ||
      !editDraft.make ||
      !editDraft.model ||
      !editDraft.ownerId ||
      !editDraft.updatedBy
    ) {
      setEditError("Please fill out all vehicle fields.");
      return;
    }

    const localUpdates = {
      vin: editDraft.vin,
      make: editDraft.make,
      model: editDraft.model,
      status: editDraft.status,
      book_price: parsedPrice,
      updatedAt: Timestamp.fromDate(parsedDate),
      ownerId: editDraft.ownerId,
      updatedBy: editDraft.updatedBy,
    };

    const backendUpdates = {
      ...localUpdates,
      updatedAt: parsedDate.toISOString(),
    };

    setEditSaving(true);
    setEditError("");
    try {
      if (editDraft.isNew) {
        const response = await fetch("/api/vehicle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(backendUpdates),
        });
        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }
        const payload = await response.json();
        const newId = payload?.id ?? "";
        if (newId) {
          await setDoc(doc(collection(db, "vehicles"), newId), localUpdates, {
            merge: true,
          });
        } else {
          await addDoc(collection(db, "vehicles"), localUpdates);
        }
      } else {
        const response = await fetch("/api/vehicle", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editDraft.id, updates: backendUpdates }),
        });
        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }

        await updateDoc(
          doc(collection(db, "vehicles"), editDraft.id),
          localUpdates
        );
      }

      closeEditDialog();
    } catch (error) {
      setEditError("Unable to save changes. Please try again.");
    } finally {
      setEditSaving(false);
    }
  };

  const columns = useMemo(
    () => [
      { field: "make", headerName: "Make", flex: 1, minWidth: 120 },
      { field: "model", headerName: "Model", flex: 1, minWidth: 120 },
      { field: "vin", headerName: "VIN", minWidth: 160 },
      {
        field: "status",
        headerName: "Status",
        minWidth: 120,
        renderCell: (params) => <Chip label={params.value} size="small" />,
      },
      {
        field: "book_price",
        headerName: "Book Price",
        minWidth: 130,
        valueFormatter: (value) => formatBookPrice(value),
      },
      {
        field: "updatedAt",
        headerName: "Updated",
        minWidth: 120,
        valueGetter: (value) => getUpdatedAtMillis(value),
        valueFormatter: (value) =>
          value ? new Date(value).toLocaleTimeString() : "n/a",
      },
      {
        field: "updatedBy",
        headerName: "Updated By",
        minWidth: 140,
        valueGetter: (value, row) =>
          ownerNameById.get(row?.updatedBy ?? value) ?? "Unassigned",
      },
      {
        field: "ownerId",
        headerName: "Owner",
        minWidth: 140,
        valueGetter: (value, row) =>
          ownerNameById.get(row?.ownerId ?? value) ?? "Unassigned",
      },
      {
        field: "actions",
        headerName: "Actions",
        minWidth: 120,
        sortable: false,
        filterable: false,
        renderCell: (params) => (
          <Button size="small" onClick={() => openEditDialog(params.row)}>
            Edit
          </Button>
        ),
      },
    ],
    [ownerNameById]
  );

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Interview Sandbox
          </Typography>
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="subtitle1">{currentUser.name}</Typography>
            <FormControlLabel
              control={
                <Switch
                  color="default"
                  checked={currentUser.role === "admin"}
                  onChange={handleRoleToggle}
                />
              }
              label={currentUser.role === "admin" ? "Admin" : "User"}
            />
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth={false} sx={{ mt: 4, mb: 6 }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h4" gutterBottom>
              Vehicle Inventory
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {vehicles.length} vehicles in mock Firestore
            </Typography>
          </Box>

          <Paper sx={{ p: 2 }} elevation={2}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              alignItems={{ xs: "flex-start", sm: "center" }}
              justifyContent="space-between"
            >
              <Typography variant="subtitle1">
                {users.length} users • {vehicles.length} vehicles
              </Typography>
              <Button variant="outlined" onClick={handleAddMockVehicle}>
                Add Mock Vehicle
              </Button>
            </Stack>
          </Paper>

          <Paper sx={{ height: 620, width: "100%" }} elevation={2}>
            <DataGrid
              rows={vehicles}
              columns={columns}
              getRowId={(row) => row.id}
              disableRowSelectionOnClick
              initialState={{
                sorting: { sortModel: [{ field: "updatedAt", sort: "desc" }] },
              }}
            />
          </Paper>
        </Stack>
      </Container>

      <Dialog open={editOpen} onClose={closeEditDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editDraft?.isNew ? "Add Vehicle" : "Edit Vehicle"}
        </DialogTitle>
        <DialogContent>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              gap: 2,
              mt: 1,
            }}
          >
            <TextField
              label="Vehicle ID"
              value={editDraft?.id ?? ""}
              disabled
              fullWidth
            />
            <TextField
              label="VIN"
              value={editDraft?.vin ?? ""}
              onChange={handleEditChange("vin")}
              fullWidth
            />
            <TextField
              label="Make"
              value={editDraft?.make ?? ""}
              onChange={handleEditChange("make")}
              fullWidth
            />
            <TextField
              label="Model"
              value={editDraft?.model ?? ""}
              onChange={handleEditChange("model")}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                label="Status"
                value={editDraft?.status ?? ""}
                onChange={handleEditChange("status")}
              >
                {vehicleStatusOptions.map((status) => (
                  <MenuItem key={status} value={status}>
                    {status}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Book Price"
              type="number"
              value={editDraft?.book_price ?? ""}
              onChange={handleEditChange("book_price")}
              fullWidth
              inputProps={{ min: 0 }}
            />
            <TextField
              label="Updated At"
              type="datetime-local"
              value={editDraft?.updatedAtLocal ?? ""}
              onChange={handleEditChange("updatedAtLocal")}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <FormControl fullWidth>
              <InputLabel>Owner</InputLabel>
              <Select
                label="Owner"
                value={editDraft?.ownerId ?? ""}
                onChange={handleEditChange("ownerId")}
              >
                {users.map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    {user.name} ({user.id})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Updated By</InputLabel>
              <Select
                label="Updated By"
                value={editDraft?.updatedBy ?? ""}
                onChange={handleEditChange("updatedBy")}
              >
                {users.map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    {user.name} ({user.id})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          {editError ? (
            <Typography sx={{ mt: 2 }} color="error">
              {editError}
            </Typography>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEditDialog}>Cancel</Button>
          <Button
            onClick={handleSaveEdit}
            variant="contained"
            disabled={editSaving}
          >
            {editSaving ? "Saving..." : editDraft?.isNew ? "Add Vehicle" : "Save Changes"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default App;
