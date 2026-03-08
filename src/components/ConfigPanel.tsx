import type { Device, HealthCheck, HealthStatus, ApiPreset } from '../types'
import { DEVICE_CONFIGS } from '../constants'
import type { Action } from '../state'
import { X } from 'lucide-react'

const PRESET_DEFAULTS: Record<ApiPreset, { label: string; defaultPath: (ip: string) => string; needsToken: boolean }> = {
  proxmox: { label: 'Proxmox', defaultPath: (ip) => `https://${ip}:8006/api2/json/nodes`, needsToken: true },
  truenas: { label: 'TrueNAS', defaultPath: (ip) => `http://${ip}/api/v2.0/system/info`, needsToken: true },
  tailscale: { label: 'Tailscale', defaultPath: () => `https://api.tailscale.com/api/v2/tailnet/-/devices`, needsToken: true },
  docker: { label: 'Docker', defaultPath: (ip) => `http://${ip}:2375/v1.43/info`, needsToken: false },
}

const METRIC_LABELS: Record<string, string> = {
  cpuPercent: 'CPU',
  ramPercent: 'RAM',
  uptime: 'Uptime',
  nodeCount: 'Nodes',
  version: 'Version',
  containersRunning: 'Running',
  containersTotal: 'Total Containers',
  images: 'Images',
  deviceCount: 'Devices',
  onlineCount: 'Online',
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

function formatMetricValue(key: string, value: string | number | boolean): string {
  if (key === 'uptime' && typeof value === 'number') return formatUptime(value)
  if ((key === 'cpuPercent' || key === 'ramPercent') && typeof value === 'number') return `${value}%`
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

interface ConfigPanelProps {
  device: Device
  dispatch: React.Dispatch<Action>
  healthStatus?: HealthStatus
}

export default function ConfigPanel({ device, dispatch, healthStatus }: ConfigPanelProps) {
  const update = (changes: Partial<Pick<Device, 'label' | 'ip' | 'notes' | 'type' | 'healthCheck'>>) => {
    dispatch({ type: 'UPDATE_DEVICE', id: device.id, changes })
  }

  const hc = device.healthCheck
  const isApi = hc?.type === 'api'

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

            {hc && (
              <>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Check Type</label>
                  <select
                    value={hc.type}
                    onChange={e => {
                      const newType = e.target.value as HealthCheck['type']
                      if (newType === 'api') {
                        update({
                          healthCheck: { ...hc, type: 'api', apiPreset: 'docker', target: undefined },
                        })
                      } else {
                        update({
                          healthCheck: { type: newType, interval: hc.interval, target: hc.target },
                        })
                      }
                    }}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                  >
                    <option value="ping">Ping</option>
                    <option value="tcp">TCP Port</option>
                    <option value="http">HTTP</option>
                    <option value="api">API</option>
                  </select>
                </div>

                {isApi && (
                  <>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Preset</label>
                      <select
                        value={hc.apiPreset || 'docker'}
                        onChange={e => {
                          const preset = e.target.value as ApiPreset
                          update({
                            healthCheck: { ...hc, apiPreset: preset, target: undefined },
                          })
                        }}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                      >
                        {(Object.entries(PRESET_DEFAULTS) as [ApiPreset, typeof PRESET_DEFAULTS[ApiPreset]][]).map(([key, cfg]) => (
                          <option key={key} value={key}>{cfg.label}</option>
                        ))}
                      </select>
                    </div>

                    {hc.apiPreset && PRESET_DEFAULTS[hc.apiPreset]?.needsToken && (
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">API Token</label>
                        <input
                          type="password"
                          value={hc.apiToken || ''}
                          onChange={e =>
                            update({
                              healthCheck: { ...hc, apiToken: e.target.value || undefined },
                            })
                          }
                          placeholder="Token or API key"
                          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                        />
                      </div>
                    )}
                  </>
                )}

                <div>
                  <label className="block text-xs text-zinc-500 mb-1">
                    {isApi
                      ? 'Target URL (auto-filled from preset)'
                      : hc.type === 'http' ? 'URL' : hc.type === 'tcp' ? 'Host:Port' : 'Host (blank = use IP)'}
                  </label>
                  <input
                    type="text"
                    value={hc.target || ''}
                    onChange={e =>
                      update({
                        healthCheck: { ...hc, target: e.target.value || undefined },
                      })
                    }
                    placeholder={
                      isApi && hc.apiPreset
                        ? PRESET_DEFAULTS[hc.apiPreset].defaultPath(device.ip || 'IP')
                        : hc.type === 'http'
                        ? 'https://example.com'
                        : hc.type === 'tcp'
                        ? '192.168.1.1:443'
                        : device.ip || 'IP address'
                    }
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Interval</label>
                  <select
                    value={hc.interval}
                    onChange={e =>
                      update({
                        healthCheck: { ...hc, interval: parseInt(e.target.value, 10) },
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

        {healthStatus?.metrics && Object.keys(healthStatus.metrics).length > 0 && (
          <div className="pt-2 border-t border-zinc-700/50">
            <label className="block text-xs text-zinc-500 mb-2">Metrics</label>
            <div className="space-y-1">
              {Object.entries(healthStatus.metrics).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">{METRIC_LABELS[key] || key}</span>
                  <span className={
                    key === 'cpuPercent' || key === 'ramPercent'
                      ? (value as number) > 90 ? 'text-red-400' : (value as number) > 70 ? 'text-yellow-400' : 'text-emerald-400'
                      : 'text-zinc-200'
                  }>
                    {formatMetricValue(key, value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

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
