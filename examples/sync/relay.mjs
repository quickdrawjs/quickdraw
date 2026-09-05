import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { WebSocket, WebSocketServer } from 'ws'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

function serve(root, req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end()
    return
  }

  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/') {
    res.writeHead(302, { Location: '/examples/sync/' }).end()
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    res.writeHead(400).end('Bad request')
    return
  }

  const relative = pathname.endsWith('/') ? `${pathname}index.html` : pathname
  const file = resolve(root, `.${relative}`)
  if (file !== root && !file.startsWith(`${root}${sep}`)) {
    res.writeHead(403).end('Forbidden')
    return
  }

  stat(file).then((info) => {
    if (!info.isFile()) throw new Error('not a file')
    res.writeHead(200, {
      'Content-Length': info.size,
      'Content-Type': mimeTypes[extname(file)] || 'application/octet-stream',
    })
    if (req.method === 'HEAD') res.end()
    else createReadStream(file).pipe(res)
  }).catch(() => res.writeHead(404).end('Not found'))
}

export function createSyncServer({ root = repoRoot } = {}) {
  const server = createServer((req, res) => serve(root, req, res))
  const relay = new WebSocketServer({ server })

  relay.on('connection', (socket) => {
    socket.on('message', (data, isBinary) => {
      for (const peer of relay.clients) {
        if (peer !== socket && peer.readyState === WebSocket.OPEN) {
          peer.send(data, { binary: isBinary })
        }
      }
    })
  })

  return {
    server,
    relay,
    listen(port = 8080, host = '127.0.0.1') {
      return new Promise((resolveListen, reject) => {
        const onError = (error) => reject(error)
        server.once('error', onError)
        server.listen(port, host, () => {
          server.off('error', onError)
          resolveListen(server.address())
        })
      })
    },
    close() {
      for (const socket of relay.clients) socket.terminate()
      return new Promise((resolveClose, reject) => {
        relay.close(() => server.close((error) => error ? reject(error) : resolveClose()))
      })
    },
  }
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isMain) {
  const app = createSyncServer()
  const port = Number(process.env.PORT || 8080)
  const address = await app.listen(port)
  console.log(`Quickdraw sync example: http://localhost:${address.port}/examples/sync/`)

  const stop = async () => {
    await app.close()
    process.exit(0)
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}
