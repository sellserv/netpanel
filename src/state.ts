import { useReducer, useEffect, useRef } from 'react'
import { TopologyState, Device, PortPosition, ViewBox } from './types'
import { DEFAULT_VIEWBOX } from './constants'

const STORAGE_KEY = 'network-topology'

type Action =
  | { type: 'ADD_DEVICE'; device: Device }
  | { type: 'MOVE_DEVICE'; id: string; x: number; y: number }
  | { type: 'UPDATE_DEVICE'; id: string; changes: Partial<Pick<Device, 'label' | 'ip' | 'notes' | 'type'>> }
  | { type: 'DELETE_DEVICE'; id: string }
  | { type: 'ADD_CONNECTION'; connection: import('./types').Connection }
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
