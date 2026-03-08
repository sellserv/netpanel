# Monitoring Engine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a health check polling engine with WebSocket push and status dots on device nodes.

**Architecture:** Server-side polling engine runs HTTP/TCP/ping checks per device on configurable intervals. Results are persisted in SQLite and pushed to the frontend via WebSocket. The frontend displays a colored status dot on each device node and exposes health check configuration in the existing ConfigPanel.

**Tech Stack:** `ws` (WebSocket server), Node.js `net`/`child_process` for checks, native browser WebSocket

---

### Task 1: Install ws dependency

**Files:**
- Modify: `package.json`

**Step 1: Install ws and types**

Run: `npm install ws && npm install -D @types/ws`

**Step 2: Verify**

Run: `npm ls ws`
Expected: `ws@X.X.X` listed.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add ws dependency for WebSocket support"
```

---

### Task 2: Add health check types to Device

**Files:**
- Modify: `src/types.ts`

**Step 1: Add HealthCheck and HealthStatus types**

Add these types to the end of `src/types.ts` (before closing):

```ts
export type HealthCheckType = 'http' | 'tcp' | 'ping'

export interface HealthCheck {
  type: HealthCheckType
  target?: string
  interval: number  // seconds: 30, 60, 300, 600
}

export interface HealthStatus {
  deviceId: string
  status: 'up' | 'down' | 'unknown'
  latency?: number
  error?: string
  checkedAt: string
}
```

**Step 2: Add optional `healthCheck` field to `Device` interface**

In the existing `Device` interface, add after `notes: string`:

```ts
  healthCheck?: HealthCheck
```

**Step 3: Update the `UPDATE_DEVICE` action type in `src/state.ts`**

Change line 8 from:
```ts
  | { type: 'UPDATE_DEVICE'; id: string; changes: Partial<Pick<Device, 'label' | 'ip' | 'notes' | 'type'>> }
```
to:
```ts
  | { type: 'UPDATE_DEVICE'; id: string; changes: Partial<Pick<Device, 'label' | 'ip' | 'notes' | 'type' | 'healthCheck'>> }
```

Also update the `update` helper type in `src/components/ConfigPanel.tsx` line 12 to match:
```ts
  const update = (changes: Partial<Pick<Device, 'label' | 'ip' | 'notes' | 'type' | 'healthCheck'>>) => {
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: No errors.

**Step 5: Commit**

```bash
git add src/types.ts src/state.ts src/components/ConfigPanel.tsx
git commit -m "feat: add health check types to Device interface"
```

---

### Task 3: Add health_results table to database

**Files:**
- Modify: `server/db.ts`

**Step 1: Add the health_results table**

In `server/db.ts`, add to the `db.exec(...)` call, after the `topology_state` CREATE TABLE:

```sql
CREATE TABLE IF NOT EXISTS health_results (
  device_id TEXT NOT NULL,
  topology_id TEXT NOT NULL,
  status TEXT NOT NULL,
  latency INTEGER,
  error TEXT,
  checked_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (device_id, topology_id)
);
```

**Step 2: Add prepared statements**

Add after the existing exports in `server/db.ts`:

```ts
export interface HealthResultRow {
  device_id: string
  topology_id: string
  status: string
  latency: number | null
  error: string | null
  checked_at: string
}

export const getHealthResults = db.prepare<[string], HealthResultRow>(
  'SELECT device_id, topology_id, status, latency, error, checked_at FROM health_results WHERE topology_id = ?'
)

export const upsertHealthResult = db.prepare<[string, string, string, number | null, string | null]>(
  `INSERT INTO health_results (device_id, topology_id, status, latency, error, checked_at)
   VALUES (?, ?, ?, ?, ?, datetime('now'))
   ON CONFLICT (device_id, topology_id) DO UPDATE SET
     status = excluded.status,
     latency = excluded.latency,
     error = excluded.error,
     checked_at = excluded.checked_at`
)

export const deleteHealthResultsForTopology = db.prepare<[string]>(
  'DELETE FROM health_results WHERE topology_id = ?'
)

export const deleteHealthResult = db.prepare<[string, string]>(
  'DELETE FROM health_results WHERE device_id = ? AND topology_id = ?'
)
```

**Step 3: Verify**

Run: `npx tsx --eval "import './server/db.ts'; console.log('db ok')"`
Expected: Prints "db ok".

**Step 4: Commit**

```bash
git add server/db.ts
git commit -m "feat: add health_results table and queries"
```

---

### Task 4: Create the monitoring engine

**Files:**
- Create: `server/monitor.ts`

**Step 1: Create `server/monitor.ts`**

```ts
import net from 'net'
import { exec } from 'child_process'
import { upsertHealthResult } from './db.js'

export interface CheckConfig {
  deviceId: string
  topologyId: string
  type: 'http' | 'tcp' | 'ping'
  target: string
  interval: number
}

export interface CheckResult {
  deviceId: string
  topologyId: string
  status: 'up' | 'down'
  latency?: number
  error?: string
  checkedAt: string
}

type ResultCallback = (result: CheckResult) => void

const timers = new Map<string, ReturnType<typeof setInterval>>()
let onResult: ResultCallback = () => {}

function timerKey(topologyId: string, deviceId: string): string {
  return `${topologyId}:${deviceId}`
}

export function setResultCallback(cb: ResultCallback) {
  onResult = cb
}

async function checkHttp(target: string): Promise<{ status: 'up' | 'down'; latency: number; error?: string }> {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(target, { signal: controller.signal })
    clearTimeout(timeout)
    const latency = Date.now() - start
    return { status: res.ok ? 'up' : 'down', latency, error: res.ok ? undefined : `HTTP ${res.status}` }
  } catch (err) {
    return { status: 'down', latency: Date.now() - start, error: (err as Error).message }
  }
}

function checkTcp(target: string): Promise<{ status: 'up' | 'down'; latency: number; error?: string }> {
  return new Promise(resolve => {
    const [host, portStr] = target.split(':')
    const port = parseInt(portStr || '80', 10)
    const start = Date.now()
    const socket = new net.Socket()
    socket.setTimeout(10000)

    socket.on('connect', () => {
      const latency = Date.now() - start
      socket.destroy()
      resolve({ status: 'up', latency })
    })

    socket.on('timeout', () => {
      socket.destroy()
      resolve({ status: 'down', latency: Date.now() - start, error: 'timeout' })
    })

    socket.on('error', (err) => {
      socket.destroy()
      resolve({ status: 'down', latency: Date.now() - start, error: err.message })
    })

    socket.connect(port, host)
  })
}

function checkPing(target: string): Promise<{ status: 'up' | 'down'; latency: number; error?: string }> {
  return new Promise(resolve => {
    const start = Date.now()
    exec(`ping -c 1 -W 5 ${target}`, (err, stdout) => {
      const latency = Date.now() - start
      if (err) {
        resolve({ status: 'down', latency, error: 'unreachable' })
        return
      }
      const match = stdout.match(/time[=<]([\d.]+)/)
      resolve({ status: 'up', latency: match ? parseFloat(match[1]) : latency })
    })
  })
}

async function runCheck(config: CheckConfig) {
  let result: { status: 'up' | 'down'; latency: number; error?: string }

  switch (config.type) {
    case 'http':
      result = await checkHttp(config.target)
      break
    case 'tcp':
      result = await checkTcp(config.target)
      break
    case 'ping':
      result = await checkPing(config.target)
      break
  }

  const checkedAt = new Date().toISOString()

  upsertHealthResult.run(
    config.deviceId,
    config.topologyId,
    result.status,
    result.latency ?? null,
    result.error ?? null
  )

  const checkResult: CheckResult = {
    deviceId: config.deviceId,
    topologyId: config.topologyId,
    status: result.status,
    latency: result.latency,
    error: result.error,
    checkedAt,
  }

  onResult(checkResult)
}

export function startCheck(config: CheckConfig) {
  const key = timerKey(config.topologyId, config.deviceId)
  stopCheck(config.topologyId, config.deviceId)

  // Run immediately, then on interval
  runCheck(config)
  const timer = setInterval(() => runCheck(config), config.interval * 1000)
  timers.set(key, timer)
}

export function stopCheck(topologyId: string, deviceId: string) {
  const key = timerKey(topologyId, deviceId)
  const existing = timers.get(key)
  if (existing) {
    clearInterval(existing)
    timers.delete(key)
  }
}

export function stopAllChecksForTopology(topologyId: string) {
  for (const [key, timer] of timers.entries()) {
    if (key.startsWith(`${topologyId}:`)) {
      clearInterval(timer)
      timers.delete(key)
    }
  }
}

interface DeviceWithCheck {
  id: string
  ip: string
  healthCheck?: {
    type: 'http' | 'tcp' | 'ping'
    target?: string
    interval: number
  }
}

export function syncChecks(topologyId: string, devices: DeviceWithCheck[]) {
  // Stop checks for devices that no longer have healthCheck configured
  const activeDeviceIds = new Set(
    devices.filter(d => d.healthCheck).map(d => d.id)
  )

  for (const key of timers.keys()) {
    if (key.startsWith(`${topologyId}:`)) {
      const deviceId = key.slice(topologyId.length + 1)
      if (!activeDeviceIds.has(deviceId)) {
        stopCheck(topologyId, deviceId)
      }
    }
  }

  // Start or update checks for devices with healthCheck
  for (const device of devices) {
    if (!device.healthCheck) continue
    const target = device.healthCheck.target || device.ip
    if (!target) continue

    const config: CheckConfig = {
      deviceId: device.id,
      topologyId,
      type: device.healthCheck.type,
      target,
      interval: device.healthCheck.interval,
    }

    const key = timerKey(topologyId, device.id)
    // Only restart if not already running (save re-triggers would be noisy otherwise)
    if (!timers.has(key)) {
      startCheck(config)
    }
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.server.json`
Expected: No errors.

**Step 3: Commit**

```bash
git add server/monitor.ts
git commit -m "feat: add health check polling engine with HTTP/TCP/ping"
```

---

### Task 5: Create WebSocket server module

**Files:**
- Create: `server/ws.ts`

**Step 1: Create `server/ws.ts`**

```ts
import { WebSocketServer } from 'ws'
import type { Server } from 'http'
import type { WebSocket } from 'ws'
import type { CheckResult } from './monitor.js'

interface SubscribedClient {
  ws: WebSocket
  topologyId: string
}

const clients = new Set<SubscribedClient>()

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws) => {
    let client: SubscribedClient | null = null

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'subscribe' && typeof msg.topologyId === 'string') {
          // Remove old subscription if any
          if (client) clients.delete(client)
          client = { ws, topologyId: msg.topologyId }
          clients.add(client)
        }
      } catch {}
    })

    ws.on('close', () => {
      if (client) clients.delete(client)
    })
  })
}

export function broadcastHealthResult(result: CheckResult) {
  const payload = JSON.stringify({
    type: 'health',
    deviceId: result.deviceId,
    status: result.status,
    latency: result.latency,
    error: result.error,
    checkedAt: result.checkedAt,
  })

  for (const client of clients) {
    if (client.topologyId === result.topologyId && client.ws.readyState === client.ws.OPEN) {
      client.ws.send(payload)
    }
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.server.json`
Expected: No errors.

**Step 3: Commit**

```bash
git add server/ws.ts
git commit -m "feat: add WebSocket server for broadcasting health results"
```

---

### Task 6: Integrate monitoring and WebSocket into Express server

**Files:**
- Modify: `server/index.ts`

**Step 1: Update `server/index.ts`**

Add imports at the top (after existing imports):

```ts
import { createServer } from 'http'
import { setupWebSocket, broadcastHealthResult } from './ws.js'
import { setResultCallback, syncChecks, stopAllChecksForTopology } from './monitor.js'
import { getHealthResults, deleteHealthResultsForTopology } from './db.js'
```

Add `getHealthResults` and `deleteHealthResultsForTopology` to the existing db.js import (merge into the existing import line).

Replace the server startup at the bottom. Change from:

```ts
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
```

To:

```ts
const server = createServer(app)
setupWebSocket(server)
setResultCallback(broadcastHealthResult)

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
```

**Step 2: Add health endpoint**

Add this route before the static files section:

```ts
// Get health results for a topology
app.get('/api/topologies/:id/health', (req: Request, res: Response) => {
  const id = String(req.params.id)
  const row = getTopology.get(id)
  if (!row) {
    res.status(404).json({ error: 'not found' })
    return
  }
  const results = getHealthResults.all(id)
  res.json(results.map(r => ({
    deviceId: r.device_id,
    status: r.status,
    latency: r.latency,
    error: r.error,
    checkedAt: r.checked_at,
  })))
})
```

**Step 3: Add syncChecks call to the PUT endpoint**

In the existing `PUT /api/topologies/:id` handler, after saving the state, add monitoring sync. After `saveTopologyTransaction(id, JSON.stringify(state))`, add:

```ts
    // Sync health checks for this topology
    if (state.devices) {
      syncChecks(id, state.devices)
    }
```

**Step 4: Add cleanup to the DELETE endpoint**

In the existing `DELETE /api/topologies/:id` handler, before `deleteTopology.run(id)`, add:

```ts
  stopAllChecksForTopology(id)
  deleteHealthResultsForTopology.run(id)
```

**Step 5: Verify server starts**

Run: `npx tsx server/index.ts &`
Then: `curl http://localhost:3001/api/topologies`
Expected: Returns topology list.
Kill the process.

**Step 6: Commit**

```bash
git add server/index.ts
git commit -m "feat: integrate monitoring engine and WebSocket into Express server"
```

---

### Task 7: Add Vite WebSocket proxy

**Files:**
- Modify: `vite.config.ts`

**Step 1: Update `vite.config.ts`**

Add WebSocket proxy alongside the existing API proxy:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
})
```

**Step 2: Commit**

```bash
git add vite.config.ts
git commit -m "feat: add WebSocket proxy to Vite dev config"
```

---

### Task 8: Create useHealthStatus hook

**Files:**
- Create: `src/useHealthStatus.ts`

**Step 1: Create `src/useHealthStatus.ts`**

```ts
import { useState, useEffect, useCallback, useRef } from 'react'
import type { HealthStatus } from './types'

export function useHealthStatus(topologyId: string | null) {
  const [statuses, setStatuses] = useState<Map<string, HealthStatus>>(new Map())
  const wsRef = useRef<WebSocket | null>(null)

  // Fetch initial health results via REST
  useEffect(() => {
    if (!topologyId) return
    fetch(`/api/topologies/${topologyId}/health`)
      .then(res => res.json())
      .then((results: HealthStatus[]) => {
        const map = new Map<string, HealthStatus>()
        for (const r of results) {
          map.set(r.deviceId, r)
        }
        setStatuses(map)
      })
      .catch(() => {})
  }, [topologyId])

  // WebSocket for live updates
  useEffect(() => {
    if (!topologyId) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', topologyId }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'health') {
          setStatuses(prev => {
            const next = new Map(prev)
            next.set(msg.deviceId, {
              deviceId: msg.deviceId,
              status: msg.status,
              latency: msg.latency,
              error: msg.error,
              checkedAt: msg.checkedAt,
            })
            return next
          })
        }
      } catch {}
    }

    ws.onclose = () => {
      // Reconnect after 3 seconds
      setTimeout(() => {
        if (wsRef.current === ws) {
          wsRef.current = null
        }
      }, 3000)
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [topologyId])

  const getStatus = useCallback((deviceId: string): HealthStatus | undefined => {
    return statuses.get(deviceId)
  }, [statuses])

  return { statuses, getStatus }
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/useHealthStatus.ts
git commit -m "feat: add useHealthStatus hook with WebSocket live updates"
```

---

### Task 9: Add status dot to DeviceNode

**Files:**
- Modify: `src/components/DeviceNode.tsx`

**Step 1: Add healthStatus prop to DeviceNodeProps**

Add to the `DeviceNodeProps` interface:

```ts
  healthStatus?: 'up' | 'down' | 'unknown'
```

**Step 2: Render the status dot**

Inside the `<g>` return, after the IP address text element and before the port circles, add:

```tsx
      {healthStatus && (
        <circle
          cx={device.x + DEVICE_WIDTH - 6}
          cy={device.y + 6}
          r={5}
          fill={healthStatus === 'up' ? '#22c55e' : healthStatus === 'down' ? '#ef4444' : '#71717a'}
          stroke="#18181b"
          strokeWidth={1.5}
        />
      )}
```

This places a small colored dot at the top-right corner of the device: green for up, red for down, gray for unknown.

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/components/DeviceNode.tsx
git commit -m "feat: add health status dot to DeviceNode"
```

---

### Task 10: Wire health status through Canvas and App

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Canvas.tsx`

**Step 1: Update App.tsx**

Add the health status hook. After the `useTopology()` call, add:

```ts
import { useHealthStatus } from './useHealthStatus'
```

And inside the component:

```ts
const { statuses: healthStatuses } = useHealthStatus(currentTopologyId)
```

Pass `healthStatuses` to Canvas:

```tsx
<Canvas
  state={state}
  dispatch={dispatch}
  dragConn={dragConn}
  onPortDragStart={onPortDragStart}
  onPortDragMove={onPortDragMove}
  onPortDragEnd={onPortDragEnd}
  onPortDragCancel={onPortDragCancel}
  healthStatuses={healthStatuses}
/>
```

**Step 2: Update Canvas.tsx**

Add to `CanvasProps`:

```ts
import type { HealthStatus } from '../types'
```

```ts
  healthStatuses?: Map<string, HealthStatus>
```

Add `healthStatuses` to the destructured props.

Pass the status to each `DeviceNode`:

```tsx
{state.devices.map(device => (
  <DeviceNode
    key={device.id}
    device={device}
    isSelected={state.selectionType === 'device' && state.selectedIds.includes(device.id)}
    viewBox={viewBox}
    dispatch={dispatch}
    svgRef={svgRef}
    onPortDragStart={onPortDragStart}
    onPortDragEnd={onPortDragEnd}
    isDraggingConnection={!!dragConn}
    healthStatus={healthStatuses?.get(device.id)?.status}
  />
))}
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/App.tsx src/components/Canvas.tsx
git commit -m "feat: wire health status from WebSocket hook through to DeviceNode"
```

---

### Task 11: Add health check config UI to ConfigPanel

**Files:**
- Modify: `src/components/ConfigPanel.tsx`

**Step 1: Add health check section to ConfigPanel**

Import `HealthCheck` type:
```ts
import type { Device, HealthCheck } from '../types'
```

After the Notes textarea section and before the Delete button section, add:

```tsx
        <div className="pt-2 border-t border-zinc-700/50">
          <label className="block text-xs text-zinc-500 mb-2">Health Check</label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={!!device.healthCheck}
                onChange={e => {
                  if (e.target.checked) {
                    update({
                      healthCheck: { type: 'ping', interval: 60 },
                    })
                  } else {
                    update({ healthCheck: undefined })
                  }
                }}
                className="rounded bg-zinc-900 border-zinc-600"
              />
              Enable monitoring
            </label>

            {device.healthCheck && (
              <>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Check Type</label>
                  <select
                    value={device.healthCheck.type}
                    onChange={e =>
                      update({
                        healthCheck: { ...device.healthCheck!, type: e.target.value as HealthCheck['type'] },
                      })
                    }
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                  >
                    <option value="ping">Ping</option>
                    <option value="tcp">TCP Port</option>
                    <option value="http">HTTP</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-zinc-500 mb-1">
                    {device.healthCheck.type === 'http' ? 'URL' : device.healthCheck.type === 'tcp' ? 'Host:Port' : 'Host (blank = use IP)'}
                  </label>
                  <input
                    type="text"
                    value={device.healthCheck.target || ''}
                    onChange={e =>
                      update({
                        healthCheck: { ...device.healthCheck!, target: e.target.value || undefined },
                      })
                    }
                    placeholder={
                      device.healthCheck.type === 'http'
                        ? 'https://example.com'
                        : device.healthCheck.type === 'tcp'
                        ? '192.168.1.1:443'
                        : device.ip || 'IP address'
                    }
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Interval</label>
                  <select
                    value={device.healthCheck.interval}
                    onChange={e =>
                      update({
                        healthCheck: { ...device.healthCheck!, interval: parseInt(e.target.value, 10) },
                      })
                    }
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                  >
                    <option value="30">Every 30 seconds</option>
                    <option value="60">Every 1 minute</option>
                    <option value="300">Every 5 minutes</option>
                    <option value="600">Every 10 minutes</option>
                  </select>
                </div>
              </>
            )}
          </div>
        </div>
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/components/ConfigPanel.tsx
git commit -m "feat: add health check configuration UI to ConfigPanel"
```

---

### Task 12: Add health endpoint to API client

**Files:**
- Modify: `src/api.ts`

**Step 1: Add fetchHealthResults function**

Add to the end of `src/api.ts`:

```ts
export async function fetchHealthResults(topologyId: string): Promise<import('./types').HealthStatus[]> {
  return request(`/topologies/${topologyId}/health`)
}
```

**Step 2: Commit**

```bash
git add src/api.ts
git commit -m "feat: add health results endpoint to API client"
```

---

### Task 13: Final integration test and build

**Files:**
- None (verification only)

**Step 1: Verify TypeScript compiles (both frontend and server)**

Run: `npx tsc --noEmit -p tsconfig.app.json && npx tsc --noEmit -p tsconfig.server.json`
Expected: No errors.

**Step 2: Verify production build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Integration test**

Run: `npx tsx server/index.ts &`

Create a topology and add a device with a health check:

```bash
# Create topology
curl -s -X POST http://localhost:3001/api/topologies \
  -H "Content-Type: application/json" \
  -d '{"name":"Test"}'

# Save state with a device that has a ping health check (use the id from above)
# Then check the health endpoint
curl -s http://localhost:3001/api/topologies/<id>/health
```

Verify WebSocket connects (browser test with dev server).

Kill the process, clean up test data.

**Step 4: Commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: integration fixes for monitoring engine"
```
