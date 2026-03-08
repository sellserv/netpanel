export type PortPosition = 'top' | 'right' | 'bottom' | 'left'

export type DeviceType =
  | 'server'
  | 'firewall'
  | 'switch'
  | 'router'
  | 'nas'
  | 'vmhost'
  | 'container'
  | 'cloud'
  | 'vpn'
  | 'accesspoint'
  | 'workstation'
  | 'generic'

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

export interface Connection {
  id: string
  sourceDeviceId: string
  targetDeviceId: string
  sourcePort: PortPosition
  targetPort: PortPosition
}

export interface Zone {
  id: string
  label: string
  color: string
  x: number
  y: number
  width: number
  height: number
  deviceIds: string[]
}

export interface ViewBox {
  x: number
  y: number
  width: number
  height: number
}

export type SelectionType = 'device' | 'zone'

export interface TopologyState {
  devices: Device[]
  connections: Connection[]
  zones: Zone[]
  selectedIds: string[]
  selectionType: SelectionType | null
  viewBox: ViewBox
}

export interface DeviceTypeConfig {
  type: DeviceType
  label: string
  icon: string
  color: string
}

export type HealthCheckType = 'http' | 'tcp' | 'ping' | 'api'

export type ApiPreset = 'proxmox' | 'truenas' | 'tailscale' | 'docker'

export interface HealthCheck {
  type: HealthCheckType
  target?: string
  interval: number  // seconds: 30, 60, 300, 600
  apiPreset?: ApiPreset
  apiToken?: string
}

export interface HealthStatus {
  deviceId: string
  status: 'up' | 'down' | 'unknown'
  latency?: number
  error?: string
  checkedAt: string
  metrics?: Record<string, string | number | boolean>
}

export interface ProxmoxVmLink {
  host: string
  node: string
  vmid: number
  type: 'qemu' | 'lxc'
}
