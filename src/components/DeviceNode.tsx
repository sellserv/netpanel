import { useCallback, useRef, useState } from 'react'
import type { Device, ViewBox, PortPosition } from '../types'
import { DEVICE_WIDTH, DEVICE_HEIGHT, PORT_RADIUS, getDeviceConfig } from '../constants'
import type { Action } from '../state'
import DeviceIcon from './DeviceIcon'

interface DeviceNodeProps {
  device: Device
  isSelected: boolean
  viewBox: ViewBox
  dispatch: React.Dispatch<Action>
  svgRef: React.RefObject<SVGSVGElement | null>
  onPortDragStart: (deviceId: string, port: PortPosition, x: number, y: number) => void
  onPortDragEnd: (targetDeviceId: string, targetPort: PortPosition) => void
  isDraggingConnection: boolean
}

export default function DeviceNode({ device, isSelected, viewBox, dispatch, svgRef, onPortDragStart, onPortDragEnd, isDraggingConnection }: DeviceNodeProps) {
  const config = getDeviceConfig(device.type)
  const dragging = useRef(false)
  const offset = useRef({ x: 0, y: 0 })
  const [hovered, setHovered] = useState(false)

  const screenToSVG = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return {
      x: viewBox.x + (clientX - rect.left) / rect.width * viewBox.width,
      y: viewBox.y + (clientY - rect.top) / rect.height * viewBox.height,
    }
  }, [viewBox, svgRef])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    dragging.current = true
    const pos = screenToSVG(e.clientX, e.clientY)
    offset.current = { x: pos.x - device.x, y: pos.y - device.y }
    dispatch({ type: 'SELECT_DEVICE', id: device.id })

    const handleMove = (me: MouseEvent) => {
      if (!dragging.current) return
      const p = screenToSVG(me.clientX, me.clientY)
      dispatch({ type: 'MOVE_DEVICE', id: device.id, x: p.x - offset.current.x, y: p.y - offset.current.y })
    }

    const handleUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [device.id, device.x, device.y, screenToSVG, dispatch])

  const getPortPos = (port: PortPosition) => {
    const cx = device.x + DEVICE_WIDTH / 2
    const cy = device.y + DEVICE_HEIGHT / 2
    switch (port) {
      case 'top': return { x: cx, y: device.y }
      case 'bottom': return { x: cx, y: device.y + DEVICE_HEIGHT }
      case 'left': return { x: device.x, y: cy }
      case 'right': return { x: device.x + DEVICE_WIDTH, y: cy }
    }
  }

  const iconSize = 28
  const iconX = device.x + (DEVICE_WIDTH - iconSize) / 2
  const iconY = device.y + 12

  return (
    <g
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: 'pointer' }}
    >
      <rect
        x={device.x}
        y={device.y}
        width={DEVICE_WIDTH}
        height={DEVICE_HEIGHT}
        rx={8}
        fill={`${config.color}15`}
        stroke={isSelected ? config.color : `${config.color}40`}
        strokeWidth={isSelected ? 2 : 1}
      />
      <DeviceIcon
        icon={config.icon}
        x={iconX}
        y={iconY}
        size={iconSize}
        color={config.color}
      />
      <text
        x={device.x + DEVICE_WIDTH / 2}
        y={device.y + DEVICE_HEIGHT - 8}
        textAnchor="middle"
        fill="#d4d4d8"
        fontSize="10"
        fontFamily="system-ui, sans-serif"
      >
        {device.label}
      </text>
      {device.ip && (
        <text
          x={device.x + DEVICE_WIDTH / 2}
          y={device.y + DEVICE_HEIGHT + 10}
          textAnchor="middle"
          fill="#71717a"
          fontSize="8"
          fontFamily="system-ui, sans-serif"
        >
          {device.ip}
        </text>
      )}
      {(hovered || isDraggingConnection) && (['top', 'right', 'bottom', 'left'] as PortPosition[]).map(port => {
        const pos = getPortPos(port)
        return (
          <circle
            key={port}
            cx={pos.x}
            cy={pos.y}
            r={PORT_RADIUS}
            fill="#3f3f46"
            stroke={config.color}
            strokeWidth={1.5}
            style={{ cursor: 'crosshair' }}
            onMouseDown={(e) => {
              e.stopPropagation()
              onPortDragStart(device.id, port, pos.x, pos.y)
            }}
            onMouseUp={(e) => {
              e.stopPropagation()
              onPortDragEnd(device.id, port)
            }}
          />
        )
      })}
    </g>
  )
}
