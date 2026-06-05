import { WebSocketServer } from 'ws'

const PORT = parseInt(process.argv[2]) || 3000
const wss = new WebSocketServer({ port: PORT })

let host = null
let client = null

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString())
    switch (msg.type) {
      case 'join':
        if (msg.role === 'host') {
          host = ws
          ws.send(JSON.stringify({ type: 'joined', role: 'host' }))
          console.log('Host connected')
        } else {
          client = ws
          ws.send(JSON.stringify({ type: 'joined', role: 'client' }))
          console.log('Client connected')
          if (host) host.send(JSON.stringify({ type: 'client-joined' }))
        }
        break
      case 'input':
        if (host && ws === client) host.send(JSON.stringify(msg))
        break
      case 'state':
        if (client && ws === host) client.send(JSON.stringify(msg))
        break
    }
  })

  ws.on('close', () => {
    if (ws === host) {
      host = null
      console.log('Host disconnected')
      if (client) { try { client.send(JSON.stringify({ type: 'disconnected' })) } catch {}; client.close() }
    }
    if (ws === client) {
      client = null
      console.log('Client disconnected')
      if (host) { try { host.send(JSON.stringify({ type: 'client-left' })) } catch {} }
    }
  })
})

console.log(`LAN server running on port ${PORT}`)
