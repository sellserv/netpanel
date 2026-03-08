# Multi-Select & Zones — Design

## Overview

Add multi-select (shift+click, drag-select) and labeled zones with colored backgrounds. Zones contain devices and move/resize as a group. Flat zones only (no nesting). One zone per device.

## New State

```ts
interface Zone {
  id: string
  label: string
  color: string
  x: number
  y: number
  width: number
  height: number
  deviceIds: string[]
}
```

TopologyState changes:
- `selectedDeviceId: string | null` → `selectedIds: string[]` (device IDs or a single zone ID)
- Add `zones: Zone[]`

## Multi-Select

- Shift+click toggles device in/out of selection
- Drag-select on empty canvas draws selection rect, creates zone on release from enclosed devices
- Click without shift selects single item, clears rest

## Zones

- SVG rounded rects rendered behind devices with semi-transparent fill
- Label at top of zone
- Dragging zone moves zone + all contained devices
- 4 corner resize handles when zone is selected
- Click zone to select → config panel for label/color
- Delete zone keeps devices, only removes grouping
- Devices dragged out of zone bounds auto-removed from zone
- Devices dragged into zone bounds auto-added to zone

## Z-Order

1. Grid background
2. Zones
3. Connections
4. Devices
5. Selection rectangle (temp)
6. Temp connection line

## Interactions

| Action | Behavior |
|--------|----------|
| Click device | Select only that device |
| Shift+click device | Toggle in multi-selection |
| Drag empty canvas | Draw selection rect → create zone |
| Click zone background | Select zone |
| Drag zone | Move zone + contained devices |
| Drag zone corner | Resize zone |
| Delete with zone selected | Remove zone, keep devices |
| Delete with device(s) selected | Remove devices |
