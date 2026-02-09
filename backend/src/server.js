import express from "express";
import cors from "cors";
import vehicleRoutes from "./routes/vehicle.js";

const app = express();
const port = 3050;

app.use(cors({ origin: true }));
app.use(express.json());

app.use("/api/vehicle", vehicleRoutes);

app.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on port ${port}`);
});
