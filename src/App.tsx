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
