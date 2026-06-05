import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'
import dgram from 'dgram'

function lanDiscovery(): Plugin {
  const discovered = new Set<string>()
  let udp: dgram.Socket | null = null
  let timer: ReturnType<typeof setInterval> | null = null

  function broadcast() {
    const sock = dgram.createSocket('udp4')
    sock.on('error', () => {})
    sock.bind(3458, () => {
      sock.setBroadcast(true)
      const msg = Buffer.from('SNAKE_DISCOVER')
      sock.send(msg, 0, msg.length, 3457, '255.255.255.255')
      setTimeout(() => sock.close(), 1000)
    })
  }

  return {
    name: 'lan-discovery',
    configureServer(server) {
      udp = dgram.createSocket('udp4')
      const s = udp
      s.on('message', (msg, rinfo) => {
        if (msg.toString() === 'SNAKE_DISCOVER_ACK') {
          discovered.add(rinfo.address)
        }
      })
      s.bind(3458, () => s.setBroadcast(true))

      broadcast()
      timer = setInterval(broadcast, 5000)

      server.middlewares.use('/api/rooms', async (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        try {
          const results = await Promise.all(
            [...discovered].map(ip =>
              fetch(`http://${ip}:3456/rooms`).then(r => r.json()).catch(() => []),
            ),
          )
          res.end(JSON.stringify(results.flat()))
        } catch {
          res.end('[]')
        }
      })
    },
    closeBundle() {
      if (timer) clearInterval(timer)
      udp?.close()
    },
  }
}

export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
    lanDiscovery(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
