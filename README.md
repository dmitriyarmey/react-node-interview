# Interview Sandbox

A quick-start environment for Senior SWE technical interviews.

| Layer    | Stack                | Port |
| -------- | -------------------- | ---- |
| Frontend | React + Vite + MUI   | 5173 |
| Backend  | Node.js + Fastify    | 3050 |

## Getting Started

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend proxies `/api` requests to `http://localhost:3050`, so both can run side-by-side without CORS issues.

## Project Structure

```
frontend/
  src/
    main.jsx        # React entry point
    App.jsx         # MUI demo with backend ping
  vite.config.js    # Vite config + API proxy
  index.html

backend/
  src/
    server.js       # Fastify entry point (port 3050)
    routes/
      example.js    # GET /api/hello
```
