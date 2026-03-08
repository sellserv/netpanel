import { useState } from 'react'
import { discoverProxmoxVms } from '../api'
import type { ProxmoxVm } from '../api'
import { X, Search, Monitor, Box } from 'lucide-react'

interface VmDiscoveryModalProps {
  onAdd: (vms: Array<{ vmid: number; name: string; type: 'qemu' | 'lxc'; node: string; host: string; token: string }>) => void
  onClose: () => void
}

export default function VmDiscoveryModal({ onAdd, onClose }: VmDiscoveryModalProps) {
  const [host, setHost] = useState('')
  const [token, setToken] = useState('')
  const [vms, setVms] = useState<ProxmoxVm[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetched, setFetched] = useState(false)

  const discover = async () => {
    if (!host || !token) return
    setLoading(true)
    setError(null)
    try {
      const result = await discoverProxmoxVms(host, token)
      setVms(result)
      setFetched(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const toggleVm = (vmid: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(vmid)) next.delete(vmid)
      else next.add(vmid)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === vms.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(vms.map(v => v.vmid)))
    }
  }

  const handleAdd = () => {
    const toAdd = vms
      .filter(v => selected.has(v.vmid))
      .map(v => ({ vmid: v.vmid, name: v.name, type: v.type, node: v.node, host, token }))
    onAdd(toAdd)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl w-[32rem] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700">
          <h3 className="text-lg font-semibold text-zinc-100">Discover Proxmox VMs</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Proxmox Host IP</label>
            <input
              type="text"
              value={host}
              onChange={e => setHost(e.target.value)}
              placeholder="192.168.1.100"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">API Token</label>
            <input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="user@pam!tokenid=secret-value"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <button
            onClick={discover}
            disabled={loading || !host || !token}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white"
          >
            <Search size={14} />
            {loading ? 'Scanning...' : 'Discover'}
          </button>

          {error && <p className="text-sm text-red-400">{error}</p>}

          {fetched && vms.length === 0 && <p className="text-sm text-zinc-400">No VMs or containers found.</p>}

          {vms.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-500">{vms.length} found</span>
                <button onClick={toggleAll} className="text-xs text-blue-400 hover:text-blue-300">
                  {selected.size === vms.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {vms.map(vm => (
                  <label key={vm.vmid} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-zinc-700/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(vm.vmid)}
                      onChange={() => toggleVm(vm.vmid)}
                      className="rounded bg-zinc-900 border-zinc-600"
                    />
                    {vm.type === 'qemu' ? <Monitor size={14} className="text-indigo-400" /> : <Box size={14} className="text-cyan-400" />}
                    <span className="text-sm text-zinc-200 flex-1">{vm.name}</span>
                    <span className="text-xs text-zinc-500">VMID {vm.vmid}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${vm.status === 'running' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-zinc-700 text-zinc-400'}`}>
                      {vm.status}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {selected.size > 0 && (
          <div className="px-6 py-4 border-t border-zinc-700">
            <button
              onClick={handleAdd}
              className="w-full px-4 py-2 text-sm rounded bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Add {selected.size} Device{selected.size > 1 ? 's' : ''} to Canvas
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
