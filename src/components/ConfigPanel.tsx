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
