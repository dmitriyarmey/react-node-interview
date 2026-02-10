import React from "react";
import ReactDOM from "react-dom/client";
import CssBaseline from "@mui/material/CssBaseline";
import App from "./App";
import { MockFirestoreProvider } from "./context/MockFirestoreContext";
import { AuthProvider } from "./context/AuthContext";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <MockFirestoreProvider>
        <CssBaseline />
        <App />
      </MockFirestoreProvider>
    </AuthProvider>
  </React.StrictMode>
);
