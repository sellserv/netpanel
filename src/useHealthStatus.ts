import { useState, useEffect, useCallback, useRef } from 'react'
import type { HealthStatus } from './types'

export function useHealthStatus(topologyId: string | null) {
  const [statuses, setStatuses] = useState<Map<string, HealthStatus>>(new Map())
  const wsRef = useRef<WebSocket | null>(null)

  // Fetch initial health results via REST
  useEffect(() => {
    if (!topologyId) return
    fetch(`/api/topologies/${topologyId}/health`)
      .then(res => res.json())
      .then((results: HealthStatus[]) => {
        const map = new Map<string, HealthStatus>()
        for (const r of results) {
          map.set(r.deviceId, r)
        }
        setStatuses(map)
      })
      .catch(() => {})
  }, [topologyId])

  // WebSocket for live updates
  useEffect(() => {
    if (!topologyId) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', topologyId }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'health') {
          setStatuses(prev => {
            const next = new Map(prev)
            next.set(msg.deviceId, {
              deviceId: msg.deviceId,
              status: msg.status,
              latency: msg.latency,
              error: msg.error,
              checkedAt: msg.checkedAt,
            })
            return next
          })
        }
      } catch {}
    }

    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null
      }
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [topologyId])

  const getStatus = useCallback((deviceId: string): HealthStatus | undefined => {
    return statuses.get(deviceId)
  }, [statuses])

  return { statuses, getStatus }
}
