import net from 'net'
import { exec } from 'child_process'
import { upsertHealthResult } from './db.js'

export type ApiPreset = 'proxmox' | 'truenas' | 'tailscale' | 'docker'

interface ProxmoxVmInfo {
  host: string
  node: string
  vmid: number
  type: 'qemu' | 'lxc'
}

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

export interface CheckResult {
  deviceId: string
  topologyId: string
  status: 'up' | 'down'
  latency?: number
  error?: string
  metrics?: Record<string, string | number | boolean>
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

interface PresetConfig {
  defaultPath: (ip: string) => string
  buildHeaders: (token?: string) => Record<string, string>
  parseMetrics: (json: unknown) => Record<string, string | number | boolean>
  deriveStatus: (metrics: Record<string, string | number | boolean>) => 'up' | 'down'
}

const API_PRESETS: Record<ApiPreset, PresetConfig> = {
  proxmox: {
    defaultPath: (ip) => `https://${ip}:8006/api2/json/nodes`,
    buildHeaders: (token) => {
      const h: Record<string, string> = {}
      if (token) h['Authorization'] = `PVEAPIToken=${token}`
      return h
    },
    parseMetrics: (json: unknown): Record<string, string | number | boolean> => {
      const data = (json as { data?: Array<{ cpu?: number; maxmem?: number; mem?: number; uptime?: number; status?: string }> })?.data
      if (!Array.isArray(data)) return { error: 'unexpected response' }
      const nodeCount = data.length
      const node = data[0] || {}
      const cpuPct = typeof node.cpu === 'number' ? Math.round(node.cpu * 10000) / 100 : 0
      const ramPct = (node.maxmem && node.mem) ? Math.round((node.mem / node.maxmem) * 10000) / 100 : 0
      const uptime = typeof node.uptime === 'number' ? node.uptime : 0
      return { cpuPercent: cpuPct, ramPercent: ramPct, uptime, nodeCount }
    },
    deriveStatus: () => 'up',
  },
  truenas: {
    defaultPath: (ip) => `http://${ip}/api/v2.0/system/info`,
    buildHeaders: (token) => {
      const h: Record<string, string> = {}
      if (token) h['Authorization'] = `Bearer ${token}`
      return h
    },
    parseMetrics: (json: unknown) => {
      const data = json as { version?: string; uptime_seconds?: number; uptime?: string }
      return {
        version: data.version || 'unknown',
        uptime: typeof data.uptime_seconds === 'number' ? data.uptime_seconds : 0,
      }
    },
    deriveStatus: () => 'up',
  },
  tailscale: {
    defaultPath: () => `https://api.tailscale.com/api/v2/tailnet/-/devices`,
    buildHeaders: (token) => {
      const h: Record<string, string> = {}
      if (token) h['Authorization'] = `Bearer ${token}`
      return h
    },
    parseMetrics: (json: unknown) => {
      const devices = (json as { devices?: Array<{ id: string }> })?.devices
      if (!Array.isArray(devices)) return { deviceCount: 0, onlineCount: 0 }
      return { deviceCount: devices.length, onlineCount: devices.length }
    },
    deriveStatus: () => 'up',
  },
  docker: {
    defaultPath: (ip) => `http://${ip}:2375/v1.43/info`,
    buildHeaders: () => ({}),
    parseMetrics: (json: unknown) => {
      const data = json as { ContainersRunning?: number; Containers?: number; Images?: number; ServerVersion?: string }
      return {
        containersRunning: data.ContainersRunning ?? 0,
        containersTotal: data.Containers ?? 0,
        images: data.Images ?? 0,
        version: data.ServerVersion || 'unknown',
      }
    },
    deriveStatus: (metrics) => (typeof metrics.containersRunning === 'number' ? 'up' : 'down'),
  },
}

async function checkApi(target: string, preset: ApiPreset, token?: string): Promise<{ status: 'up' | 'down'; latency: number; error?: string; metrics?: Record<string, string | number | boolean> }> {
  const presetConfig = API_PRESETS[preset]
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const headers = presetConfig.buildHeaders(token)
    const res = await fetch(target, {
      signal: controller.signal,
      headers,
      ...(target.startsWith('https') ? {} : {}),
    })
    clearTimeout(timeout)
    const latency = Date.now() - start
    if (!res.ok) {
      return { status: 'down', latency, error: `HTTP ${res.status}` }
    }
    const json = await res.json()
    const metrics = presetConfig.parseMetrics(json)
    const status = presetConfig.deriveStatus(metrics)
    return { status, latency, metrics }
  } catch (err) {
    return { status: 'down', latency: Date.now() - start, error: (err as Error).message }
  }
}

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

    const json = await res.json() as { data: { status?: string; cpu?: number; maxmem?: number; mem?: number; uptime?: number; maxdisk?: number; disk?: number } }
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

async function runCheck(config: CheckConfig) {
  let result: { status: 'up' | 'down'; latency: number; error?: string; metrics?: Record<string, string | number | boolean> }

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

  const checkedAt = new Date().toISOString()

  upsertHealthResult.run(
    config.deviceId,
    config.topologyId,
    result.status,
    result.latency ?? null,
    result.error ?? null,
    result.metrics ? JSON.stringify(result.metrics) : null
  )

  const checkResult: CheckResult = {
    deviceId: config.deviceId,
    topologyId: config.topologyId,
    status: result.status,
    latency: result.latency,
    error: result.error,
    metrics: result.metrics,
    checkedAt,
  }

  onResult(checkResult)
}

export function startCheck(config: CheckConfig) {
  const key = timerKey(config.topologyId, config.deviceId)
  stopCheck(config.topologyId, config.deviceId)

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
    type: 'http' | 'tcp' | 'ping' | 'api'
    target?: string
    interval: number
    apiPreset?: ApiPreset
    apiToken?: string
  }
  proxmoxVm?: ProxmoxVmInfo
}

export function syncChecks(topologyId: string, devices: DeviceWithCheck[]) {
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

  for (const device of devices) {
    if (!device.healthCheck) continue
    let target = device.healthCheck.target || device.ip
    if (!target) continue

    // For API presets, auto-fill the target URL if not explicitly set
    if (device.healthCheck.type === 'api' && device.healthCheck.apiPreset && !device.healthCheck.target) {
      target = API_PRESETS[device.healthCheck.apiPreset].defaultPath(device.ip)
    }

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

    const key = timerKey(topologyId, device.id)
    if (!timers.has(key)) {
      startCheck(config)
    }
  }
}
