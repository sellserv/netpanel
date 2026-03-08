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
}

export interface Connection {
  id: string
  sourceDeviceId: string
  targetDeviceId: string
  sourcePort: PortPosition
  targetPort: PortPosition
}

export interface ViewBox {
  x: number
  y: number
  width: number
  height: number
}

export interface TopologyState {
  devices: Device[]
  connections: Connection[]
  selectedDeviceId: string | null
  viewBox: ViewBox
}

export interface DeviceTypeConfig {
  type: DeviceType
  label: string
  icon: string
  color: string
}
