import { WebSocketServer } from 'ws'
import type { WebSocket } from 'ws'
import type { CheckResult } from './monitor.js'

interface SubscribedClient {
  ws: WebSocket
  topologyId: string
}

const clients = new Set<SubscribedClient>()

export const healthWss = new WebSocketServer({ noServer: true })

export function setupWebSocket() {
  healthWss.on('connection', (ws) => {
    let client: SubscribedClient | null = null

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'subscribe' && typeof msg.topologyId === 'string') {
          if (client) clients.delete(client)
          client = { ws, topologyId: msg.topologyId }
          clients.add(client)
        }
      } catch {}
    })

    ws.on('close', () => {
      if (client) clients.delete(client)
    })
  })
}

export function broadcastHealthResult(result: CheckResult) {
  const payload = JSON.stringify({
    type: 'health',
    deviceId: result.deviceId,
    status: result.status,
    latency: result.latency,
    error: result.error,
    metrics: result.metrics,
    checkedAt: result.checkedAt,
  })

  for (const client of clients) {
    if (client.topologyId === result.topologyId && client.ws.readyState === client.ws.OPEN) {
      client.ws.send(payload)
    }
  }
}
