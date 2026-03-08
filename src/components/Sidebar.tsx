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
