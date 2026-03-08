import type { DeviceTypeConfig } from './types'

export const DEVICE_WIDTH = 80
export const DEVICE_HEIGHT = 80
export const PORT_RADIUS = 6
export const GRID_SIZE = 20
export const GRID_MAJOR = 100

export const DEVICE_CONFIGS: DeviceTypeConfig[] = [
  { type: 'server',      label: 'Server',       icon: 'Server',       color: '#3b82f6' },
  { type: 'firewall',    label: 'Firewall',     icon: 'Shield',       color: '#ef4444' },
  { type: 'switch',      label: 'Switch',       icon: 'Network',      color: '#14b8a6' },
  { type: 'router',      label: 'Router',       icon: 'Router',       color: '#f97316' },
  { type: 'nas',         label: 'NAS/Storage',  icon: 'HardDrive',    color: '#a855f7' },
  { type: 'vmhost',      label: 'VM Host',      icon: 'Monitor',      color: '#6366f1' },
  { type: 'container',   label: 'Container',    icon: 'Box',          color: '#06b6d4' },
  { type: 'cloud',       label: 'Cloud/WAN',    icon: 'Cloud',        color: '#0ea5e9' },
  { type: 'vpn',         label: 'VPN Node',     icon: 'Lock',         color: '#10b981' },
  { type: 'accesspoint', label: 'Access Point', icon: 'Wifi',         color: '#f59e0b' },
  { type: 'workstation', label: 'Workstation',  icon: 'MonitorDot',   color: '#64748b' },
  { type: 'generic',     label: 'Generic',      icon: 'CircleDot',    color: '#6b7280' },
]

export const getDeviceConfig = (type: string): DeviceTypeConfig =>
  DEVICE_CONFIGS.find(c => c.type === type) ?? DEVICE_CONFIGS[DEVICE_CONFIGS.length - 1]

export const DEFAULT_VIEWBOX = { x: -500, y: -300, width: 1600, height: 900 }

export const generateId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
