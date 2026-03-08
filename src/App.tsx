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
