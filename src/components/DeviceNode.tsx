import { useCallback, useRef } from 'react'
import { Device, ViewBox } from '../types'
import { DEVICE_WIDTH, DEVICE_HEIGHT, getDeviceConfig } from '../constants'
import { Action } from '../state'
import DeviceIcon from './DeviceIcon'

interface DeviceNodeProps {
  device: Device
  isSelected: boolean
  viewBox: ViewBox
  dispatch: React.Dispatch<Action>
  svgRef: React.RefObject<SVGSVGElement | null>
}

export default function DeviceNode({ device, isSelected, viewBox, dispatch, svgRef }: DeviceNodeProps) {
  const config = getDeviceConfig(device.type)
  const dragging = useRef(false)
  const offset = useRef({ x: 0, y: 0 })

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

  const iconSize = 28
  const iconX = device.x + (DEVICE_WIDTH - iconSize) / 2
  const iconY = device.y + 12

  return (
    <g onMouseDown={handleMouseDown} style={{ cursor: 'pointer' }}>
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
    </g>
  )
}
