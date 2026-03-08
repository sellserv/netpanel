import type { Device, HealthCheck, HealthStatus, ApiPreset } from '../types'
import { DEVICE_CONFIGS } from '../constants'
import type { Action } from '../state'
import { X, Terminal, Play, Square, RotateCcw } from 'lucide-react'

const PRESET_DEFAULTS: Record<ApiPreset, { label: string; defaultPath: (ip: string) => string; needsToken: boolean }> = {
  proxmox: { label: 'Proxmox', defaultPath: (ip) => `https://${ip}:8006/api2/json/nodes`, needsToken: true },
  truenas: { label: 'TrueNAS', defaultPath: (ip) => `http://${ip}/api/v2.0/system/info`, needsToken: true },
  tailscale: { label: 'Tailscale', defaultPath: () => `https://api.tailscale.com/api/v2/tailnet/-/devices`, needsToken: true },
  docker: { label: 'Docker', defaultPath: (ip) => `http://${ip}:2375/v1.43/info`, needsToken: false },
}

const METRIC_LABELS: Record<string, string> = {
  cpuPercent: 'CPU',
  ramPercent: 'RAM',
  diskPercent: 'Disk',
  uptime: 'Uptime',
  nodeCount: 'Nodes',
  version: 'Version',
  vmStatus: 'Status',
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
  if ((key === 'cpuPercent' || key === 'ramPercent' || key === 'diskPercent') && typeof value === 'number') return `${value}%`
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

interface ConfigPanelProps {
  device: Device
  dispatch: React.Dispatch<Action>
  healthStatus?: HealthStatus
  allDevices: Device[]
  onSshConnect: (host: string, label: string) => void
  onVmAction: (action: 'start' | 'shutdown' | 'reboot', device: Device) => void
}

export default function ConfigPanel({ device, dispatch, healthStatus, allDevices, onSshConnect, onVmAction }: ConfigPanelProps) {
  const update = (changes: Partial<Pick<Device, 'label' | 'ip' | 'notes' | 'type' | 'healthCheck' | 'proxmoxVm'>>) => {
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
                    key === 'cpuPercent' || key === 'ramPercent' || key === 'diskPercent'
                      ? (value as number) > 90 ? 'text-red-400' : (value as number) > 70 ? 'text-yellow-400' : 'text-emerald-400'
                      : key === 'vmStatus'
                      ? value === 'running' ? 'text-emerald-400' : 'text-red-400'
                      : 'text-zinc-200'
                  }>
                    {formatMetricValue(key, value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(() => {
          const proxmoxHosts = allDevices.filter(d => d.healthCheck?.type === 'api' && d.healthCheck?.apiPreset === 'proxmox' && d.id !== device.id)
          const showVmSection = device.proxmoxVm || proxmoxHosts.length > 0

          if (!showVmSection) return null

          const vm = device.proxmoxVm

          return (
            <div className="pt-2 border-t border-zinc-700/50">
              <label className="block text-xs text-zinc-500 mb-2">Proxmox VM Link</label>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Proxmox Host</label>
                  <select
                    value={vm?.host || ''}
                    onChange={e => {
                      const hostDevice = allDevices.find(d => d.ip === e.target.value)
                      if (e.target.value && hostDevice) {
                        update({
                          proxmoxVm: {
                            host: e.target.value,
                            node: vm?.node || '',
                            vmid: vm?.vmid || 0,
                            type: vm?.type || 'qemu',
                          },
                          healthCheck: {
                            type: 'api',
                            apiPreset: 'proxmox',
                            apiToken: hostDevice.healthCheck?.apiToken,
                            interval: device.healthCheck?.interval || 60,
                          },
                        })
                      } else {
                        update({ proxmoxVm: undefined })
                      }
                    }}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                  >
                    <option value="">None</option>
                    {proxmoxHosts.map(h => (
                      <option key={h.id} value={h.ip}>{h.label} ({h.ip})</option>
                    ))}
                  </select>
                </div>

                {vm && (
                  <>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-xs text-zinc-500 mb-1">VMID</label>
                        <input
                          type="number"
                          value={vm.vmid || ''}
                          onChange={e => update({ proxmoxVm: { ...vm, vmid: parseInt(e.target.value) || 0 } })}
                          placeholder="100"
                          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                        />
                      </div>
                      <div className="w-24">
                        <label className="block text-xs text-zinc-500 mb-1">Type</label>
                        <select
                          value={vm.type}
                          onChange={e => update({ proxmoxVm: { ...vm, type: e.target.value as 'qemu' | 'lxc' } })}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                        >
                          <option value="qemu">VM</option>
                          <option value="lxc">LXC</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Node</label>
                      <input
                        type="text"
                        value={vm.node}
                        onChange={e => update({ proxmoxVm: { ...vm, node: e.target.value } })}
                        placeholder="pve"
                        className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                      />
                    </div>

                    {vm.vmid > 0 && vm.node && (
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">Power</label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => onVmAction('start', device)}
                            disabled={healthStatus?.metrics?.vmStatus === 'running'}
                            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Play size={12} /> Start
                          </button>
                          <button
                            onClick={() => onVmAction('shutdown', device)}
                            disabled={healthStatus?.metrics?.vmStatus !== 'running'}
                            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-red-900/30 text-red-400 hover:bg-red-900/50 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Square size={12} /> Shutdown
                          </button>
                          <button
                            onClick={() => onVmAction('reboot', device)}
                            disabled={healthStatus?.metrics?.vmStatus !== 'running'}
                            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <RotateCcw size={12} /> Reboot
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })()}

        {device.ip && (
          <div className="pt-2 border-t border-zinc-700/50">
            <button
              onClick={() => onSshConnect(device.ip, device.label)}
              className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-sm bg-zinc-700/50 text-zinc-300 rounded hover:bg-zinc-700 transition-colors"
            >
              <Terminal size={14} /> SSH Terminal
            </button>
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
