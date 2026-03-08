import { useRef, useCallback, useEffect, useState } from 'react'
import { DeviceType, TopologyState, ViewBox, PortPosition } from '../types'
import { Action } from '../state'
import { DEVICE_CONFIGS, DEVICE_WIDTH, DEVICE_HEIGHT } from '../constants'
import Grid from './Grid'
import DeviceNode from './DeviceNode'
import ConnectionLine, { TempConnectionLine } from './ConnectionLine'

interface DragConnection {
  sourceDeviceId: string
  sourcePort: PortPosition
  sourceX: number
  sourceY: number
  mouseX: number
  mouseY: number
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
        id: crypto.randomUUID(),
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

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 && !spaceHeld && (e.target === svgRef.current || (e.target as SVGElement).closest('rect[fill="url(#grid)"]'))) {
      dispatch({ type: 'SELECT_DEVICE', id: null })
    }
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      e.preventDefault()
      setIsPanning(true)
      panStart.current = { x: e.clientX, y: e.clientY, vb: { ...viewBox } }
    }
  }, [spaceHeld, viewBox, dispatch])

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
  }, [isPanning, dispatch, dragConn, screenToSVG, onPortDragMove])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
    panStart.current = null
    if (dragConn) {
      onPortDragCancel()
    }
  }, [dragConn, onPortDragCancel])

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
      style={{ cursor: isPanning || spaceHeld ? 'grabbing' : 'default' }}
    >
      <Grid />
      <rect
        x={viewBox.x - viewBox.width}
        y={viewBox.y - viewBox.height}
        width={viewBox.width * 3}
        height={viewBox.height * 3}
        fill="url(#grid)"
        onMouseDown={(e) => {
          if (e.button === 0) dispatch({ type: 'SELECT_DEVICE', id: null })
        }}
      />
      {state.connections.map(conn => (
        <ConnectionLine key={conn.id} connection={conn} devices={state.devices} />
      ))}
      {state.devices.map(device => (
        <DeviceNode
          key={device.id}
          device={device}
          isSelected={device.id === state.selectedDeviceId}
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
      {children}
    </svg>
  )
}
