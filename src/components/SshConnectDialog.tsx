import { useState } from 'react'
import { X, Key, Lock } from 'lucide-react'

export interface SshConnectParams {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  label: string
}

interface SshConnectDialogProps {
  defaultHost?: string
  defaultLabel?: string
  onConnect: (params: SshConnectParams) => void
  onClose: () => void
}

export default function SshConnectDialog({ defaultHost, defaultLabel, onConnect, onClose }: SshConnectDialogProps) {
  const [host, setHost] = useState(defaultHost || '')
  const [port, setPort] = useState(22)
  const [username, setUsername] = useState('')
  const [authMode, setAuthMode] = useState<'password' | 'key'>('password')
  const [password, setPassword] = useState('')
  const [privateKey, setPrivateKey] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!host || !username) return
    onConnect({
      host,
      port,
      username,
      password: authMode === 'password' ? password : undefined,
      privateKey: authMode === 'key' ? privateKey : undefined,
      label: defaultLabel || `${username}@${host}`,
    })
  }

  const handleKeyFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then(setPrivateKey)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl w-96" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700">
          <h3 className="text-lg font-semibold text-zinc-100">SSH Connect</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-zinc-500 mb-1">Host</label>
              <input
                type="text"
                value={host}
                onChange={e => setHost(e.target.value)}
                placeholder="192.168.1.1"
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                required
              />
            </div>
            <div className="w-20">
              <label className="block text-xs text-zinc-500 mb-1">Port</label>
              <input
                type="number"
                value={port}
                onChange={e => setPort(parseInt(e.target.value) || 22)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="root"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-2">Auth Method</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAuthMode('password')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded ${authMode === 'password' ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'}`}
              >
                <Lock size={14} /> Password
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('key')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded ${authMode === 'key' ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'}`}
              >
                <Key size={14} /> SSH Key
              </button>
            </div>
          </div>

          {authMode === 'password' ? (
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Private Key</label>
              <textarea
                value={privateKey}
                onChange={e => setPrivateKey(e.target.value)}
                placeholder="Paste private key or use file picker below"
                rows={4}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none font-mono text-xs"
              />
              <input
                type="file"
                onChange={handleKeyFile}
                className="mt-1 text-xs text-zinc-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-zinc-700 file:text-zinc-300 hover:file:bg-zinc-600"
              />
            </div>
          )}

          <button
            type="submit"
            className="w-full px-4 py-2 text-sm rounded bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Connect
          </button>
        </form>
      </div>
    </div>
  )
}
