# Network Topology Builder — Design

## Overview

A React app (Vite + TypeScript + Tailwind) for building network topology diagrams. Full-screen SVG canvas with pan/zoom, drag-and-drop device placement, connection drawing between ports, and a config panel for editing device properties. Dark theme (slate/zinc). LocalStorage persistence.

## Layout

```
┌──────────┬─────────────────────────┬──────────┐
│  Left    │                         │  Right   │
│  Sidebar │     SVG Canvas          │  Config  │
│  (palette)│    (full-screen)       │  Panel   │
│  ~220px  │                         │  ~300px  │
│  collaps.│                         │  cond.   │
└──────────┴─────────────────────────┴──────────┘
```

- **Left sidebar:** Collapsible device palette. Drag devices onto canvas.
- **Canvas:** Full-screen SVG with grid pattern background. Pan via middle-click drag or space+drag. Zoom via scroll wheel.
- **Right panel:** Appears when a device is selected. Edit name, IP/hostname, type, notes.

## Approach

Pure SVG — all devices, connections, and grid rendered in a single SVG element. Pan/zoom via `viewBox` manipulation. No external graph library.

## State

Single `useReducer`:

```ts
interface Device {
  id: string
  type: DeviceType
  label: string
  x: number
  y: number
  ip: string
  notes: string
  color: string
}

interface Connection {
  id: string
  sourceDeviceId: string
  targetDeviceId: string
  sourcePort: 'top' | 'right' | 'bottom' | 'left'
  targetPort: 'top' | 'right' | 'bottom' | 'left'
}

interface TopologyState {
  devices: Device[]
  connections: Connection[]
  selectedDeviceId: string | null
  viewBox: { x: number; y: number; width: number; height: number }
}
```

Actions: `ADD_DEVICE`, `MOVE_DEVICE`, `UPDATE_DEVICE`, `DELETE_DEVICE`, `ADD_CONNECTION`, `DELETE_CONNECTION`, `SELECT_DEVICE`, `SET_VIEWBOX`

## Device Types

12 types, each with a lucide icon and distinct muted color:

| Type | Icon | Color |
|------|------|-------|
| Server | `server` | Blue |
| Firewall | `shield` | Red |
| Switch | `network` | Teal |
| Router | `router` | Orange |
| NAS/Storage | `hard-drive` | Purple |
| VM Host | `monitor` | Indigo |
| Container | `box` | Cyan |
| Cloud/WAN | `cloud` | Sky |
| VPN Node | `lock` | Emerald |
| Access Point | `wifi` | Amber |
| Workstation | `monitor-dot` | Slate |
| Generic | `circle-dot` | Gray |

## Device Rendering

SVG `<g>` group containing:
- Rounded rect background in device color
- Lucide icon as inline SVG paths
- Label text underneath

## Connections

- 4 port circles on device edges, visible on hover
- Click+drag from port to another device's port creates connection
- Rendered as cubic bezier `<path>` elements
- Update automatically when devices reposition

## Interactions

| Action | Behavior |
|--------|----------|
| Drag from palette | Ghost preview, drop creates device |
| Click device | Select, open config panel |
| Drag device | Reposition, connections follow |
| Backspace/Delete | Remove selected device + connections |
| Scroll wheel | Zoom centered on cursor |
| Middle-click drag / Space+drag | Pan canvas |
| Click empty canvas | Deselect |

## Persistence

Auto-save to localStorage (debounced). Restore on mount.

## Tech Stack

- Vite + React + TypeScript
- Tailwind CSS (dark theme, slate/zinc palette)
- lucide-react for icons (palette sidebar) + inline SVG paths (canvas)
- No external graph/diagram library
