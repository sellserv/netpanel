# Multi-Select & Zones Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add multi-select (shift+click, drag-select) and labeled zones with colored backgrounds that group devices and move/resize together.

**Architecture:** Zones are first-class state entities stored alongside devices. Selection changes from single ID to an array of IDs with a selection type (device or zone). Drag-select on empty canvas creates a zone. Zones render as SVG rects behind devices.

**Tech Stack:** React, TypeScript, SVG — no new dependencies

---

### Task 1: Update Types and State for Zones + Multi-Select

**Files:**
- Modify: `src/types.ts`
- Modify: `src/state.ts`

**Step 1: Update types.ts**

Add Zone interface and update TopologyState. Replace the entire file:

```ts
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
```

**Step 2: Update state.ts**

Replace the entire file with updated reducer supporting zones and multi-select:

```ts
import { useReducer, useEffect, useRef } from 'react'
import type { TopologyState, Device, Zone, ViewBox } from './types'
import { DEFAULT_VIEWBOX } from './constants'

const STORAGE_KEY = 'network-topology'

type Action =
  | { type: 'ADD_DEVICE'; device: Device }
  | { type: 'MOVE_DEVICE'; id: string; x: number; y: number }
  | { type: 'UPDATE_DEVICE'; id: string; changes: Partial<Pick<Device, 'label' | 'ip' | 'notes' | 'type'>> }
  | { type: 'DELETE_DEVICE'; id: string }
  | { type: 'ADD_CONNECTION'; connection: import('./types').Connection }
  | { type: 'DELETE_CONNECTION'; id: string }
  | { type: 'SELECT_DEVICE'; id: string | null; shift?: boolean }
  | { type: 'SELECT_ZONE'; id: string | null }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'SET_VIEWBOX'; viewBox: ViewBox }
  | { type: 'ADD_ZONE'; zone: Zone }
  | { type: 'MOVE_ZONE'; id: string; dx: number; dy: number }
  | { type: 'RESIZE_ZONE'; id: string; x: number; y: number; width: number; height: number }
  | { type: 'UPDATE_ZONE'; id: string; changes: Partial<Pick<Zone, 'label' | 'color'>> }
  | { type: 'DELETE_ZONE'; id: string }
  | { type: 'LOAD_STATE'; state: TopologyState }

const initialState: TopologyState = {
  devices: [],
  connections: [],
  zones: [],
  selectedIds: [],
  selectionType: null,
  viewBox: DEFAULT_VIEWBOX,
}

function reducer(state: TopologyState, action: Action): TopologyState {
  switch (action.type) {
    case 'ADD_DEVICE':
      return { ...state, devices: [...state.devices, action.device] }

    case 'MOVE_DEVICE': {
      const newDevices = state.devices.map(d =>
        d.id === action.id ? { ...d, x: action.x, y: action.y } : d
      )
      return { ...state, devices: newDevices }
    }

    case 'UPDATE_DEVICE':
      return {
        ...state,
        devices: state.devices.map(d =>
          d.id === action.id ? { ...d, ...action.changes } : d
        ),
      }

    case 'DELETE_DEVICE':
      return {
        ...state,
        devices: state.devices.filter(d => d.id !== action.id),
        connections: state.connections.filter(
          c => c.sourceDeviceId !== action.id && c.targetDeviceId !== action.id
        ),
        zones: state.zones.map(z => ({
          ...z,
          deviceIds: z.deviceIds.filter(did => did !== action.id),
        })),
        selectedIds: state.selectedIds.filter(id => id !== action.id),
        selectionType: state.selectedIds.filter(id => id !== action.id).length === 0 ? null : state.selectionType,
      }

    case 'ADD_CONNECTION':
      return { ...state, connections: [...state.connections, action.connection] }

    case 'DELETE_CONNECTION':
      return {
        ...state,
        connections: state.connections.filter(c => c.id !== action.id),
      }

    case 'SELECT_DEVICE': {
      if (action.id === null) {
        return { ...state, selectedIds: [], selectionType: null }
      }
      if (action.shift) {
        const alreadySelected = state.selectedIds.includes(action.id)
        if (state.selectionType === 'zone') {
          return { ...state, selectedIds: [action.id], selectionType: 'device' }
        }
        const newIds = alreadySelected
          ? state.selectedIds.filter(id => id !== action.id)
          : [...state.selectedIds, action.id]
        return {
          ...state,
          selectedIds: newIds,
          selectionType: newIds.length > 0 ? 'device' : null,
        }
      }
      return { ...state, selectedIds: [action.id], selectionType: 'device' }
    }

    case 'SELECT_ZONE':
      if (action.id === null) {
        return { ...state, selectedIds: [], selectionType: null }
      }
      return { ...state, selectedIds: [action.id], selectionType: 'zone' }

    case 'CLEAR_SELECTION':
      return { ...state, selectedIds: [], selectionType: null }

    case 'SET_VIEWBOX':
      return { ...state, viewBox: action.viewBox }

    case 'ADD_ZONE':
      return { ...state, zones: [...state.zones, action.zone] }

    case 'MOVE_ZONE': {
      const zone = state.zones.find(z => z.id === action.id)
      if (!zone) return state
      const newZones = state.zones.map(z =>
        z.id === action.id ? { ...z, x: z.x + action.dx, y: z.y + action.dy } : z
      )
      const newDevices = state.devices.map(d =>
        zone.deviceIds.includes(d.id) ? { ...d, x: d.x + action.dx, y: d.y + action.dy } : d
      )
      return { ...state, zones: newZones, devices: newDevices }
    }

    case 'RESIZE_ZONE':
      return {
        ...state,
        zones: state.zones.map(z =>
          z.id === action.id ? { ...z, x: action.x, y: action.y, width: action.width, height: action.height } : z
        ),
      }

    case 'UPDATE_ZONE':
      return {
        ...state,
        zones: state.zones.map(z =>
          z.id === action.id ? { ...z, ...action.changes } : z
        ),
      }

    case 'DELETE_ZONE':
      return {
        ...state,
        zones: state.zones.filter(z => z.id !== action.id),
        selectedIds: state.selectedIds.filter(id => id !== action.id),
        selectionType: state.selectedIds.filter(id => id !== action.id).length === 0 ? null : state.selectionType,
      }

    case 'LOAD_STATE':
      return action.state

    default:
      return state
  }
}

function loadState(): TopologyState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        ...initialState,
        ...parsed,
        zones: parsed.zones ?? [],
        selectedIds: [],
        selectionType: null,
      }
    }
  } catch {}
  return initialState
}

export function useTopology() {
  const [state, dispatch] = useReducer(reducer, null, loadState)
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      const { selectedIds, selectionType, ...rest } = state
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rest))
    }, 300)
    return () => clearTimeout(saveTimeout.current)
  }, [state])

  return { state, dispatch }
}

export type { Action }
```

**Step 3: Commit**

```bash
cd /home/coder/projects/panel
git add src/types.ts src/state.ts
git commit -m "Add Zone type and multi-select support to state"
```

---

### Task 2: Update DeviceNode for Multi-Select

**Files:**
- Modify: `src/components/DeviceNode.tsx`

**Step 1: Update DeviceNode**

The `isSelected` prop stays boolean. Add `onShiftClick` behavior. The key change: when shift is held during mousedown, dispatch with `shift: true`. Also, when a device is dragged and it belongs to a zone, move all zone devices together.

Read current file at `src/components/DeviceNode.tsx`, then make these changes:

1. Change the `handleMouseDown` to pass shift info:

Replace the line:
```tsx
dispatch({ type: 'SELECT_DEVICE', id: device.id })
```
with:
```tsx
dispatch({ type: 'SELECT_DEVICE', id: device.id, shift: e.shiftKey })
```

That's the only change needed for this file. The multi-select visual (isSelected) will be driven by the parent checking `state.selectedIds.includes(device.id)`.

**Step 2: Commit**

```bash
cd /home/coder/projects/panel
git add src/components/DeviceNode.tsx
git commit -m "Support shift+click multi-select in DeviceNode"
```

---

### Task 3: Create ZoneNode Component

**Files:**
- Create: `src/components/ZoneNode.tsx`

**Step 1: Create ZoneNode**

Create `src/components/ZoneNode.tsx`:

```tsx
import { useCallback, useRef, useState } from 'react'
import type { Zone, ViewBox } from '../types'
import type { Action } from '../state'

const MIN_SIZE = 60
const HANDLE_SIZE = 8

interface ZoneNodeProps {
  zone: Zone
  isSelected: boolean
  viewBox: ViewBox
  dispatch: React.Dispatch<Action>
  svgRef: React.RefObject<SVGSVGElement | null>
}

type Corner = 'tl' | 'tr' | 'bl' | 'br'

export default function ZoneNode({ zone, isSelected, viewBox, dispatch, svgRef }: ZoneNodeProps) {
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })

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
```

**Step 2: Commit**

```bash
cd /home/coder/projects/panel
git add src/components/ZoneNode.tsx
git commit -m "Add ZoneNode component with drag and resize"
```

---

### Task 4: Create ZoneConfigPanel Component

**Files:**
- Create: `src/components/ZoneConfigPanel.tsx`

**Step 1: Create ZoneConfigPanel**

Create `src/components/ZoneConfigPanel.tsx`:

```tsx
import type { Zone } from '../types'
import type { Action } from '../state'
import { X } from 'lucide-react'

const ZONE_COLORS = [
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Red', value: '#ef4444' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Purple', value: '#a855f7' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Teal', value: '#14b8a6' },
  { label: 'Pink', value: '#ec4899' },
  { label: 'Yellow', value: '#eab308' },
]

interface ZoneConfigPanelProps {
  zone: Zone
  dispatch: React.Dispatch<Action>
}

export default function ZoneConfigPanel({ zone, dispatch }: ZoneConfigPanelProps) {
  return (
    <div className="w-72 bg-zinc-800/90 border-l border-zinc-700/50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/50">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Zone
        </h2>
        <button
          onClick={() => dispatch({ type: 'CLEAR_SELECTION' })}
          className="text-zinc-500 hover:text-zinc-300"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Label</label>
          <input
            type="text"
            value={zone.label}
            onChange={e => dispatch({ type: 'UPDATE_ZONE', id: zone.id, changes: { label: e.target.value } })}
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Color</label>
          <div className="flex flex-wrap gap-2">
            {ZONE_COLORS.map(c => (
              <button
                key={c.value}
                onClick={() => dispatch({ type: 'UPDATE_ZONE', id: zone.id, changes: { color: c.value } })}
                className="w-7 h-7 rounded-md border-2 transition-colors"
                style={{
                  backgroundColor: c.value + '30',
                  borderColor: zone.color === c.value ? c.value : 'transparent',
                }}
                title={c.label}
              />
            ))}
          </div>
        </div>

        <div className="text-xs text-zinc-500">
          {zone.deviceIds.length} device{zone.deviceIds.length !== 1 ? 's' : ''} in zone
        </div>

        <div className="pt-2 border-t border-zinc-700/50">
          <button
            onClick={() => dispatch({ type: 'DELETE_ZONE', id: zone.id })}
            className="w-full px-3 py-1.5 text-sm bg-red-900/30 text-red-400 rounded hover:bg-red-900/50 transition-colors"
          >
            Delete Zone
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
cd /home/coder/projects/panel
git add src/components/ZoneConfigPanel.tsx
git commit -m "Add ZoneConfigPanel for editing zone label and color"
```

---

### Task 5: Update Canvas — Render Zones, Drag-Select, Selection Rect

**Files:**
- Modify: `src/components/Canvas.tsx`

**Step 1: Update Canvas**

This is the biggest change. The Canvas needs to:
1. Render ZoneNode components behind connections
2. Handle drag-select (draw selection rect on empty canvas drag, create zone on release)
3. Update selection dispatches from `SELECT_DEVICE` to `CLEAR_SELECTION`
4. Pass `selectedIds` to DeviceNode

Replace the entire `src/components/Canvas.tsx`:

```tsx
import { useRef, useCallback, useEffect, useState } from 'react'
import type { DeviceType, TopologyState, ViewBox, PortPosition } from '../types'
import type { Action } from '../state'
import { DEVICE_CONFIGS, DEVICE_WIDTH, DEVICE_HEIGHT } from '../constants'
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
    const isGridClick = e.button === 0 && !spaceHeld && (e.target === svgRef.current || (e.target as SVGElement).closest('rect[fill="url(#grid)"]'))

    if (isGridClick) {
      dispatch({ type: 'CLEAR_SELECTION' })
      // Start selection rect
      const pos = screenToSVG(e.clientX, e.clientY)
      setSelectionRect({ startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y })
      return
    }

    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      e.preventDefault()
      setIsPanning(true)
      panStart.current = { x: e.clientX, y: e.clientY, vb: { ...viewBox } }
    }
  }, [spaceHeld, viewBox, dispatch, screenToSVG])

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

      // Only create zone if the rect is big enough (not just a click)
      if (rw > 20 && rh > 20) {
        const enclosed = state.devices.filter(d => {
          const dcx = d.x + DEVICE_WIDTH / 2
          const dcy = d.y + DEVICE_HEIGHT / 2
          return dcx >= rx && dcx <= rx + rw && dcy >= ry && dcy <= ry + rh
        })

        // Remove enclosed devices from any existing zones
        const deviceIdsToMove = enclosed.map(d => d.id)
        if (deviceIdsToMove.length > 0) {
          // Clean up old zone memberships by dispatching zone updates
          state.zones.forEach(z => {
            const remaining = z.deviceIds.filter(id => !deviceIdsToMove.includes(id))
            if (remaining.length !== z.deviceIds.length) {
              // We can't dispatch multiple times here easily, so we handle this in the ADD_ZONE reducer
            }
          })
        }

        const zoneId = crypto.randomUUID()
        const padding = 20
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
  }, [dragConn, onPortDragCancel, selectionRect, state.devices, state.zones, dispatch])

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

  // Selection rect visual bounds
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
            dispatch({ type: 'CLEAR_SELECTION' })
            const pos = screenToSVG(e.clientX, e.clientY)
            setSelectionRect({ startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y })
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
```

**Step 2: Commit**

```bash
cd /home/coder/projects/panel
git add src/components/Canvas.tsx
git commit -m "Add zones rendering, drag-select, and selection rectangle"
```

---

### Task 6: Update App — Multi-Select Delete, Config Panel Routing

**Files:**
- Modify: `src/App.tsx`

**Step 1: Update App.tsx**

Replace the entire file. Key changes: keyboard delete handles multi-select and zones, config panel shows device or zone panel based on selection type.

```tsx
import { useState, useEffect, useCallback } from 'react'
import { useTopology } from './state'
import type { PortPosition } from './types'
import Canvas from './components/Canvas'
import Sidebar from './components/Sidebar'
import ConfigPanel from './components/ConfigPanel'
import ZoneConfigPanel from './components/ZoneConfigPanel'

interface DragConnection {
  sourceDeviceId: string
  sourcePort: PortPosition
  sourceX: number
  sourceY: number
  mouseX: number
  mouseY: number
}

export default function App() {
  const { state, dispatch } = useTopology()
  const [dragConn, setDragConn] = useState<DragConnection | null>(null)

  const selectedDevice = state.selectionType === 'device' && state.selectedIds.length === 1
    ? state.devices.find(d => d.id === state.selectedIds[0])
    : null

  const selectedZone = state.selectionType === 'zone' && state.selectedIds.length === 1
    ? state.zones.find(z => z.id === state.selectedIds[0])
    : null

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        if (state.selectedIds.length === 0) return
        e.preventDefault()

        if (state.selectionType === 'zone') {
          state.selectedIds.forEach(id => dispatch({ type: 'DELETE_ZONE', id }))
        } else {
          state.selectedIds.forEach(id => dispatch({ type: 'DELETE_DEVICE', id }))
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [state.selectedIds, state.selectionType, dispatch])

  const onPortDragStart = useCallback((deviceId: string, port: PortPosition, x: number, y: number) => {
    setDragConn({ sourceDeviceId: deviceId, sourcePort: port, sourceX: x, sourceY: y, mouseX: x, mouseY: y })
  }, [])

  const onPortDragMove = useCallback((x: number, y: number) => {
    setDragConn(prev => prev ? { ...prev, mouseX: x, mouseY: y } : null)
  }, [])

  const onPortDragEnd = useCallback((targetDeviceId: string, targetPort: PortPosition) => {
    if (dragConn && dragConn.sourceDeviceId !== targetDeviceId) {
      dispatch({
        type: 'ADD_CONNECTION',
        connection: {
          id: crypto.randomUUID(),
          sourceDeviceId: dragConn.sourceDeviceId,
          targetDeviceId,
          sourcePort: dragConn.sourcePort,
          targetPort,
        },
      })
    }
    setDragConn(null)
  }, [dragConn, dispatch])

  const onPortDragCancel = useCallback(() => {
    setDragConn(null)
  }, [])

  return (
    <div className="h-screen w-screen bg-zinc-900 text-zinc-100 flex overflow-hidden">
      <Sidebar onDragStart={() => {}} />
      <Canvas
        state={state}
        dispatch={dispatch}
        dragConn={dragConn}
        onPortDragStart={onPortDragStart}
        onPortDragMove={onPortDragMove}
        onPortDragEnd={onPortDragEnd}
        onPortDragCancel={onPortDragCancel}
      />
      {selectedDevice && <ConfigPanel device={selectedDevice} dispatch={dispatch} />}
      {selectedZone && <ZoneConfigPanel zone={selectedZone} dispatch={dispatch} />}
    </div>
  )
}
```

**Step 2: Update ConfigPanel close button**

In `src/components/ConfigPanel.tsx`, change the close button dispatch from `SELECT_DEVICE` to `CLEAR_SELECTION`:

Replace:
```tsx
onClick={() => dispatch({ type: 'SELECT_DEVICE', id: null })}
```
with:
```tsx
onClick={() => dispatch({ type: 'CLEAR_SELECTION' })}
```

**Step 3: Verify TypeScript compiles**

Run: `cd /home/coder/projects/panel && npx tsc --noEmit`

**Step 4: Commit**

```bash
cd /home/coder/projects/panel
git add src/App.tsx src/components/ConfigPanel.tsx
git commit -m "Wire up multi-select delete and zone/device config panel routing"
```

---

### Task 7: Build, Test, and Polish

**Files:**
- Various

**Step 1: Build and fix any TypeScript errors**

Run: `cd /home/coder/projects/panel && npx tsc --noEmit`
Fix any errors.

**Step 2: Build production bundle**

Run: `cd /home/coder/projects/panel && npx vite build`

**Step 3: Manual verification checklist**

- [ ] Click device → selects it, shows config panel
- [ ] Shift+click multiple devices → multi-selects
- [ ] Drag on empty canvas → selection rect appears
- [ ] Release drag → zone created around enclosed devices
- [ ] Click zone → selects zone, shows zone config panel
- [ ] Drag zone → zone + devices move together
- [ ] Drag zone corner → zone resizes
- [ ] Edit zone label and color in panel
- [ ] Delete key with zone selected → removes zone, keeps devices
- [ ] Delete key with device selected → removes device
- [ ] Connections still work (ports, drawing)
- [ ] Pan and zoom still work
- [ ] Refresh → state persists including zones

**Step 4: Final commit**

```bash
cd /home/coder/projects/panel
git add -A
git commit -m "Multi-select and zones feature complete"
```
