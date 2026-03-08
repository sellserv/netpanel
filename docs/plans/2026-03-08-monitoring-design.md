# Monitoring Engine — Design

## Overview

Add a polling-based health check engine to the backend. Each device can optionally have a health check configured (HTTP, TCP, or ping). The server runs checks on configurable intervals and pushes results to the frontend via WebSocket. Status is shown as a colored dot on each device node. Results persist in SQLite for instant status on page load.

## Device Type Changes

Add optional health check fields to `Device`:

```ts
healthCheck?: {
  type: 'http' | 'tcp' | 'ping'
  target?: string    // URL for HTTP, host:port for TCP, defaults to device.ip for ping
  interval: number   // seconds: 30, 60, 300, 600
}
```

Stored in the existing topology state JSON blob — no schema migration needed.

## Server Components

### `server/monitor.ts` — Polling Engine

- `Map<deviceId, timer>` of active check timers
- On topology save, diffs device list and starts/stops timers
- Check functions:
  - `checkHttp` — fetch with timeout
  - `checkTcp` — net.Socket connect
  - `checkPing` — child_process ping
- Result shape: `{ deviceId, status: 'up' | 'down' | 'unknown', latency, error?, timestamp }`

### `server/ws.ts` — WebSocket Layer

- Uses `ws` library, upgraded from Express HTTP server
- Clients send `{ type: 'subscribe', topologyId }` to subscribe
- Server pushes `{ type: 'health', deviceId, status, latency, timestamp }` on each check

### Database

```sql
CREATE TABLE health_results (
  device_id TEXT NOT NULL,
  topology_id TEXT NOT NULL,
  status TEXT NOT NULL,
  latency INTEGER,
  error TEXT,
  checked_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (device_id, topology_id)
);
```

One row per device, upserted on each check.

### API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/topologies/:id/health` | Get latest health results for all devices |

## Frontend Changes

- **`src/useHealthStatus.ts`** — WebSocket hook, subscribes to topology, maintains `Map<deviceId, HealthStatus>`
- **DeviceNode** — colored dot at top-right corner (green=up, red=down, gray=unconfigured/unknown)
- **ConfigPanel** — "Health Check" section: enable toggle, type dropdown, target input, interval dropdown (30s/1m/5m/10m)
- **On mount** — fetch `/api/topologies/:id/health` for initial status, WebSocket for live updates

## Data Flow

```
Device saved with healthCheck config
  → PUT /api/topologies/:id saves state
  → Server diffs devices, starts/stops check timers
  → Timer fires → run check → upsert result in DB
  → Push result over WebSocket to subscribed clients
  → Frontend updates status dot on DeviceNode
```
