import { WebSocketServer } from 'ws'
import type { WebSocket } from 'ws'
import { Client as SSHClient } from 'ssh2'

export const sshWss = new WebSocketServer({ noServer: true })

export function setupSshWebSocket() {
  sshWss.on('connection', (ws: WebSocket) => {
    let ssh: SSHClient | null = null

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())

        if (msg.type === 'connect') {
          const { host, port, username, password, privateKey } = msg

          if (!host || !username) {
            ws.send(JSON.stringify({ type: 'error', message: 'host and username required' }))
            return
          }

          ssh = new SSHClient()

          ssh.on('ready', () => {
            ws.send(JSON.stringify({ type: 'connected' }))

            ssh!.shell({ term: 'xterm-256color' }, (err, stream) => {
              if (err) {
                ws.send(JSON.stringify({ type: 'error', message: err.message }))
                return
              }

              stream.on('data', (data: Buffer) => {
                if (ws.readyState === ws.OPEN) {
                  ws.send(JSON.stringify({ type: 'data', data: data.toString('base64') }))
                }
              })

              stream.on('close', () => {
                if (ws.readyState === ws.OPEN) {
                  ws.send(JSON.stringify({ type: 'closed' }))
                }
                ssh?.end()
              })

              ws.on('message', (raw) => {
                try {
                  const msg = JSON.parse(raw.toString())
                  if (msg.type === 'data') {
                    stream.write(Buffer.from(msg.data, 'base64'))
                  } else if (msg.type === 'resize') {
                    stream.setWindow(msg.rows, msg.cols, 0, 0)
                  }
                } catch {}
              })
            })
          })

          ssh.on('error', (err) => {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ type: 'error', message: err.message }))
            }
          })

          ssh.on('close', () => {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ type: 'closed' }))
            }
          })

          const connectConfig: Record<string, unknown> = {
            host,
            port: port || 22,
            username,
            readyTimeout: 20000,
            debug: (msg: string) => {
              console.log(`[SSH ${host}] ${msg}`)
            },
          }

          if (privateKey) {
            connectConfig.privateKey = privateKey
          } else if (password) {
            connectConfig.password = password
            connectConfig.tryKeyboard = true
          }

          ssh.on('keyboard-interactive', (_name, _instructions, _instructionsLang, prompts, finish) => {
            finish(prompts.map(() => password || ''))
          })

          ssh.connect(connectConfig as Parameters<SSHClient['connect']>[0])
        } else if (msg.type === 'disconnect') {
          ssh?.end()
          ssh = null
        }
      } catch {}
    })

    ws.on('close', () => {
      ssh?.end()
      ssh = null
    })
  })
}
