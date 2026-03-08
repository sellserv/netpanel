# Proxmox Per-VM Monitoring, Power Controls, and SSH Terminal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-VM/LXC Proxmox monitoring with discovery and manual linking, power controls (start/shutdown/reboot) with confirmation modals, and a built-in tabbed SSH terminal in a bottom drawer.

**Architecture:** Server-side Proxmox API proxy endpoints for discovery and power control. Extended monitoring engine for per-VM metrics. ssh2-based SSH proxy over WebSocket. Client-side xterm.js terminal in a resizable bottom drawer with tabs.

**Tech Stack:** ssh2 (server SSH), xterm + @xterm/addon-fit (browser terminal), existing Express/WebSocket/React stack.

---

### Task 1: Install Dependencies

**Step 1: Install server and client packages**

Run:
```bash
cd /home/coder/projects/panel
npm install ssh2 xterm @xterm/addon-fit
npm install -D @types/ssh2
```

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add ssh2 and xterm dependencies"
```

---

### Task 2: Extend Types

**Files:**
- Modify: `src/types.ts`

**Step 1: Add ProxmoxVmLink interface and extend Device**

After the `HealthStatus` interface (line 91), add:

```typescript
export interface ProxmoxVmLink {
  host: string
  node: string
  vmid: number
  type: 'qemu' | 'lxc'
}
```

Add `proxmoxVm?: ProxmoxVmLink` to the `Device` interface after line 25 (`healthCheck?: HealthCheck`):

```typescript
export interface Device {
  id: string
  type: DeviceType
  label: string
  x: number
  y: number
  ip: string
  notes: string
  healthCheck?: HealthCheck
  proxmoxVm?: ProxmoxVmLink
}
```

**Step 2: Update Action type in state.ts**

Modify `src/state.ts` line 8 — extend the `UPDATE_DEVICE` changes to include `proxmoxVm`:

```typescript
| { type: 'UPDATE_DEVICE'; id: string; changes: Partial<Pick<Device, 'label' | 'ip' | 'notes' | 'type' | 'healthCheck' | 'proxmoxVm'>> }
```

**Step 3: Verify build**

Run: `cd /home/coder/projects/panel && npx tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```bash
git add src/types.ts src/state.ts
git commit -m "feat: add ProxmoxVmLink type and extend Device interface"
```

---

### Task 3: Server — Proxmox Discovery & Power Control Endpoints

**Files:**
- Create: `server/proxmox.ts`
- Modify: `server/index.ts`

**Step 1: Create server/proxmox.ts**

This module exports two Express route handlers:

```typescript
import type { Request, Response } from 'express'

interface ProxmoxVm {
  vmid: number
  name: string
  type: 'qemu' | 'lxc'
  status: string
  node: string
  cpu?: number
  maxmem?: number
  mem?: number
  uptime?: number
  maxdisk?: number
  disk?: number
}

export async function discoverVms(req: Request, res: Response) {
  const host = req.query.host as string
  const token = req.query.token as string

  if (!host || !token) {
    res.status(400).json({ error: 'host and token query params required' })
    return
  }

  try {
    const headers: Record<string, string> = { Authorization: `PVEAPIToken=${token}` }

    // Fetch nodes
    const nodesRes = await fetch(`https://${host}:8006/api2/json/nodes`, { headers })
    if (!nodesRes.ok) {
      res.status(nodesRes.status).json({ error: `Proxmox API: HTTP ${nodesRes.status}` })
      return
    }
    const nodesJson = await nodesRes.json() as { data: Array<{ node: string }> }
    const nodes = nodesJson.data || []

    const vms: ProxmoxVm[] = []

    for (const n of nodes) {
      // Fetch QEMU VMs
      const qemuRes = await fetch(`https://${host}:8006/api2/json/nodes/${n.node}/qemu`, { headers })
      if (qemuRes.ok) {
        const qemuJson = await qemuRes.json() as { data: Array<{ vmid: number; name?: string; status: string; cpu?: number; maxmem?: number; mem?: number; uptime?: number; maxdisk?: number; disk?: number }> }
        for (const vm of qemuJson.data || []) {
          vms.push({
            vmid: vm.vmid,
            name: vm.name || `VM ${vm.vmid}`,
            type: 'qemu',
            status: vm.status,
            node: n.node,
            cpu: vm.cpu,
            maxmem: vm.maxmem,
            mem: vm.mem,
            uptime: vm.uptime,
            maxdisk: vm.maxdisk,
            disk: vm.disk,
          })
        }
      }

      // Fetch LXC containers
      const lxcRes = await fetch(`https://${host}:8006/api2/json/nodes/${n.node}/lxc`, { headers })
      if (lxcRes.ok) {
        const lxcJson = await lxcRes.json() as { data: Array<{ vmid: number; name?: string; status: string; cpu?: number; maxmem?: number; mem?: number; uptime?: number; maxdisk?: number; disk?: number }> }
        for (const ct of lxcJson.data || []) {
          vms.push({
            vmid: ct.vmid,
            name: ct.name || `CT ${ct.vmid}`,
            type: 'lxc',
            status: ct.status,
            node: n.node,
            cpu: ct.cpu,
            maxmem: ct.maxmem,
            mem: ct.mem,
            uptime: ct.uptime,
            maxdisk: ct.maxdisk,
            disk: ct.disk,
          })
        }
      }
    }

    res.json(vms)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}

export async function vmAction(req: Request, res: Response) {
  const action = req.params.action as string

  if (!['start', 'shutdown', 'reboot'].includes(action)) {
    res.status(400).json({ error: 'action must be start, shutdown, or reboot' })
    return
  }

  const { host, node, vmid, type, token } = req.body
  if (!host || !node || vmid == null || !type || !token) {
    res.status(400).json({ error: 'host, node, vmid, type, and token are required' })
    return
  }

  // Proxmox uses 'stop' for immediate shutdown via API, 'shutdown' for ACPI shutdown
  const proxmoxAction = action === 'reboot' ? 'reboot' : action === 'shutdown' ? 'shutdown' : 'start'

  try {
    const url = `https://${host}:8006/api2/json/nodes/${node}/${type}/${vmid}/status/${proxmoxAction}`
    const result = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `PVEAPIToken=${token}` },
    })

    if (!result.ok) {
      const body = await result.text()
      res.status(result.status).json({ error: body || `HTTP ${result.status}` })
      return
    }

    const json = await result.json()
    res.json({ ok: true, upid: json.data })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}
```

**Step 2: Wire routes into server/index.ts**

After the existing imports (line 9), add:

```typescript
import { discoverVms, vmAction } from './proxmox.js'
```

Before the static files section (before line 157 `const distPath`), add:

```typescript
// Proxmox VM discovery
app.get('/api/proxmox/vms', discoverVms)

// Proxmox VM power actions
app.post('/api/proxmox/vms/:action', vmAction)
```

**Step 3: Verify build**

Run: `cd /home/coder/projects/panel && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add server/proxmox.ts server/index.ts
git commit -m "feat: add Proxmox VM discovery and power control endpoints"
```

---

### Task 4: Server — Per-VM Monitoring in Monitor

**Files:**
- Modify: `server/monitor.ts`

**Step 1: Extend the proxmox preset to support per-VM metrics**

The existing `API_PRESETS.proxmox` config fetches host-level node data. We need to also support per-VM metrics when a device has `proxmoxVm` set.

Add a new interface after `DeviceWithCheck` (line 265):

```typescript
interface ProxmoxVmInfo {
  host: string
  node: string
  vmid: number
  type: 'qemu' | 'lxc'
}
```

Extend `DeviceWithCheck` to include:

```typescript
interface DeviceWithCheck {
  id: string
  ip: string
  healthCheck?: {
    type: 'http' | 'tcp' | 'ping' | 'api'
    target?: string
    interval: number
    apiPreset?: ApiPreset
    apiToken?: string
  }
  proxmoxVm?: ProxmoxVmInfo
}
```

Extend `CheckConfig` (line 8) to include:

```typescript
export interface CheckConfig {
  deviceId: string
  topologyId: string
  type: 'http' | 'tcp' | 'ping' | 'api'
  target: string
  interval: number
  apiPreset?: ApiPreset
  apiToken?: string
  proxmoxVm?: ProxmoxVmInfo
}
```

Add a new function `checkProxmoxVm` after the `checkApi` function:

```typescript
async function checkProxmoxVm(vm: ProxmoxVmInfo, token?: string): Promise<{ status: 'up' | 'down'; latency: number; error?: string; metrics?: Record<string, string | number | boolean> }> {
  const start = Date.now()
  try {
    const url = `https://${vm.host}:8006/api2/json/nodes/${vm.node}/${vm.type}/${vm.vmid}/status/current`
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `PVEAPIToken=${token}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const res = await fetch(url, { signal: controller.signal, headers })
    clearTimeout(timeout)
    const latency = Date.now() - start

    if (!res.ok) {
      return { status: 'down', latency, error: `HTTP ${res.status}` }
    }

    const json = await res.json() as { data: { status?: string; cpu?: number; maxmem?: number; mem?: number; uptime?: number; maxdisk?: number; disk?: number; name?: string } }
    const d = json.data || {}

    const vmStatus = d.status === 'running' ? 'up' : 'down'
    const cpuPercent = typeof d.cpu === 'number' ? Math.round(d.cpu * 10000) / 100 : 0
    const ramPercent = (d.maxmem && d.mem) ? Math.round((d.mem / d.maxmem) * 10000) / 100 : 0
    const diskPercent = (d.maxdisk && d.disk) ? Math.round((d.disk / d.maxdisk) * 10000) / 100 : 0
    const uptime = typeof d.uptime === 'number' ? d.uptime : 0

    return {
      status: vmStatus,
      latency,
      metrics: {
        vmStatus: d.status || 'unknown',
        cpuPercent,
        ramPercent,
        diskPercent,
        uptime,
      },
    }
  } catch (err) {
    return { status: 'down', latency: Date.now() - start, error: (err as Error).message }
  }
}
```

Modify the `runCheck` function — add a case for proxmoxVm before the switch:

```typescript
async function runCheck(config: CheckConfig) {
  let result: { status: 'up' | 'down'; latency: number; error?: string; metrics?: Record<string, string | number | boolean> }

  // Per-VM Proxmox monitoring takes priority
  if (config.proxmoxVm) {
    result = await checkProxmoxVm(config.proxmoxVm, config.apiToken)
  } else {
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
      case 'api':
        result = await checkApi(config.target, config.apiPreset!, config.apiToken)
        break
    }
  }
  // ... rest unchanged
```

Modify `syncChecks` to pass `proxmoxVm` into the config (around line 301):

```typescript
const config: CheckConfig = {
  deviceId: device.id,
  topologyId,
  type: device.healthCheck.type,
  target,
  interval: device.healthCheck.interval,
  apiPreset: device.healthCheck.apiPreset,
  apiToken: device.healthCheck.apiToken,
  proxmoxVm: device.proxmoxVm,
}
```

**Step 2: Verify build**

Run: `cd /home/coder/projects/panel && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add server/monitor.ts
git commit -m "feat: add per-VM Proxmox monitoring to health check engine"
```

---

### Task 5: Server — SSH WebSocket Handler

**Files:**
- Create: `server/ssh.ts`
- Modify: `server/ws.ts`
- Modify: `server/index.ts`

**Step 1: Create server/ssh.ts**

```typescript
import { WebSocketServer } from 'ws'
import type { Server } from 'http'
import type { WebSocket } from 'ws'
import { Client as SSHClient } from 'ssh2'

export function setupSshWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws/ssh' })

  wss.on('connection', (ws: WebSocket) => {
    let ssh: SSHClient | null = null

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())

        if (msg.type === 'connect') {
          const { host, port, username, password, privateKey } = msg

          if (!host || !username) {
            ws.send(JSON.stringify({ type: 'error', message: 'host and username required' }))
            return
          }

          ssh = new SSHClient()

          ssh.on('ready', () => {
            ws.send(JSON.stringify({ type: 'connected' }))

            ssh!.shell({ term: 'xterm-256color' }, (err, stream) => {
              if (err) {
                ws.send(JSON.stringify({ type: 'error', message: err.message }))
                return
              }

              stream.on('data', (data: Buffer) => {
                if (ws.readyState === ws.OPEN) {
                  ws.send(JSON.stringify({ type: 'data', data: data.toString('base64') }))
                }
              })

              stream.on('close', () => {
                ws.send(JSON.stringify({ type: 'closed' }))
                ssh?.end()
              })

              ws.on('message', (raw) => {
                try {
                  const msg = JSON.parse(raw.toString())
                  if (msg.type === 'data') {
                    stream.write(Buffer.from(msg.data, 'base64'))
                  } else if (msg.type === 'resize') {
                    stream.setWindow(msg.rows, msg.cols, 0, 0)
                  }
                } catch {}
              })
            })
          })

          ssh.on('error', (err) => {
            ws.send(JSON.stringify({ type: 'error', message: err.message }))
          })

          ssh.on('close', () => {
            ws.send(JSON.stringify({ type: 'closed' }))
          })

          const connectConfig: Record<string, unknown> = {
            host,
            port: port || 22,
            username,
            readyTimeout: 10000,
          }

          if (privateKey) {
            connectConfig.privateKey = privateKey
          } else if (password) {
            connectConfig.password = password
          }

          ssh.connect(connectConfig as Parameters<SSHClient['connect']>[0])
        } else if (msg.type === 'disconnect') {
          ssh?.end()
          ssh = null
        }
      } catch {}
    })

    ws.on('close', () => {
      ssh?.end()
      ssh = null
    })
  })
}
```

**Step 2: Wire into server/index.ts**

Add import after the existing imports:

```typescript
import { setupSshWebSocket } from './ssh.js'
```

After `setupWebSocket(server)` (line 165), add:

```typescript
setupSshWebSocket(server)
```

**Step 3: Add SSH WebSocket proxy to vite.config.ts**

Add a new proxy entry after the `/ws` proxy:

```typescript
'/ws/ssh': {
  target: 'http://localhost:3001',
  ws: true,
},
```

Note: The `/ws/ssh` entry must come BEFORE the `/ws` entry so Vite matches it first. Reorder the proxy config:

```typescript
proxy: {
  '/api': 'http://localhost:3001',
  '/ws/ssh': {
    target: 'http://localhost:3001',
    ws: true,
  },
  '/ws': {
    target: 'http://localhost:3001',
    ws: true,
  },
},
```

**Step 4: Verify build**

Run: `cd /home/coder/projects/panel && npx tsc --noEmit`

**Step 5: Commit**

```bash
git add server/ssh.ts server/index.ts vite.config.ts
git commit -m "feat: add SSH WebSocket proxy server"
```

---

### Task 6: Client — API Functions

**Files:**
- Modify: `src/api.ts`

**Step 1: Add Proxmox discovery and power control API calls**

Add at the end of `src/api.ts`:

```typescript
export interface ProxmoxVm {
  vmid: number
  name: string
  type: 'qemu' | 'lxc'
  status: string
  node: string
  cpu?: number
  maxmem?: number
  mem?: number
  uptime?: number
}

export async function discoverProxmoxVms(host: string, token: string): Promise<ProxmoxVm[]> {
  return request(`/proxmox/vms?host=${encodeURIComponent(host)}&token=${encodeURIComponent(token)}`)
}

export async function proxmoxVmAction(
  action: 'start' | 'shutdown' | 'reboot',
  params: { host: string; node: string; vmid: number; type: string; token: string }
): Promise<{ ok: boolean; upid?: string }> {
  return request(`/proxmox/vms/${action}`, {
    method: 'POST',
    body: JSON.stringify(params),
  })
}
```

**Step 2: Commit**

```bash
git add src/api.ts
git commit -m "feat: add Proxmox discovery and power control API client functions"
```

---

### Task 7: Client — ConfirmModal Component

**Files:**
- Create: `src/components/ConfirmModal.tsx`

**Step 1: Create the component**

```typescript
interface ConfirmModalProps {
  title: string
  message: string
  confirmLabel: string
  confirmColor?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({ title, message, confirmLabel, confirmColor = 'bg-red-600 hover:bg-red-700', onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl w-96 p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-zinc-100 mb-2">{title}</h3>
        <p className="text-sm text-zinc-400 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded text-white ${confirmColor}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/ConfirmModal.tsx
git commit -m "feat: add reusable ConfirmModal component"
```

---

### Task 8: Client — VmDiscoveryModal Component

**Files:**
- Create: `src/components/VmDiscoveryModal.tsx`

**Step 1: Create the component**

This modal takes a Proxmox host IP and API token, fetches VMs, and lets the user select which ones to add to the canvas.

```typescript
import { useState } from 'react'
import { discoverProxmoxVms } from '../api'
import type { ProxmoxVm } from '../api'
import { X, Search, Monitor, Box } from 'lucide-react'

interface VmDiscoveryModalProps {
  onAdd: (vms: Array<{ vmid: number; name: string; type: 'qemu' | 'lxc'; node: string; host: string; token: string }>) => void
  onClose: () => void
}

export default function VmDiscoveryModal({ onAdd, onClose }: VmDiscoveryModalProps) {
  const [host, setHost] = useState('')
  const [token, setToken] = useState('')
  const [vms, setVms] = useState<ProxmoxVm[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetched, setFetched] = useState(false)

  const discover = async () => {
    if (!host || !token) return
    setLoading(true)
    setError(null)
    try {
      const result = await discoverProxmoxVms(host, token)
      setVms(result)
      setFetched(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const toggleVm = (vmid: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(vmid)) next.delete(vmid)
      else next.add(vmid)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === vms.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(vms.map(v => v.vmid)))
    }
  }

  const handleAdd = () => {
    const toAdd = vms
      .filter(v => selected.has(v.vmid))
      .map(v => ({ vmid: v.vmid, name: v.name, type: v.type, node: v.node, host, token }))
    onAdd(toAdd)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl w-[32rem] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700">
          <h3 className="text-lg font-semibold text-zinc-100">Discover Proxmox VMs</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Proxmox Host IP</label>
            <input
              type="text"
              value={host}
              onChange={e => setHost(e.target.value)}
              placeholder="192.168.1.100"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">API Token</label>
            <input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="user@pam!tokenid=secret-value"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <button
            onClick={discover}
            disabled={loading || !host || !token}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white"
          >
            <Search size={14} />
            {loading ? 'Scanning...' : 'Discover'}
          </button>

          {error && <p className="text-sm text-red-400">{error}</p>}

          {fetched && vms.length === 0 && <p className="text-sm text-zinc-400">No VMs or containers found.</p>}

          {vms.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-500">{vms.length} found</span>
                <button onClick={toggleAll} className="text-xs text-blue-400 hover:text-blue-300">
                  {selected.size === vms.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {vms.map(vm => (
                  <label key={vm.vmid} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-zinc-700/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(vm.vmid)}
                      onChange={() => toggleVm(vm.vmid)}
                      className="rounded bg-zinc-900 border-zinc-600"
                    />
                    {vm.type === 'qemu' ? <Monitor size={14} className="text-indigo-400" /> : <Box size={14} className="text-cyan-400" />}
                    <span className="text-sm text-zinc-200 flex-1">{vm.name}</span>
                    <span className="text-xs text-zinc-500">VMID {vm.vmid}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${vm.status === 'running' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-zinc-700 text-zinc-400'}`}>
                      {vm.status}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {selected.size > 0 && (
          <div className="px-6 py-4 border-t border-zinc-700">
            <button
              onClick={handleAdd}
              className="w-full px-4 py-2 text-sm rounded bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Add {selected.size} Device{selected.size > 1 ? 's' : ''} to Canvas
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/VmDiscoveryModal.tsx
git commit -m "feat: add VmDiscoveryModal for Proxmox VM discovery"
```

---

### Task 9: Client — SshConnectDialog Component

**Files:**
- Create: `src/components/SshConnectDialog.tsx`

**Step 1: Create the component**

```typescript
import { useState } from 'react'
import { X, Key, Lock } from 'lucide-react'

export interface SshConnectParams {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  label: string
}

interface SshConnectDialogProps {
  defaultHost?: string
  defaultLabel?: string
  onConnect: (params: SshConnectParams) => void
  onClose: () => void
}

export default function SshConnectDialog({ defaultHost, defaultLabel, onConnect, onClose }: SshConnectDialogProps) {
  const [host, setHost] = useState(defaultHost || '')
  const [port, setPort] = useState(22)
  const [username, setUsername] = useState('')
  const [authMode, setAuthMode] = useState<'password' | 'key'>('password')
  const [password, setPassword] = useState('')
  const [privateKey, setPrivateKey] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!host || !username) return
    onConnect({
      host,
      port,
      username,
      password: authMode === 'password' ? password : undefined,
      privateKey: authMode === 'key' ? privateKey : undefined,
      label: defaultLabel || `${username}@${host}`,
    })
  }

  const handleKeyFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then(setPrivateKey)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl w-96" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700">
          <h3 className="text-lg font-semibold text-zinc-100">SSH Connect</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-zinc-500 mb-1">Host</label>
              <input
                type="text"
                value={host}
                onChange={e => setHost(e.target.value)}
                placeholder="192.168.1.1"
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                required
              />
            </div>
            <div className="w-20">
              <label className="block text-xs text-zinc-500 mb-1">Port</label>
              <input
                type="number"
                value={port}
                onChange={e => setPort(parseInt(e.target.value) || 22)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="root"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-2">Auth Method</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAuthMode('password')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded ${authMode === 'password' ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'}`}
              >
                <Lock size={14} /> Password
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('key')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded ${authMode === 'key' ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'}`}
              >
                <Key size={14} /> SSH Key
              </button>
            </div>
          </div>

          {authMode === 'password' ? (
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Private Key</label>
              <textarea
                value={privateKey}
                onChange={e => setPrivateKey(e.target.value)}
                placeholder="Paste private key or use file picker below"
                rows={4}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none font-mono text-xs"
              />
              <input
                type="file"
                onChange={handleKeyFile}
                className="mt-1 text-xs text-zinc-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-zinc-700 file:text-zinc-300 hover:file:bg-zinc-600"
              />
            </div>
          )}

          <button
            type="submit"
            className="w-full px-4 py-2 text-sm rounded bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Connect
          </button>
        </form>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/SshConnectDialog.tsx
git commit -m "feat: add SshConnectDialog for SSH credential input"
```

---

### Task 10: Client — SshDrawer Component with xterm.js

**Files:**
- Create: `src/components/SshDrawer.tsx`

**Step 1: Create the component**

This is the bottom drawer with tabbed xterm.js terminals. Each tab manages its own WebSocket connection and xterm instance.

```typescript
import { useState, useRef, useEffect, useCallback } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { X, Minus, Maximize2, Minimize2 } from 'lucide-react'
import 'xterm/css/xterm.css'
import type { SshConnectParams } from './SshConnectDialog'

interface SshTab {
  id: string
  label: string
  params: SshConnectParams
}

interface SshDrawerProps {
  tabs: SshTab[]
  onCloseTab: (id: string) => void
  onCloseAll: () => void
}

function SshTerminal({ tab, onDisconnect }: { tab: SshTab; onDisconnect: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#18181b',
        foreground: '#e4e4e7',
        cursor: '#e4e4e7',
      },
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()

    termRef.current = term
    fitRef.current = fit

    term.writeln('Connecting...')

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsPath = window.location.pathname.replace(/\/[^/]*$/, '/') + 'ws/ssh'
    const ws = new WebSocket(`${proto}//${window.location.host}${wsPath}`)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'connect',
        host: tab.params.host,
        port: tab.params.port,
        username: tab.params.username,
        password: tab.params.password,
        privateKey: tab.params.privateKey,
      }))
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'connected') {
        term.clear()
        // Send initial size
        const dims = fit.proposeDimensions()
        if (dims) {
          ws.send(JSON.stringify({ type: 'resize', rows: dims.rows, cols: dims.cols }))
        }
      } else if (msg.type === 'data') {
        term.write(Uint8Array.from(atob(msg.data), c => c.charCodeAt(0)))
      } else if (msg.type === 'error') {
        term.writeln(`\r\n\x1b[31mError: ${msg.message}\x1b[0m`)
      } else if (msg.type === 'closed') {
        term.writeln('\r\n\x1b[33mConnection closed.\x1b[0m')
      }
    }

    ws.onclose = () => {
      term.writeln('\r\n\x1b[33mDisconnected.\x1b[0m')
    }

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data: btoa(data) }))
      }
    })

    const resizeObserver = new ResizeObserver(() => {
      fit.fit()
      if (ws.readyState === WebSocket.OPEN) {
        const dims = fit.proposeDimensions()
        if (dims) {
          ws.send(JSON.stringify({ type: 'resize', rows: dims.rows, cols: dims.cols }))
        }
      }
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      ws.close()
      term.dispose()
    }
  }, [tab])

  return <div ref={containerRef} className="w-full h-full" />
}

export default function SshDrawer({ tabs, onCloseTab, onCloseAll }: SshDrawerProps) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || '')
  const [height, setHeight] = useState(300)
  const [minimized, setMinimized] = useState(false)
  const dragging = useRef(false)

  // Auto-select new tabs
  useEffect(() => {
    if (tabs.length > 0 && !tabs.find(t => t.id === activeTab)) {
      setActiveTab(tabs[tabs.length - 1].id)
    }
  }, [tabs, activeTab])

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    const startY = e.clientY
    const startHeight = height

    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = startY - e.clientY
      setHeight(Math.max(150, Math.min(window.innerHeight - 100, startHeight + delta)))
    }

    const onUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [height])

  if (tabs.length === 0) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-900 border-t border-zinc-700 flex flex-col"
      style={{ height: minimized ? 36 : height }}
    >
      {/* Resize handle */}
      {!minimized && (
        <div
          className="h-1 cursor-row-resize hover:bg-blue-500/50 transition-colors"
          onMouseDown={onResizeStart}
        />
      )}

      {/* Tab bar */}
      <div className="flex items-center bg-zinc-800 border-b border-zinc-700 px-2 h-[35px] shrink-0">
        <div className="flex-1 flex items-center gap-1 overflow-x-auto">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-t cursor-pointer shrink-0 ${
                activeTab === tab.id ? 'bg-zinc-900 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              onClick={() => { setActiveTab(tab.id); setMinimized(false) }}
            >
              <span>{tab.label}</span>
              <button
                onClick={e => { e.stopPropagation(); onCloseTab(tab.id) }}
                className="hover:text-red-400"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button onClick={() => setMinimized(!minimized)} className="text-zinc-500 hover:text-zinc-300 p-1">
            {minimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          </button>
          <button onClick={onCloseAll} className="text-zinc-500 hover:text-red-400 p-1">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Terminal area */}
      {!minimized && (
        <div className="flex-1 relative">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className="absolute inset-0 p-1"
              style={{ display: activeTab === tab.id ? 'block' : 'none' }}
            >
              <SshTerminal tab={tab} onDisconnect={() => onCloseTab(tab.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/SshDrawer.tsx
git commit -m "feat: add SshDrawer with tabbed xterm.js terminals"
```

---

### Task 11: Client — Update ConfigPanel with VM Linking, Power Controls, and SSH Button

**Files:**
- Modify: `src/components/ConfigPanel.tsx`

**Step 1: Add imports and new props**

Add to the imports at top:

```typescript
import type { Device, HealthCheck, HealthStatus, ApiPreset, ProxmoxVmLink } from '../types'
```

Add `Terminal` to the lucide-react import:

```typescript
import { X, Terminal, Play, Square, RotateCcw } from 'lucide-react'
```

Extend `ConfigPanelProps`:

```typescript
interface ConfigPanelProps {
  device: Device
  dispatch: React.Dispatch<Action>
  healthStatus?: HealthStatus
  allDevices: Device[]
  onSshConnect: (host: string, label: string) => void
  onVmAction: (action: 'start' | 'shutdown' | 'reboot', device: Device) => void
}
```

**Step 2: Add Proxmox VM linking section**

After the Health Check section and before the metrics display, add a "Proxmox VM" section. This shows when the device has a health check with apiPreset='proxmox' or when it already has a `proxmoxVm` linked.

Find Proxmox host devices from `allDevices` — devices that have `healthCheck.type === 'api'` and `healthCheck.apiPreset === 'proxmox'`.

Add a section with:
- A dropdown to select the Proxmox host device (from which host/token are derived)
- A VMID number input
- A dropdown for type (qemu/lxc)
- A node name input
- Power control buttons (Start / Shutdown / Reboot) — only visible when a VM is linked

**Step 3: Add SSH button**

Add an "SSH" button that calls `onSshConnect(device.ip, device.label)`. Show it when the device has an IP.

**Step 4: Full updated component**

Replace the entire ConfigPanel component with the updated version that includes:
- All existing fields (label, type, IP, notes, health check config, metrics)
- New Proxmox VM linking section
- Power control buttons with status-aware enabling
- SSH connect button

The key additions inside the component body, after the metrics section and before the delete button:

```tsx
{/* Proxmox VM Link */}
{(() => {
  const proxmoxHosts = allDevices.filter(d => d.healthCheck?.type === 'api' && d.healthCheck?.apiPreset === 'proxmox' && d.id !== device.id)
  const showVmSection = device.proxmoxVm || proxmoxHosts.length > 0

  if (!showVmSection) return null

  const vm = device.proxmoxVm

  return (
    <div className="pt-2 border-t border-zinc-700/50">
      <label className="block text-xs text-zinc-500 mb-2">Proxmox VM Link</label>
      <div className="space-y-2">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Proxmox Host</label>
          <select
            value={vm?.host || ''}
            onChange={e => {
              const hostDevice = allDevices.find(d => d.ip === e.target.value)
              if (e.target.value && hostDevice) {
                update({
                  proxmoxVm: {
                    host: e.target.value,
                    node: vm?.node || '',
                    vmid: vm?.vmid || 0,
                    type: vm?.type || 'qemu',
                  },
                  healthCheck: {
                    type: 'api',
                    apiPreset: 'proxmox',
                    apiToken: hostDevice.healthCheck?.apiToken,
                    interval: device.healthCheck?.interval || 60,
                  },
                })
              } else {
                update({ proxmoxVm: undefined })
              }
            }}
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
          >
            <option value="">None</option>
            {proxmoxHosts.map(h => (
              <option key={h.id} value={h.ip}>{h.label} ({h.ip})</option>
            ))}
          </select>
        </div>

        {vm && (
          <>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-zinc-500 mb-1">VMID</label>
                <input
                  type="number"
                  value={vm.vmid || ''}
                  onChange={e => update({ proxmoxVm: { ...vm, vmid: parseInt(e.target.value) || 0 } })}
                  placeholder="100"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div className="w-24">
                <label className="block text-xs text-zinc-500 mb-1">Type</label>
                <select
                  value={vm.type}
                  onChange={e => update({ proxmoxVm: { ...vm, type: e.target.value as 'qemu' | 'lxc' } })}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                >
                  <option value="qemu">VM</option>
                  <option value="lxc">LXC</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Node</label>
              <input
                type="text"
                value={vm.node}
                onChange={e => update({ proxmoxVm: { ...vm, node: e.target.value } })}
                placeholder="pve"
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>

            {/* Power controls */}
            {vm.vmid > 0 && vm.node && (
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Power</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => onVmAction('start', device)}
                    disabled={healthStatus?.metrics?.vmStatus === 'running'}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Play size={12} /> Start
                  </button>
                  <button
                    onClick={() => onVmAction('shutdown', device)}
                    disabled={healthStatus?.metrics?.vmStatus !== 'running'}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-red-900/30 text-red-400 hover:bg-red-900/50 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Square size={12} /> Shutdown
                  </button>
                  <button
                    onClick={() => onVmAction('reboot', device)}
                    disabled={healthStatus?.metrics?.vmStatus !== 'running'}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <RotateCcw size={12} /> Reboot
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
})()}

{/* SSH */}
{device.ip && (
  <div className="pt-2 border-t border-zinc-700/50">
    <button
      onClick={() => onSshConnect(device.ip, device.label)}
      className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-sm bg-zinc-700/50 text-zinc-300 rounded hover:bg-zinc-700 transition-colors"
    >
      <Terminal size={14} /> SSH Terminal
    </button>
  </div>
)}
```

Also add `diskPercent` to `METRIC_LABELS`:

```typescript
const METRIC_LABELS: Record<string, string> = {
  cpuPercent: 'CPU',
  ramPercent: 'RAM',
  diskPercent: 'Disk',
  uptime: 'Uptime',
  nodeCount: 'Nodes',
  version: 'Version',
  vmStatus: 'Status',
  containersRunning: 'Running',
  containersTotal: 'Total Containers',
  images: 'Images',
  deviceCount: 'Devices',
  onlineCount: 'Online',
}
```

And update `formatMetricValue` to handle `diskPercent`:

```typescript
function formatMetricValue(key: string, value: string | number | boolean): string {
  if (key === 'uptime' && typeof value === 'number') return formatUptime(value)
  if ((key === 'cpuPercent' || key === 'ramPercent' || key === 'diskPercent') && typeof value === 'number') return `${value}%`
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}
```

And update the color logic in the metrics display to include `diskPercent`:

```tsx
className={
  key === 'cpuPercent' || key === 'ramPercent' || key === 'diskPercent'
    ? (value as number) > 90 ? 'text-red-400' : (value as number) > 70 ? 'text-yellow-400' : 'text-emerald-400'
    : key === 'vmStatus'
    ? value === 'running' ? 'text-emerald-400' : 'text-red-400'
    : 'text-zinc-200'
}
```

**Step 5: Verify build**

Run: `cd /home/coder/projects/panel && npx tsc --noEmit`

**Step 6: Commit**

```bash
git add src/components/ConfigPanel.tsx
git commit -m "feat: add Proxmox VM linking, power controls, and SSH button to ConfigPanel"
```

---

### Task 12: Client — Wire Everything into App.tsx

**Files:**
- Modify: `src/App.tsx`

**Step 1: Add imports**

```typescript
import SshDrawer from './components/SshDrawer'
import SshConnectDialog from './components/SshConnectDialog'
import type { SshConnectParams } from './components/SshConnectDialog'
import VmDiscoveryModal from './components/VmDiscoveryModal'
import ConfirmModal from './components/ConfirmModal'
import { proxmoxVmAction } from './api'
```

**Step 2: Add state for SSH sessions, modals**

Inside `App()`, add:

```typescript
const [sshTabs, setSshTabs] = useState<Array<{ id: string; label: string; params: SshConnectParams }>>([])
const [sshConnectTarget, setSshConnectTarget] = useState<{ host: string; label: string } | null>(null)
const [showVmDiscovery, setShowVmDiscovery] = useState(false)
const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; confirmLabel: string; onConfirm: () => void } | null>(null)
```

**Step 3: Add SSH handlers**

```typescript
const handleSshConnect = useCallback((host: string, label: string) => {
  setSshConnectTarget({ host, label })
}, [])

const handleSshConnectSubmit = useCallback((params: SshConnectParams) => {
  setSshTabs(prev => [...prev, { id: generateId(), label: params.label, params }])
  setSshConnectTarget(null)
}, [])

const handleCloseSshTab = useCallback((id: string) => {
  setSshTabs(prev => prev.filter(t => t.id !== id))
}, [])

const handleCloseAllSsh = useCallback(() => {
  setSshTabs([])
}, [])
```

**Step 4: Add VM action handler with confirmation**

```typescript
const handleVmAction = useCallback((action: 'start' | 'shutdown' | 'reboot', device: import('./types').Device) => {
  if (!device.proxmoxVm) return

  const actionLabels = { start: 'Start', shutdown: 'Shut Down', reboot: 'Reboot' }
  const vm = device.proxmoxVm

  // Find the Proxmox host device to get the token
  const hostDevice = state.devices.find(d => d.ip === vm.host && d.healthCheck?.apiPreset === 'proxmox')
  const token = hostDevice?.healthCheck?.apiToken || device.healthCheck?.apiToken

  if (!token) {
    alert('No API token found. Configure the Proxmox host device with an API token first.')
    return
  }

  setConfirmAction({
    title: `${actionLabels[action]} VM`,
    message: `Are you sure you want to ${action} "${device.label}" (VMID ${vm.vmid})?`,
    confirmLabel: actionLabels[action],
    onConfirm: async () => {
      try {
        await proxmoxVmAction(action, {
          host: vm.host,
          node: vm.node,
          vmid: vm.vmid,
          type: vm.type,
          token,
        })
      } catch (err) {
        alert(`Failed: ${(err as Error).message}`)
      }
      setConfirmAction(null)
    },
  })
}, [state.devices])
```

**Step 5: Add VM discovery handler**

```typescript
const handleVmDiscoveryAdd = useCallback((vms: Array<{ vmid: number; name: string; type: 'qemu' | 'lxc'; node: string; host: string; token: string }>) => {
  const startX = state.viewBox.x + 200
  const startY = state.viewBox.y + 200

  vms.forEach((vm, i) => {
    const device: import('./types').Device = {
      id: generateId(),
      type: vm.type === 'lxc' ? 'container' : 'vmhost',
      label: vm.name,
      x: startX + (i % 5) * 120,
      y: startY + Math.floor(i / 5) * 120,
      ip: '',
      notes: `Proxmox ${vm.type.toUpperCase()} - VMID ${vm.vmid}`,
      proxmoxVm: {
        host: vm.host,
        node: vm.node,
        vmid: vm.vmid,
        type: vm.type,
      },
      healthCheck: {
        type: 'api',
        apiPreset: 'proxmox',
        apiToken: vm.token,
        interval: 60,
      },
    }
    dispatch({ type: 'ADD_DEVICE', device })
  })

  setShowVmDiscovery(false)
}, [dispatch, state.viewBox])
```

**Step 6: Update the Sidebar to include a "Discover VMs" button**

Pass `onDiscoverVms={() => setShowVmDiscovery(true)}` to Sidebar. Add the prop to Sidebar's interface and add a button in the topology management section.

In `src/components/Sidebar.tsx`, add to `SidebarProps`:

```typescript
onDiscoverVms: () => void
```

Add a button with `<Search size={16} />` icon in the toolbar row (the flex gap-1 div), with title "Discover Proxmox VMs".

**Step 7: Update ConfigPanel props in App.tsx render**

Change the ConfigPanel render line from:

```tsx
{selectedDevice && <ConfigPanel device={selectedDevice} dispatch={dispatch} healthStatus={healthStatuses.get(selectedDevice.id)} />}
```

To:

```tsx
{selectedDevice && (
  <ConfigPanel
    device={selectedDevice}
    dispatch={dispatch}
    healthStatus={healthStatuses.get(selectedDevice.id)}
    allDevices={state.devices}
    onSshConnect={handleSshConnect}
    onVmAction={handleVmAction}
  />
)}
```

**Step 8: Add modals and drawer to the JSX return**

After the closing `</div>` of the main layout, add (inside the return, as siblings or within the outer div):

Restructure the return to wrap everything:

```tsx
return (
  <div className="h-screen w-screen bg-zinc-900 text-zinc-100 flex flex-col overflow-hidden">
    <div className="flex flex-1 overflow-hidden" style={{ paddingBottom: sshTabs.length > 0 ? 0 : undefined }}>
      <Sidebar
        onDragStart={() => {}}
        topologies={topologies}
        currentTopologyId={currentTopologyId}
        onSwitchTopology={switchTopology}
        onNewTopology={createNewTopology}
        onDeleteTopology={deleteCurrentTopology}
        onExport={handleExport}
        onImport={handleImport}
        onDiscoverVms={() => setShowVmDiscovery(true)}
      />
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
      {selectedDevice && (
        <ConfigPanel
          device={selectedDevice}
          dispatch={dispatch}
          healthStatus={healthStatuses.get(selectedDevice.id)}
          allDevices={state.devices}
          onSshConnect={handleSshConnect}
          onVmAction={handleVmAction}
        />
      )}
      {selectedZone && <ZoneConfigPanel zone={selectedZone} dispatch={dispatch} />}
    </div>

    <SshDrawer tabs={sshTabs} onCloseTab={handleCloseSshTab} onCloseAll={handleCloseAllSsh} />

    {sshConnectTarget && (
      <SshConnectDialog
        defaultHost={sshConnectTarget.host}
        defaultLabel={sshConnectTarget.label}
        onConnect={handleSshConnectSubmit}
        onClose={() => setSshConnectTarget(null)}
      />
    )}

    {showVmDiscovery && (
      <VmDiscoveryModal
        onAdd={handleVmDiscoveryAdd}
        onClose={() => setShowVmDiscovery(false)}
      />
    )}

    {confirmAction && (
      <ConfirmModal
        title={confirmAction.title}
        message={confirmAction.message}
        confirmLabel={confirmAction.confirmLabel}
        onConfirm={confirmAction.onConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    )}
  </div>
)
```

**Step 9: Verify build**

Run: `cd /home/coder/projects/panel && npx tsc --noEmit`

**Step 10: Commit**

```bash
git add src/App.tsx src/components/Sidebar.tsx src/components/ConfigPanel.tsx
git commit -m "feat: wire up VM discovery, power controls, SSH terminal into app"
```

---

### Task 13: Update Sidebar with Discover VMs Button

**Files:**
- Modify: `src/components/Sidebar.tsx`

**Step 1: Add props and button**

Add `onDiscoverVms` to `SidebarProps`:

```typescript
interface SidebarProps {
  onDragStart: (type: DeviceType) => void
  topologies: { id: string; name: string }[]
  currentTopologyId: string | null
  onSwitchTopology: (id: string) => void
  onNewTopology: (name: string) => void
  onDeleteTopology: () => void
  onExport: () => void
  onImport: () => void
  onDiscoverVms: () => void
}
```

Destructure it in the function params. Add `Search` to the lucide imports. Add a button after the Import button in the toolbar:

```tsx
<button
  title="Discover Proxmox VMs"
  onClick={onDiscoverVms}
  className="p-1 rounded hover:bg-zinc-600 text-zinc-300"
>
  <Search size={16} />
</button>
```

**Step 2: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: add Discover VMs button to sidebar"
```

---

### Task 14: Add xterm CSS Import

**Files:**
- Modify: `src/index.css` or ensure xterm.css is imported

**Step 1: Verify xterm CSS loading**

The `SshDrawer.tsx` already imports `xterm/css/xterm.css`. Vite should handle this automatically. If the Tailwind setup strips it, add to `src/index.css`:

```css
@import 'xterm/css/xterm.css';
```

But first try building without this — Vite's CSS handling should work with the direct import in the component.

**Step 2: Build and test**

Run:
```bash
cd /home/coder/projects/panel && npm run build
```

Expected: successful build with no errors.

**Step 3: Commit if any changes**

```bash
git add -A
git commit -m "feat: ensure xterm CSS is loaded"
```

---

### Task 15: Final Build Verification and Push

**Step 1: Full build**

Run:
```bash
cd /home/coder/projects/panel && npm run build
```

Expected: clean build, no errors.

**Step 2: Commit any remaining fixes**

**Step 3: Push to remote**

```bash
git push origin master
```
