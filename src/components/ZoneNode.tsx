import { useCallback, useRef } from 'react'
import type { Zone } from '../types'
import type { Action } from '../state'

const MIN_SIZE = 60
const HANDLE_SIZE = 8

interface ZoneNodeProps {
  zone: Zone
  isSelected: boolean
  dispatch: React.Dispatch<Action>
  svgRef: React.RefObject<SVGSVGElement | null>
}

type Corner = 'tl' | 'tr' | 'bl' | 'br'

export default function ZoneNode({ zone, isSelected, dispatch, svgRef }: ZoneNodeProps) {
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })

  const screenToSVG = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const svgPt = pt.matrixTransform(ctm.inverse())
    return { x: svgPt.x, y: svgPt.y }
  }, [svgRef])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    dragging.current = true
    const pos = screenToSVG(e.clientX, e.clientY)
    dragStart.current = { x: pos.x, y: pos.y }
    dispatch({ type: 'SELECT_ZONE', id: zone.id })

    const handleMove = (me: MouseEvent) => {
      if (!dragging.current) return
      const p = screenToSVG(me.clientX, me.clientY)
      const dx = p.x - dragStart.current.x
      const dy = p.y - dragStart.current.y
      dragStart.current = { x: p.x, y: p.y }
      dispatch({ type: 'MOVE_ZONE', id: zone.id, dx, dy })
    }

    const handleUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [zone.id, screenToSVG, dispatch])

  const handleResizeStart = useCallback((e: React.MouseEvent, corner: Corner) => {
    e.stopPropagation()
    e.preventDefault()
    const startPos = screenToSVG(e.clientX, e.clientY)
    const startZone = { x: zone.x, y: zone.y, width: zone.width, height: zone.height }
    dispatch({ type: 'SELECT_ZONE', id: zone.id })

    const handleMove = (me: MouseEvent) => {
      const p = screenToSVG(me.clientX, me.clientY)
      const dx = p.x - startPos.x
      const dy = p.y - startPos.y
      let { x, y, width, height } = startZone

      if (corner === 'tl') {
        x += dx; y += dy; width -= dx; height -= dy
      } else if (corner === 'tr') {
        y += dy; width += dx; height -= dy
      } else if (corner === 'bl') {
        x += dx; width -= dx; height += dy
      } else {
        width += dx; height += dy
      }

      if (width < MIN_SIZE) { if (corner === 'tl' || corner === 'bl') x = startZone.x + startZone.width - MIN_SIZE; width = MIN_SIZE }
      if (height < MIN_SIZE) { if (corner === 'tl' || corner === 'tr') y = startZone.y + startZone.height - MIN_SIZE; height = MIN_SIZE }

      dispatch({ type: 'RESIZE_ZONE', id: zone.id, x, y, width, height })
    }

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [zone, screenToSVG, dispatch])

  const corners: { key: Corner; cx: number; cy: number; cursor: string }[] = [
    { key: 'tl', cx: zone.x, cy: zone.y, cursor: 'nwse-resize' },
    { key: 'tr', cx: zone.x + zone.width, cy: zone.y, cursor: 'nesw-resize' },
    { key: 'bl', cx: zone.x, cy: zone.y + zone.height, cursor: 'nesw-resize' },
    { key: 'br', cx: zone.x + zone.width, cy: zone.y + zone.height, cursor: 'nwse-resize' },
  ]

  return (
    <g>
      <rect
        x={zone.x}
        y={zone.y}
        width={zone.width}
        height={zone.height}
        rx={12}
        fill={`${zone.color}12`}
        stroke={isSelected ? zone.color : `${zone.color}30`}
        strokeWidth={isSelected ? 2 : 1}
        strokeDasharray={isSelected ? 'none' : '6 3'}
        style={{ cursor: 'move' }}
        onMouseDown={handleMouseDown}
      />
      <text
        x={zone.x + 10}
        y={zone.y + 18}
        fill={`${zone.color}90`}
        fontSize="12"
        fontFamily="system-ui, sans-serif"
        fontWeight="600"
        style={{ pointerEvents: 'none' }}
      >
        {zone.label}
      </text>
      {isSelected && corners.map(c => (
        <rect
          key={c.key}
          x={c.cx - HANDLE_SIZE / 2}
          y={c.cy - HANDLE_SIZE / 2}
          width={HANDLE_SIZE}
          height={HANDLE_SIZE}
          rx={2}
          fill={zone.color}
          style={{ cursor: c.cursor }}
          onMouseDown={(e) => handleResizeStart(e, c.key)}
        />
      ))}
    </g>
  )
}
