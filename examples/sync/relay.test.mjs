import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import WebSocket from 'ws'
import { Store } from '../../packages/core/src/store.js'
import { createSyncServer } from './relay.mjs'

const apps = new Set()
const sockets = new Set()

afterEach(async () => {
  for (const socket of sockets) socket.terminate()
  sockets.clear()
  await Promise.all([...apps].map((app) => app.close()))
  apps.clear()
})

async function setup() {
  const app = createSyncServer()
  apps.add(app)
  const { port } = await app.listen(0)
  return { app, url: `ws://127.0.0.1:${port}` }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    sockets.add(socket)
    const timer = setTimeout(() => {
      socket.terminate()
      reject(new Error('timed out opening WebSocket'))
    }, 1000)
    socket.once('open', () => {
      clearTimeout(timer)
      resolve(socket)
    })
    socket.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

function nextMessage(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage)
      reject(new Error('timed out waiting for WebSocket message'))
    }, 1000)
    const onMessage = (data, isBinary) => {
      clearTimeout(timer)
      resolve({ data, isBinary })
    }
    socket.once('message', onMessage)
    socket.once('error', (error) => {
      clearTimeout(timer)
      socket.off('message', onMessage)
      reject(error)
    })
  })
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(check, timeout = 1000) {
  const started = Date.now()
  while (!check()) {
    if (Date.now() - started > timeout) throw new Error('timed out waiting for condition')
    await wait(10)
  }
}

describe('sync relay', () => {
  it('forwards bytes to peers without echoing to the sender', async () => {
    const { url } = await setup()
    const [a, b] = await Promise.all([connect(url), connect(url)])
    let echoed = false
    a.on('message', () => { echoed = true })

    const received = nextMessage(b)
    a.send(Buffer.from([0, 255, 1, 2]))

    const message = await received
    assert.deepEqual([...message.data], [0, 255, 1, 2])
    assert.equal(message.isBinary, true)
    await wait(50)
    assert.equal(echoed, false)
  })

  it('forwards in both directions and keeps serving after a peer disconnects', async () => {
    const { url } = await setup()
    const [a, b, c] = await Promise.all([connect(url), connect(url), connect(url)])

    const fromB = nextMessage(a)
    b.send('from b')
    assert.equal((await fromB).data.toString(), 'from b')

    await new Promise((resolve) => {
      b.once('close', resolve)
      b.close()
    })
    sockets.delete(b)

    const fromA = nextMessage(c)
    a.send('from a')
    assert.equal((await fromA).data.toString(), 'from a')
  })

  it('keeps remote records out of the receiving store undo history', async () => {
    const { url } = await setup()
    const [socketA, socketB] = await Promise.all([connect(url), connect(url)])
    const storeA = new Store()
    const storeB = new Store()
    const localB = { id: 'shape:local-b', typeName: 'shape', type: 'rect', x: 0, y: 0, z: 1, props: {} }
    const remoteA = { id: 'shape:remote-a', typeName: 'shape', type: 'rect', x: 10, y: 10, z: 2, props: {} }

    storeB.put(localB)
    storeA.listen((diff) => socketA.send(JSON.stringify(diff)), { source: 'user' })
    storeB.listen((diff) => socketB.send(JSON.stringify(diff)), { source: 'user' })
    socketA.on('message', (data) => storeA.applyDiff(JSON.parse(data.toString()), 'remote'))
    socketB.on('message', (data) => storeB.applyDiff(JSON.parse(data.toString()), 'remote'))

    storeA.put(remoteA)
    await waitFor(() => storeB.has(remoteA.id))

    assert.equal(storeB.undos.length, 1)
    storeB.undo()
    assert.equal(storeB.has(localB.id), false)
    assert.deepEqual(storeB.get(remoteA.id), remoteA)
  })
})
