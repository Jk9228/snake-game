import { createServer } from 'http'

const PORT = parseInt(process.argv[2]) || 3456
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

srv.listen(PORT, () => console.log(`Discovery server on port ${PORT}`))
