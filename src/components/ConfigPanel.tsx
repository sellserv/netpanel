import type { Device, HealthCheck } from '../types'
import { DEVICE_CONFIGS } from '../constants'
import type { Action } from '../state'
import { X } from 'lucide-react'

interface ConfigPanelProps {
  device: Device
  dispatch: React.Dispatch<Action>
}

export default function ConfigPanel({ device, dispatch }: ConfigPanelProps) {
  const update = (changes: Partial<Pick<Device, 'label' | 'ip' | 'notes' | 'type' | 'healthCheck'>>) => {
    dispatch({ type: 'UPDATE_DEVICE', id: device.id, changes })
  }

  return (
    <div className="w-72 bg-zinc-800/90 border-l border-zinc-700/50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/50">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Properties
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
          <label className="block text-xs text-zinc-500 mb-2">Health Check</label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={!!device.healthCheck}
                onChange={e => {
                  if (e.target.checked) {
                    update({
                      healthCheck: { type: 'ping', interval: 60 },
                    })
                  } else {
                    update({ healthCheck: undefined })
                  }
                }}
                className="rounded bg-zinc-900 border-zinc-600"
              />
              Enable monitoring
            </label>

            {device.healthCheck && (
              <>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Check Type</label>
                  <select
                    value={device.healthCheck.type}
                    onChange={e =>
                      update({
                        healthCheck: { ...device.healthCheck!, type: e.target.value as HealthCheck['type'] },
                      })
                    }
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                  >
                    <option value="ping">Ping</option>
                    <option value="tcp">TCP Port</option>
                    <option value="http">HTTP</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-zinc-500 mb-1">
                    {device.healthCheck.type === 'http' ? 'URL' : device.healthCheck.type === 'tcp' ? 'Host:Port' : 'Host (blank = use IP)'}
                  </label>
                  <input
                    type="text"
                    value={device.healthCheck.target || ''}
                    onChange={e =>
                      update({
                        healthCheck: { ...device.healthCheck!, target: e.target.value || undefined },
                      })
                    }
                    placeholder={
                      device.healthCheck.type === 'http'
                        ? 'https://example.com'
                        : device.healthCheck.type === 'tcp'
                        ? '192.168.1.1:443'
                        : device.ip || 'IP address'
                    }
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Interval</label>
                  <select
                    value={device.healthCheck.interval}
                    onChange={e =>
                      update({
                        healthCheck: { ...device.healthCheck!, interval: parseInt(e.target.value, 10) },
                      })
                    }
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                  >
                    <option value="30">Every 30 seconds</option>
                    <option value="60">Every 1 minute</option>
                    <option value="300">Every 5 minutes</option>
                    <option value="600">Every 10 minutes</option>
                  </select>
                </div>
              </>
            )}
          </div>
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
