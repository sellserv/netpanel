import { useEffect } from 'react'
import { useTopology } from './state'
import Canvas from './components/Canvas'
import Sidebar from './components/Sidebar'
import ConfigPanel from './components/ConfigPanel'

export default function App() {
  const { state, dispatch } = useTopology()
  const selectedDevice = state.devices.find(d => d.id === state.selectedDeviceId)

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

  return (
    <div className="h-screen w-screen bg-zinc-900 text-zinc-100 flex overflow-hidden">
      <Sidebar onDragStart={() => {}} />
      <Canvas state={state} dispatch={dispatch} />
      {selectedDevice && <ConfigPanel device={selectedDevice} dispatch={dispatch} />}
    </div>
  )
}
