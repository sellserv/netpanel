# Backend (Express + SQLite) — Design

## Overview

Add a Node.js + Express backend with SQLite for persisting topology state. Supports multiple named topologies. Auto-save on change with debounce. Export/import as JSON. Single port in production (Express serves static + API), Vite proxy in dev.

## Structure

```
server/
  index.ts    # Express app
  db.ts       # SQLite setup + queries
data/
  panel.db    # SQLite file (gitignored)
```

## Database Schema

```sql
CREATE TABLE topologies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE topology_state (
  topology_id TEXT PRIMARY KEY REFERENCES topologies(id),
  state JSON NOT NULL
);
```

State stored as a single JSON blob containing devices, connections, zones, viewBox.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/topologies` | List all (id, name, timestamps) |
| POST | `/api/topologies` | Create new topology |
| GET | `/api/topologies/:id` | Load full state |
| PUT | `/api/topologies/:id` | Save full state |
| DELETE | `/api/topologies/:id` | Delete topology |
| GET | `/api/topologies/:id/export` | Export as JSON download |
| POST | `/api/import` | Import JSON, creates new topology |

## Frontend Changes

- Replace localStorage with API calls (debounced PUT)
- Topology selector in sidebar header
- Load from API on mount
- New/delete topology controls

## Dev/Prod

- Dev: Vite proxies /api/* to Express :3001
- Prod: Express serves dist/ static + API on :3001
