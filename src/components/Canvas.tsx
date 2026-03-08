import { useRef, useCallback, useEffect, useState } from 'react'
import type { DeviceType, TopologyState, ViewBox, PortPosition } from '../types'
import type { Action } from '../state'
import { DEVICE_CONFIGS, DEVICE_WIDTH, DEVICE_HEIGHT, generateId } from '../constants'
import Grid from './Grid'
import DeviceNode from './DeviceNode'
import ZoneNode from './ZoneNode'
import ConnectionLine, { TempConnectionLine } from './ConnectionLine'

interface DragConnection {
  sourceDeviceId: string
  sourcePort: PortPosition
  sourceX: number
  sourceY: number
  mouseX: number
  mouseY: number
}

interface SelectionRect {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

interface CanvasProps {
  state: TopologyState
  dispatch: React.Dispatch<Action>
  children?: React.ReactNode
  dragConn: DragConnection | null
  onPortDragStart: (deviceId: string, port: PortPosition, x: number, y: number) => void
  onPortDragMove: (x: number, y: number) => void
  onPortDragEnd: (targetDeviceId: string, targetPort: PortPosition) => void
  onPortDragCancel: () => void
}

export default function Canvas({ state, dispatch, children, dragConn, onPortDragStart, onPortDragMove, onPortDragEnd, onPortDragCancel }: CanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const panStart = useRef<{ x: number; y: number; vb: ViewBox } | null>(null)
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null)

  const { viewBox } = state

  const screenToSVG = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    const x = viewBox.x + (clientX - rect.left) / rect.width * viewBox.width
    const y = viewBox.y + (clientY - rect.top) / rect.height * viewBox.height
    return { x, y }
  }, [viewBox])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const deviceType = e.dataTransfer.getData('deviceType')
    if (!deviceType) return
    const pos = screenToSVG(e.clientX, e.clientY)
    const config = DEVICE_CONFIGS.find(c => c.type === deviceType)
    dispatch({
      type: 'ADD_DEVICE',
      device: {
        id: generateId(),
        type: deviceType as DeviceType,
        label: config?.label ?? 'Device',
        x: pos.x - DEVICE_WIDTH / 2,
        y: pos.y - DEVICE_HEIGHT / 2,
        ip: '',
        notes: '',
      },
    })
  }, [screenToSVG, dispatch])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const scale = e.deltaY > 0 ? 1.1 : 0.9
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const mouseX = viewBox.x + (e.clientX - rect.left) / rect.width * viewBox.width
    const mouseY = viewBox.y + (e.clientY - rect.top) / rect.height * viewBox.height
    const newWidth = viewBox.width * scale
    const newHeight = viewBox.height * scale
    const newX = mouseX - (mouseX - viewBox.x) * scale
    const newY = mouseY - (mouseY - viewBox.y) * scale
    dispatch({ type: 'SET_VIEWBOX', viewBox: { x: newX, y: newY, width: newWidth, height: newHeight } })
  }, [viewBox, dispatch])

  const startSelectionRect = useCallback((e: React.MouseEvent) => {
    dispatch({ type: 'CLEAR_SELECTION' })
    const pos = screenToSVG(e.clientX, e.clientY)
    setSelectionRect({ startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y })
  }, [dispatch, screenToSVG])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const isGridClick = e.button === 0 && !spaceHeld && (e.target === svgRef.current || (e.target as SVGElement).closest('rect[fill="url(#grid)"]'))

    if (isGridClick) {
      startSelectionRect(e)
      return
    }

    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      e.preventDefault()
      setIsPanning(true)
      panStart.current = { x: e.clientX, y: e.clientY, vb: { ...viewBox } }
    }
  }, [spaceHeld, viewBox, startSelectionRect])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning && panStart.current) {
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const dx = (e.clientX - panStart.current.x) / rect.width * panStart.current.vb.width
      const dy = (e.clientY - panStart.current.y) / rect.height * panStart.current.vb.height
      dispatch({
        type: 'SET_VIEWBOX',
        viewBox: {
          ...panStart.current.vb,
          x: panStart.current.vb.x - dx,
          y: panStart.current.vb.y - dy,
        },
      })
    }
    if (dragConn) {
      const pos = screenToSVG(e.clientX, e.clientY)
      onPortDragMove(pos.x, pos.y)
    }
    if (selectionRect) {
      const pos = screenToSVG(e.clientX, e.clientY)
      setSelectionRect(prev => prev ? { ...prev, currentX: pos.x, currentY: pos.y } : null)
    }
  }, [isPanning, dispatch, dragConn, screenToSVG, onPortDragMove, selectionRect])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
    panStart.current = null
    if (dragConn) {
      onPortDragCancel()
    }
    if (selectionRect) {
      const rx = Math.min(selectionRect.startX, selectionRect.currentX)
      const ry = Math.min(selectionRect.startY, selectionRect.currentY)
      const rw = Math.abs(selectionRect.currentX - selectionRect.startX)
      const rh = Math.abs(selectionRect.currentY - selectionRect.startY)

      if (rw > 20 && rh > 20) {
        const enclosed = state.devices.filter(d => {
          const dcx = d.x + DEVICE_WIDTH / 2
          const dcy = d.y + DEVICE_HEIGHT / 2
          return dcx >= rx && dcx <= rx + rw && dcy >= ry && dcy <= ry + rh
        })

        const padding = 20
        const zoneId = generateId()
        const zone = {
          id: zoneId,
          label: 'New Zone',
          color: '#3b82f6',
          x: rx - padding,
          y: ry - padding,
          width: rw + padding * 2,
          height: rh + padding * 2,
          deviceIds: enclosed.map(d => d.id),
        }
        dispatch({ type: 'ADD_ZONE', zone })
        dispatch({ type: 'SELECT_ZONE', id: zoneId })
      }

      setSelectionRect(null)
    }
  }, [dragConn, onPortDragCancel, selectionRect, state.devices, dispatch])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        setSpaceHeld(true)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const selRect = selectionRect ? {
    x: Math.min(selectionRect.startX, selectionRect.currentX),
    y: Math.min(selectionRect.startY, selectionRect.currentY),
    width: Math.abs(selectionRect.currentX - selectionRect.startX),
    height: Math.abs(selectionRect.currentY - selectionRect.startY),
  } : null

  return (
    <svg
      ref={svgRef}
      className="flex-1 h-full"
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onContextMenu={(e) => e.preventDefault()}
      style={{ cursor: isPanning || spaceHeld ? 'grabbing' : selectionRect ? 'crosshair' : 'default' }}
    >
      <Grid />
      <rect
        x={viewBox.x - viewBox.width}
        y={viewBox.y - viewBox.height}
        width={viewBox.width * 3}
        height={viewBox.height * 3}
        fill="url(#grid)"
        onMouseDown={(e) => {
          if (e.button === 0 && !spaceHeld) {
            startSelectionRect(e)
          }
        }}
      />
      {state.zones.map(zone => (
        <ZoneNode
          key={zone.id}
          zone={zone}
          isSelected={state.selectionType === 'zone' && state.selectedIds.includes(zone.id)}
          viewBox={viewBox}
          dispatch={dispatch}
          svgRef={svgRef}
        />
      ))}
      {state.connections.map(conn => (
        <ConnectionLine key={conn.id} connection={conn} devices={state.devices} />
      ))}
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
        />
      ))}
      {dragConn && (
        <TempConnectionLine
          from={{ x: dragConn.sourceX, y: dragConn.sourceY, port: dragConn.sourcePort }}
          to={{ x: dragConn.mouseX, y: dragConn.mouseY }}
        />
      )}
      {selRect && (
        <rect
          x={selRect.x}
          y={selRect.y}
          width={selRect.width}
          height={selRect.height}
          fill="rgba(59,130,246,0.08)"
          stroke="#3b82f6"
          strokeWidth={1}
          strokeDasharray="4 2"
          style={{ pointerEvents: 'none' }}
        />
      )}
      {children}
    </svg>
  )
}
