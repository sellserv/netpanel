import { useState, useRef, useEffect, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { X, Minimize2, Maximize2 } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'
import type { SshConnectParams } from './SshConnectDialog'

interface SshTab {
  id: string
  label: string
  params: SshConnectParams
}

interface SshDrawerProps {
  tabs: SshTab[]
  onCloseTab: (id: string) => void
  onCloseAll: () => void
}

function SshTerminal({ tab }: { tab: SshTab }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#18181b',
        foreground: '#e4e4e7',
        cursor: '#e4e4e7',
      },
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()

    term.writeln('Connecting...')

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsPath = window.location.pathname.replace(/\/[^/]*$/, '/') + 'ws/ssh'
    const ws = new WebSocket(`${proto}//${window.location.host}${wsPath}`)

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'connect',
        host: tab.params.host,
        port: tab.params.port,
        username: tab.params.username,
        password: tab.params.password,
        privateKey: tab.params.privateKey,
      }))
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'connected') {
        term.clear()
        const dims = fit.proposeDimensions()
        if (dims) {
          ws.send(JSON.stringify({ type: 'resize', rows: dims.rows, cols: dims.cols }))
        }
      } else if (msg.type === 'data') {
        term.write(Uint8Array.from(atob(msg.data), c => c.charCodeAt(0)))
      } else if (msg.type === 'error') {
        term.writeln(`\r\n\x1b[31mError: ${msg.message}\x1b[0m`)
      } else if (msg.type === 'closed') {
        term.writeln('\r\n\x1b[33mConnection closed.\x1b[0m')
      }
    }

    ws.onclose = () => {
      term.writeln('\r\n\x1b[33mDisconnected.\x1b[0m')
    }

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data: btoa(data) }))
      }
    })

    const resizeObserver = new ResizeObserver(() => {
      fit.fit()
      if (ws.readyState === WebSocket.OPEN) {
        const dims = fit.proposeDimensions()
        if (dims) {
          ws.send(JSON.stringify({ type: 'resize', rows: dims.rows, cols: dims.cols }))
        }
      }
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      ws.close()
      term.dispose()
    }
  }, [tab])

  return <div ref={containerRef} className="w-full h-full" />
}

export default function SshDrawer({ tabs, onCloseTab, onCloseAll }: SshDrawerProps) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || '')
  const [height, setHeight] = useState(300)
  const [minimized, setMinimized] = useState(false)
  const dragging = useRef(false)

  useEffect(() => {
    if (tabs.length > 0 && !tabs.find(t => t.id === activeTab)) {
      setActiveTab(tabs[tabs.length - 1].id)
    }
  }, [tabs, activeTab])

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    const startY = e.clientY
    const startHeight = height

    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = startY - e.clientY
      setHeight(Math.max(150, Math.min(window.innerHeight - 100, startHeight + delta)))
    }

    const onUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [height])

  if (tabs.length === 0) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-900 border-t border-zinc-700 flex flex-col"
      style={{ height: minimized ? 36 : height }}
    >
      {!minimized && (
        <div
          className="h-1 cursor-row-resize hover:bg-blue-500/50 transition-colors"
          onMouseDown={onResizeStart}
        />
      )}

      <div className="flex items-center bg-zinc-800 border-b border-zinc-700 px-2 h-[35px] shrink-0">
        <div className="flex-1 flex items-center gap-1 overflow-x-auto">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-t cursor-pointer shrink-0 ${
                activeTab === tab.id ? 'bg-zinc-900 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              onClick={() => { setActiveTab(tab.id); setMinimized(false) }}
            >
              <span>{tab.label}</span>
              <button
                onClick={e => { e.stopPropagation(); onCloseTab(tab.id) }}
                className="hover:text-red-400"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button onClick={() => setMinimized(!minimized)} className="text-zinc-500 hover:text-zinc-300 p-1">
            {minimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          </button>
          <button onClick={onCloseAll} className="text-zinc-500 hover:text-red-400 p-1">
            <X size={14} />
          </button>
        </div>
      </div>

      {!minimized && (
        <div className="flex-1 relative">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className="absolute inset-0 p-1"
              style={{ display: activeTab === tab.id ? 'block' : 'none' }}
            >
              <SshTerminal tab={tab} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
