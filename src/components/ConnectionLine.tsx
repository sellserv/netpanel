import type { Device, Connection, PortPosition } from '../types'
import { DEVICE_WIDTH, DEVICE_HEIGHT } from '../constants'

export const getPortPosition = (device: Device, port: PortPosition) => {
  const cx = device.x + DEVICE_WIDTH / 2
  const cy = device.y + DEVICE_HEIGHT / 2
  switch (port) {
    case 'top': return { x: cx, y: device.y }
    case 'bottom': return { x: cx, y: device.y + DEVICE_HEIGHT }
    case 'left': return { x: device.x, y: cy }
    case 'right': return { x: device.x + DEVICE_WIDTH, y: cy }
  }
}

const controlOffset = 80

function bezierPath(x1: number, y1: number, p1: PortPosition, x2: number, y2: number, p2: PortPosition) {
  const dx: Record<PortPosition, number> = { top: 0, bottom: 0, left: -controlOffset, right: controlOffset }
  const dy: Record<PortPosition, number> = { top: -controlOffset, bottom: controlOffset, left: 0, right: 0 }
  const cx1 = x1 + dx[p1]
  const cy1 = y1 + dy[p1]
  const cx2 = x2 + dx[p2]
  const cy2 = y2 + dy[p2]
  return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`
}

interface ConnectionLineProps {
  connection: Connection
  devices: Device[]
}

export default function ConnectionLine({ connection, devices }: ConnectionLineProps) {
  const source = devices.find(d => d.id === connection.sourceDeviceId)
  const target = devices.find(d => d.id === connection.targetDeviceId)
  if (!source || !target) return null

  const p1 = getPortPosition(source, connection.sourcePort)
  const p2 = getPortPosition(target, connection.targetPort)
  const d = bezierPath(p1.x, p1.y, connection.sourcePort, p2.x, p2.y, connection.targetPort)

  return (
    <path
      d={d}
      fill="none"
      stroke="#52525b"
      strokeWidth={2}
      strokeLinecap="round"
    />
  )
}

interface TempConnectionLineProps {
  from: { x: number; y: number; port: PortPosition }
  to: { x: number; y: number }
}

export function TempConnectionLine({ from, to }: TempConnectionLineProps) {
  const dx: Record<PortPosition, number> = { top: 0, bottom: 0, left: -controlOffset, right: controlOffset }
  const dy: Record<PortPosition, number> = { top: -controlOffset, bottom: controlOffset, left: 0, right: 0 }
  const d = `M ${from.x} ${from.y} C ${from.x + dx[from.port]} ${from.y + dy[from.port]}, ${to.x} ${to.y}, ${to.x} ${to.y}`
  return (
    <path
      d={d}
      fill="none"
      stroke="#52525b"
      strokeWidth={2}
      strokeDasharray="6 4"
      strokeLinecap="round"
    />
  )
}
