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
    if (!timers.has(key)) {
      startCheck(config)
    }
  }
}
