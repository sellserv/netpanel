# Network Topology Builder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a professional dark-themed network topology builder with SVG canvas, drag-and-drop device placement, connection drawing, and localStorage persistence.

**Architecture:** Single-page React app with pure SVG rendering. All devices and connections live in one SVG element with viewBox-based pan/zoom. State managed via useReducer with auto-save to localStorage.

**Tech Stack:** Vite, React 18, TypeScript, Tailwind CSS, lucide-react

---

### Task 1: Scaffold Project

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`

**Step 1: Scaffold Vite + React + TypeScript project**

Run:
```bash
cd /home/coder/projects/panel
npm create vite@latest . -- --template react-ts
```

If prompted about existing files, choose to overwrite/ignore.

**Step 2: Install dependencies**

Run:
```bash
cd /home/coder/projects/panel
npm install
npm install -D tailwindcss @tailwindcss/vite
npm install lucide-react
```

**Step 3: Configure Tailwind**

Replace `src/index.css` with:
```css
@import "tailwindcss";
```

Update `vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

**Step 4: Set up base App with dark theme**

Replace `src/App.tsx` with:
```tsx
export default function App() {
  return (
    <div className="h-screen w-screen bg-zinc-900 text-zinc-100 flex overflow-hidden">
      <div className="text-center m-auto text-zinc-500">Network Topology Builder</div>
    </div>
  )
}
```

Replace `src/main.tsx` with:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

**Step 5: Verify dev server runs**

Run: `cd /home/coder/projects/panel && npm run dev -- --host 0.0.0.0`
Expected: Dev server starts, page shows "Network Topology Builder" on dark background.
Stop the server after verifying.

**Step 6: Commit**

```bash
cd /home/coder/projects/panel
echo "node_modules" > .gitignore
git add -A
git commit -m "Scaffold Vite + React + TypeScript + Tailwind project"
```

---

### Task 2: Define Types and Constants

**Files:**
- Create: `src/types.ts`
- Create: `src/constants.ts`

**Step 1: Create type definitions**

Create `src/types.ts`:
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
```

**Step 2: Create constants with device type configs**

Create `src/constants.ts`:
```ts
import { DeviceTypeConfig } from './types'

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
```

**Step 3: Commit**

```bash
cd /home/coder/projects/panel
git add src/types.ts src/constants.ts
git commit -m "Add type definitions and device config constants"
```

---

### Task 3: State Management — Reducer + Context

**Files:**
- Create: `src/state.ts`

**Step 1: Create the reducer and context**

Create `src/state.ts`:
```ts
import { useReducer, useEffect, useCallback, useRef } from 'react'
import { TopologyState, Device, Connection, PortPosition, ViewBox } from './types'
import { DEFAULT_VIEWBOX } from './constants'

const STORAGE_KEY = 'network-topology'

type Action =
  | { type: 'ADD_DEVICE'; device: Device }
  | { type: 'MOVE_DEVICE'; id: string; x: number; y: number }
  | { type: 'UPDATE_DEVICE'; id: string; changes: Partial<Pick<Device, 'label' | 'ip' | 'notes' | 'type'>> }
  | { type: 'DELETE_DEVICE'; id: string }
  | { type: 'ADD_CONNECTION'; connection: Connection }
  | { type: 'DELETE_CONNECTION'; id: string }
  | { type: 'SELECT_DEVICE'; id: string | null }
  | { type: 'SET_VIEWBOX'; viewBox: ViewBox }
  | { type: 'LOAD_STATE'; state: TopologyState }

const initialState: TopologyState = {
  devices: [],
  connections: [],
  selectedDeviceId: null,
  viewBox: DEFAULT_VIEWBOX,
}

function reducer(state: TopologyState, action: Action): TopologyState {
  switch (action.type) {
    case 'ADD_DEVICE':
      return { ...state, devices: [...state.devices, action.device] }

    case 'MOVE_DEVICE':
      return {
        ...state,
        devices: state.devices.map(d =>
          d.id === action.id ? { ...d, x: action.x, y: action.y } : d
        ),
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
        selectedDeviceId: state.selectedDeviceId === action.id ? null : state.selectedDeviceId,
      }

    case 'ADD_CONNECTION':
      return { ...state, connections: [...state.connections, action.connection] }

    case 'DELETE_CONNECTION':
      return {
        ...state,
        connections: state.connections.filter(c => c.id !== action.id),
      }

    case 'SELECT_DEVICE':
      return { ...state, selectedDeviceId: action.id }

    case 'SET_VIEWBOX':
      return { ...state, viewBox: action.viewBox }

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
      return { ...initialState, ...parsed, selectedDeviceId: null }
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
      const { selectedDeviceId, ...rest } = state
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rest))
    }, 300)
    return () => clearTimeout(saveTimeout.current)
  }, [state])

  return { state, dispatch }
}

export type { Action }
```

**Step 2: Commit**

```bash
cd /home/coder/projects/panel
git add src/state.ts
git commit -m "Add topology reducer with localStorage persistence"
```

---

### Task 4: SVG Canvas with Grid Background

**Files:**
- Create: `src/components/Canvas.tsx`
- Create: `src/components/Grid.tsx`
- Modify: `src/App.tsx`

**Step 1: Create Grid component**

Create `src/components/Grid.tsx`:
```tsx
import { GRID_SIZE, GRID_MAJOR } from '../constants'

export default function Grid() {
  return (
    <defs>
      <pattern id="smallGrid" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
        <path
          d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`}
          fill="none"
          stroke="rgba(255,255,255,0.03)"
          strokeWidth="0.5"
        />
      </pattern>
      <pattern id="grid" width={GRID_MAJOR} height={GRID_MAJOR} patternUnits="userSpaceOnUse">
        <rect width={GRID_MAJOR} height={GRID_MAJOR} fill="url(#smallGrid)" />
        <path
          d={`M ${GRID_MAJOR} 0 L 0 0 0 ${GRID_MAJOR}`}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1"
        />
      </pattern>
    </defs>
  )
}
```

**Step 2: Create Canvas component with pan and zoom**

Create `src/components/Canvas.tsx`:
```tsx
import { useRef, useCallback, useEffect, useState } from 'react'
import { TopologyState, ViewBox } from '../types'
import { Action } from '../state'
import Grid from './Grid'

interface CanvasProps {
  state: TopologyState
  dispatch: React.Dispatch<Action>
  children?: React.ReactNode
}

export default function Canvas({ state, dispatch, children }: CanvasProps) {
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
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      e.preventDefault()
      setIsPanning(true)
      panStart.current = { x: e.clientX, y: e.clientY, vb: { ...viewBox } }
    }
  }, [spaceHeld, viewBox])

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
  }, [isPanning, dispatch])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
    panStart.current = null
  }, [])

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
      style={{ cursor: isPanning || spaceHeld ? 'grabbing' : 'default' }}
    >
      <Grid />
      <rect
        x={viewBox.x - viewBox.width}
        y={viewBox.y - viewBox.height}
        width={viewBox.width * 3}
        height={viewBox.height * 3}
        fill="url(#grid)"
      />
      {children}
    </svg>
  )
}
```

**Step 3: Wire Canvas into App**

Replace `src/App.tsx`:
```tsx
import { useTopology } from './state'
import Canvas from './components/Canvas'

export default function App() {
  const { state, dispatch } = useTopology()

  return (
    <div className="h-screen w-screen bg-zinc-900 text-zinc-100 flex overflow-hidden">
      <Canvas state={state} dispatch={dispatch} />
    </div>
  )
}
```

**Step 4: Verify**

Run dev server. Confirm: dark background with subtle grid, scroll wheel zooms, middle-click drag pans.

**Step 5: Commit**

```bash
cd /home/coder/projects/panel
git add src/components/Canvas.tsx src/components/Grid.tsx src/App.tsx
git commit -m "Add SVG canvas with grid background, pan, and zoom"
```

---

### Task 5: Left Sidebar — Device Palette

**Files:**
- Create: `src/components/Sidebar.tsx`
- Modify: `src/App.tsx`

**Step 1: Create Sidebar component**

Create `src/components/Sidebar.tsx`:
```tsx
import { useState } from 'react'
import * as Icons from 'lucide-react'
import { DeviceType } from '../types'
import { DEVICE_CONFIGS } from '../constants'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface SidebarProps {
  onDragStart: (type: DeviceType) => void
}

export default function Sidebar({ onDragStart }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div
      className={`relative flex flex-col bg-zinc-800/90 border-r border-zinc-700/50 transition-all duration-200 ${
        collapsed ? 'w-12' : 'w-56'
      }`}
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-4 z-10 bg-zinc-700 hover:bg-zinc-600 rounded-full w-6 h-6 flex items-center justify-center text-zinc-300"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {!collapsed && (
        <>
          <div className="px-4 py-3 border-b border-zinc-700/50">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Devices
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {DEVICE_CONFIGS.map(config => {
              const Icon = (Icons as Record<string, React.ComponentType<{ size?: number; color?: string }>>)[config.icon]
              return (
                <div
                  key={config.type}
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.setData('deviceType', config.type)
                    onDragStart(config.type)
                  }}
                  className="flex items-center gap-3 px-3 py-2 rounded-md cursor-grab hover:bg-zinc-700/50 active:cursor-grabbing transition-colors"
                >
                  {Icon && <Icon size={18} color={config.color} />}
                  <span className="text-sm text-zinc-300">{config.label}</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
```

**Step 2: Wire Sidebar into App**

Update `src/App.tsx`:
```tsx
import { useTopology } from './state'
import Canvas from './components/Canvas'
import Sidebar from './components/Sidebar'

export default function App() {
  const { state, dispatch } = useTopology()

  return (
    <div className="h-screen w-screen bg-zinc-900 text-zinc-100 flex overflow-hidden">
      <Sidebar onDragStart={() => {}} />
      <Canvas state={state} dispatch={dispatch} />
    </div>
  )
}
```

**Step 3: Verify**

Dev server shows left sidebar with 12 device icons. Collapse/expand works. Items are draggable.

**Step 4: Commit**

```bash
cd /home/coder/projects/panel
git add src/components/Sidebar.tsx src/App.tsx
git commit -m "Add collapsible left sidebar with device palette"
```

---

### Task 6: Drag-and-Drop — Place Devices on Canvas

**Files:**
- Modify: `src/components/Canvas.tsx`
- Modify: `src/App.tsx`

**Step 1: Add drop handling to Canvas**

In `Canvas.tsx`, add drop support. The Canvas needs to accept HTML drag events (from the sidebar), convert the drop position to SVG coordinates, and dispatch ADD_DEVICE.

Update the `<svg>` element to handle `onDragOver` and `onDrop`:

Add to Canvas component:
```tsx
// Add this inside the Canvas component, after screenToSVG
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
```

Add to the `<svg>` element props:
```tsx
onDragOver={(e) => e.preventDefault()}
onDrop={handleDrop}
```

Add imports at top:
```tsx
import { DeviceType } from '../types'
import { DEVICE_CONFIGS, DEVICE_WIDTH, DEVICE_HEIGHT } from '../constants'
```

**Step 2: Verify**

Drag a device from sidebar onto canvas. A device should be added (we won't see it visually until Task 7, but check React DevTools or add a console.log to confirm state updates).

**Step 3: Commit**

```bash
cd /home/coder/projects/panel
git add src/components/Canvas.tsx src/App.tsx
git commit -m "Add drag-and-drop device placement from sidebar to canvas"
```

---

### Task 7: Render Devices on Canvas

**Files:**
- Create: `src/components/DeviceNode.tsx`
- Create: `src/components/DeviceIcon.tsx`
- Modify: `src/components/Canvas.tsx`

**Step 1: Create SVG icon renderer**

Create `src/components/DeviceIcon.tsx`. This renders lucide icon SVG paths inside the canvas. We'll use a lookup of SVG path data for each icon:

```tsx
// SVG path data extracted from lucide icons (24x24 viewBox)
const ICON_PATHS: Record<string, string[]> = {
  Server: [
    'M2 9h20', 'M2 15h20',
    'M2 5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5z',
    'M6 12h.01', 'M6 6h.01', 'M6 18h.01',
  ],
  Shield: [
    'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
  ],
  Network: [
    'M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l2.3 2.3a2.4 2.4 0 0 0 3.4 0l2.1-2.1a2.4 2.4 0 0 0 0-3.4L17.5 12l2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.1-2.1a2.4 2.4 0 0 0-3.4 0L12 6.5 9.7 4.2a2.4 2.4 0 0 0-3.4 0L4.2 6.3a2.4 2.4 0 0 0 0 3.4L6.5 12l-2.3 2.3a2.4 2.4 0 0 0 0 3.4z',
  ],
  Router: [
    'M12 2L2 7l10 5 10-5-10-5z',
    'M2 17l10 5 10-5',
    'M2 12l10 5 10-5',
  ],
  HardDrive: [
    'M22 12H2',
    'M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
    'M6 16h.01', 'M10 16h.01',
  ],
  Monitor: [
    'M5 3h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
    'M8 21h8', 'M12 17v4',
  ],
  Box: [
    'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z',
    'M3.3 7l8.7 5 8.7-5',
    'M12 22V12',
  ],
  Cloud: [
    'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z',
  ],
  Lock: [
    'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z',
    'M7 11V7a5 5 0 0 1 10 0v4',
  ],
  Wifi: [
    'M12 20h.01',
    'M2 8.82a15 15 0 0 1 20 0',
    'M5 12.859a10 10 0 0 1 14 0',
    'M8.5 16.429a5 5 0 0 1 7 0',
  ],
  MonitorDot: [
    'M5 3h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
    'M8 21h8', 'M12 17v4',
    'M12 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  ],
  CircleDot: [
    'M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0 -20 0',
    'M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
  ],
}

interface DeviceIconProps {
  icon: string
  x: number
  y: number
  size: number
  color: string
}

export default function DeviceIcon({ icon, x, y, size, color }: DeviceIconProps) {
  const paths = ICON_PATHS[icon]
  if (!paths) return null

  const scale = size / 24

  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`}>
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  )
}
```

**Step 2: Create DeviceNode component**

Create `src/components/DeviceNode.tsx`:
```tsx
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
```

**Step 3: Render devices in Canvas**

Update `Canvas.tsx` to expose svgRef and render DeviceNode components:

Add import:
```tsx
import DeviceNode from './DeviceNode'
```

Replace `{children}` in the SVG with:
```tsx
{state.devices.map(device => (
  <DeviceNode
    key={device.id}
    device={device}
    isSelected={device.id === state.selectedDeviceId}
    viewBox={viewBox}
    dispatch={dispatch}
    svgRef={svgRef}
  />
))}
{children}
```

**Step 4: Deselect on canvas click**

Add to the Canvas `handleMouseDown`, at the start before the pan check:
```tsx
if (e.button === 0 && !spaceHeld && e.target === svgRef.current) {
  dispatch({ type: 'SELECT_DEVICE', id: null })
}
```

Also add click handler on the grid background rect:
```tsx
<rect
  ...
  onMouseDown={(e) => {
    if (e.button === 0) dispatch({ type: 'SELECT_DEVICE', id: null })
  }}
/>
```

**Step 5: Verify**

Drag device from sidebar to canvas. Device appears with icon and label. Click to select (highlight). Drag to reposition. Click empty space to deselect.

**Step 6: Commit**

```bash
cd /home/coder/projects/panel
git add src/components/DeviceNode.tsx src/components/DeviceIcon.tsx src/components/Canvas.tsx
git commit -m "Render devices on canvas with icons, selection, and dragging"
```

---

### Task 8: Right Config Panel

**Files:**
- Create: `src/components/ConfigPanel.tsx`
- Modify: `src/App.tsx`

**Step 1: Create ConfigPanel component**

Create `src/components/ConfigPanel.tsx`:
```tsx
import { Device } from '../types'
import { DEVICE_CONFIGS, getDeviceConfig } from '../constants'
import { Action } from '../state'
import { X } from 'lucide-react'

interface ConfigPanelProps {
  device: Device
  dispatch: React.Dispatch<Action>
}

export default function ConfigPanel({ device, dispatch }: ConfigPanelProps) {
  const config = getDeviceConfig(device.type)

  const update = (changes: Parameters<typeof dispatch>[0] extends { type: 'UPDATE_DEVICE'; changes: infer C } ? C : never) => {
    dispatch({ type: 'UPDATE_DEVICE', id: device.id, changes })
  }

  return (
    <div className="w-72 bg-zinc-800/90 border-l border-zinc-700/50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/50">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Properties
        </h2>
        <button
          onClick={() => dispatch({ type: 'SELECT_DEVICE', id: null })}
          className="text-zinc-500 hover:text-zinc-300"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Display Name</label>
          <input
            type="text"
            value={device.label}
            onChange={e => update({ label: e.target.value })}
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Device Type</label>
          <select
            value={device.type}
            onChange={e => update({ type: e.target.value as Device['type'] })}
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
          >
            {DEVICE_CONFIGS.map(c => (
              <option key={c.type} value={c.type}>{c.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">IP / Hostname</label>
          <input
            type="text"
            value={device.ip}
            onChange={e => update({ ip: e.target.value })}
            placeholder="e.g. 192.168.1.1"
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Notes</label>
          <textarea
            value={device.notes}
            onChange={e => update({ notes: e.target.value })}
            rows={4}
            placeholder="Additional notes..."
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
          />
        </div>

        <div className="pt-2 border-t border-zinc-700/50">
          <button
            onClick={() => dispatch({ type: 'DELETE_DEVICE', id: device.id })}
            className="w-full px-3 py-1.5 text-sm bg-red-900/30 text-red-400 rounded hover:bg-red-900/50 transition-colors"
          >
            Delete Device
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Wire ConfigPanel into App**

Update `src/App.tsx`:
```tsx
import { useTopology } from './state'
import Canvas from './components/Canvas'
import Sidebar from './components/Sidebar'
import ConfigPanel from './components/ConfigPanel'

export default function App() {
  const { state, dispatch } = useTopology()
  const selectedDevice = state.devices.find(d => d.id === state.selectedDeviceId)

  return (
    <div className="h-screen w-screen bg-zinc-900 text-zinc-100 flex overflow-hidden">
      <Sidebar onDragStart={() => {}} />
      <Canvas state={state} dispatch={dispatch} />
      {selectedDevice && <ConfigPanel device={selectedDevice} dispatch={dispatch} />}
    </div>
  )
}
```

**Step 3: Verify**

Click a device — config panel appears on right. Edit name, IP, notes — device updates. Click X or empty canvas — panel closes. Delete button removes device.

**Step 4: Commit**

```bash
cd /home/coder/projects/panel
git add src/components/ConfigPanel.tsx src/App.tsx
git commit -m "Add right config panel for device properties"
```

---

### Task 9: Keyboard Delete

**Files:**
- Modify: `src/App.tsx`

**Step 1: Add keyboard listener for delete**

In `App.tsx`, add a `useEffect` for keyboard delete:
```tsx
import { useEffect } from 'react'
```

Inside the App component:
```tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedDeviceId) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      dispatch({ type: 'DELETE_DEVICE', id: state.selectedDeviceId })
    }
  }
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [state.selectedDeviceId, dispatch])
```

**Step 2: Verify**

Select a device, press Delete or Backspace — device removed. Does NOT trigger when editing text fields in config panel.

**Step 3: Commit**

```bash
cd /home/coder/projects/panel
git add src/App.tsx
git commit -m "Add keyboard delete/backspace to remove selected device"
```

---

### Task 10: Connection Ports — Hover Display

**Files:**
- Modify: `src/components/DeviceNode.tsx`

**Step 1: Add port circles on hover**

Add a `hovering` state and render 4 port circles on device edges when hovered.

Add to DeviceNode, inside the component:
```tsx
const [hovered, setHovered] = useState(false)
```

Add `onMouseEnter={() => setHovered(true)}` and `onMouseLeave={() => setHovered(false)}` to the outer `<g>`.

Render ports when hovered:
```tsx
import { DEVICE_WIDTH, DEVICE_HEIGHT, PORT_RADIUS, getDeviceConfig } from '../constants'
import { PortPosition } from '../types'

// Port positions relative to device
const getPortPos = (device: Device, port: PortPosition) => {
  const cx = device.x + DEVICE_WIDTH / 2
  const cy = device.y + DEVICE_HEIGHT / 2
  switch (port) {
    case 'top': return { x: cx, y: device.y }
    case 'bottom': return { x: cx, y: device.y + DEVICE_HEIGHT }
    case 'left': return { x: device.x, y: cy }
    case 'right': return { x: device.x + DEVICE_WIDTH, y: cy }
  }
}

// Inside the JSX, after the label text:
{hovered && (['top', 'right', 'bottom', 'left'] as PortPosition[]).map(port => {
  const pos = getPortPos(device, port)
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
    />
  )
})}
```

**Step 2: Verify**

Hover a device — 4 port circles appear on edges. Leave — they disappear.

**Step 3: Commit**

```bash
cd /home/coder/projects/panel
git add src/components/DeviceNode.tsx
git commit -m "Show connection port circles on device hover"
```

---

### Task 11: Connection Drawing

**Files:**
- Create: `src/components/ConnectionLine.tsx`
- Modify: `src/components/DeviceNode.tsx`
- Modify: `src/components/Canvas.tsx`
- Modify: `src/App.tsx`

**Step 1: Create ConnectionLine component**

Create `src/components/ConnectionLine.tsx`:
```tsx
import { Device, Connection, PortPosition } from '../types'
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
  const d = `M ${from.x} ${from.y} C ${from.x + (from.port === 'right' ? controlOffset : from.port === 'left' ? -controlOffset : 0)} ${from.y + (from.port === 'bottom' ? controlOffset : from.port === 'top' ? -controlOffset : 0)}, ${to.x} ${to.y}, ${to.x} ${to.y}`
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
```

**Step 2: Add connection drawing state to App**

Update `src/App.tsx` to track temporary connection drawing state and pass callbacks to Canvas/DeviceNode:

```tsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useTopology } from './state'
import { PortPosition } from './types'
import Canvas from './components/Canvas'
import Sidebar from './components/Sidebar'
import ConfigPanel from './components/ConfigPanel'

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
  const selectedDevice = state.devices.find(d => d.id === state.selectedDeviceId)
  const [dragConn, setDragConn] = useState<DragConnection | null>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedDeviceId) {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        dispatch({ type: 'DELETE_DEVICE', id: state.selectedDeviceId })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [state.selectedDeviceId, dispatch])

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
    </div>
  )
}
```

**Step 3: Update Canvas to render connections and temp line**

Update `Canvas.tsx` props and rendering:

Add the connection-related props to CanvasProps:
```tsx
import ConnectionLine, { TempConnectionLine } from './ConnectionLine'
import { PortPosition } from '../types'

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
  dragConn: DragConnection | null
  onPortDragStart: (deviceId: string, port: PortPosition, x: number, y: number) => void
  onPortDragMove: (x: number, y: number) => void
  onPortDragEnd: (targetDeviceId: string, targetPort: PortPosition) => void
  onPortDragCancel: () => void
}
```

In the handleMouseMove, add connection drag tracking:
```tsx
if (props.dragConn) {
  const pos = screenToSVG(e.clientX, e.clientY)
  props.onPortDragMove(pos.x, pos.y)
}
```

In the handleMouseUp, cancel connection drag:
```tsx
if (props.dragConn) {
  props.onPortDragCancel()
}
```

Render connections before devices, and temp line:
```tsx
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
    onPortDragStart={props.onPortDragStart}
    onPortDragEnd={props.onPortDragEnd}
    isDraggingConnection={!!props.dragConn}
  />
))}
{props.dragConn && (
  <TempConnectionLine
    from={{ x: props.dragConn.sourceX, y: props.dragConn.sourceY, port: props.dragConn.sourcePort }}
    to={{ x: props.dragConn.mouseX, y: props.dragConn.mouseY }}
  />
)}
```

**Step 4: Update DeviceNode to handle port interactions**

Add to DeviceNode props:
```tsx
onPortDragStart: (deviceId: string, port: PortPosition, x: number, y: number) => void
onPortDragEnd: (targetDeviceId: string, targetPort: PortPosition) => void
isDraggingConnection: boolean
```

Update port circles to be interactive — on mousedown start a connection drag, on mouseup end it:
```tsx
{(hovered || isDraggingConnection) && (['top', 'right', 'bottom', 'left'] as PortPosition[]).map(port => {
  const pos = getPortPos(device, port)
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
```

**Step 5: Verify**

Hover device, see ports. Drag from port — dashed line follows cursor. Release on another device's port — solid bezier connection created. Move devices — connections follow.

**Step 6: Commit**

```bash
cd /home/coder/projects/panel
git add src/components/ConnectionLine.tsx src/components/DeviceNode.tsx src/components/Canvas.tsx src/App.tsx
git commit -m "Add connection drawing between device ports"
```

---

### Task 12: Final Polish

**Files:**
- Various touch-ups across components

**Step 1: Prevent default context menu on canvas**

In Canvas.tsx, add to `<svg>`:
```tsx
onContextMenu={(e) => e.preventDefault()}
```

**Step 2: Add IP display under device label**

In DeviceNode, if device.ip is set, render a second text element below the label:
```tsx
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
```

**Step 3: Prevent wheel scroll on page**

In `src/index.css`, add:
```css
html, body, #root {
  overflow: hidden;
  height: 100%;
}
```

**Step 4: Verify everything works end-to-end**

- Drag devices from sidebar
- Reposition devices
- Draw connections
- Edit in config panel
- Delete with keyboard
- Pan and zoom
- Refresh page — state persists

**Step 5: Commit**

```bash
cd /home/coder/projects/panel
git add -A
git commit -m "Final polish: IP display, context menu, scroll prevention"
```
