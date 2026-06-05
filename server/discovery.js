import { createServer } from 'http'
import dgram from 'dgram'

const HTTP_PORT = parseInt(process.argv[2]) || 3456
const UDP_PORT = 3457
const rooms = new Map()

const srv = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return }

  if (req.method === 'GET' && req.url === '/rooms') {
    const now = Date.now()
    for (const [id, r] of rooms) { if (now - r.ts > 60000) rooms.delete(id) }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify([...rooms.values()].map(r => ({ id: r.id, name: r.name }))))
    return
  }

  if (req.method === 'POST' && req.url === '/register') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const { id, name } = JSON.parse(body)
        if (id) { rooms.set(id, { id, name: name || id, ts: Date.now() }); res.writeHead(200); res.end('ok') }
        else { res.writeHead(400); res.end('missing id') }
      } catch { res.writeHead(400); res.end('bad json') }
    })
    return
  }

  if ((req.method === 'DELETE' || req.method === 'POST') && req.url === '/unregister') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const { id } = JSON.parse(body)
        if (id) rooms.delete(id)
        res.writeHead(200); res.end('ok')
      } catch { res.writeHead(400); res.end('bad json') }
    })
    return
  }

  res.writeHead(404); res.end()
})

srv.listen(HTTP_PORT, () => console.log(`Discovery server on port ${HTTP_PORT}`))

const udp = dgram.createSocket('udp4')
udp.on('message', (msg, rinfo) => {
  if (msg.toString() === 'SNAKE_DISCOVER') {
    const resp = Buffer.from('SNAKE_DISCOVER_ACK')
    udp.send(resp, 0, resp.length, rinfo.port, rinfo.address)
  }
})
udp.bind(UDP_PORT, () => {
  udp.setBroadcast(true)
  console.log(`UDP discovery on port ${UDP_PORT}`)
})
