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
        if (state.selectionType === 'zone') {
          return { ...state, selectedIds: [action.id], selectionType: 'device' }
        }
        const alreadySelected = state.selectedIds.includes(action.id)
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
