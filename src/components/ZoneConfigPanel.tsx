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
