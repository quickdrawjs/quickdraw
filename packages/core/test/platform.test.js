// @vitest-environment jsdom
// The rendering seam: explicit backend injection for non-browser renderers.
// These tests pass fakes through opts / setShapePlatform and assert the
// fakes (not browser globals) are what the engine uses.
import { describe, it, expect, afterEach } from 'vitest'
import {
  drawShape, textLayout, resetTextLayouts,
  setShapePlatform, resetShapePlatform, sortShapesForRender,
} from '../src/shapes.js'
import { themeOf } from '../src/palette.js'
import { Store } from '../src/store.js'

const theme = themeOf('light')
const store = new Store()

afterEach(() => {
  resetShapePlatform()
  resetTextLayouts()
})

// minimal 2d context: records calls, returns canned values
const stubCtx = () => {
  const calls = []
  const ctx = new Proxy({
    canvas: {},
    measureText: () => ({ width: 10, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 }),
    createPattern: () => ({ token: 'pattern' }),
    get fillStyle() { return this._fillStyle },
    set fillStyle(v) { this._fillStyle = v },
  }, {
    get(t, k) {
      if (k in t) return t[k]
      return (...a) => { calls.push([k, a]); return undefined }
    },
    set(t, k, v) { t[k] = v; return true },
  })
  return { ctx, calls }
}

class FakePath {
  constructor() { FakePath.constructed++ }
  moveTo() {}
  lineTo() {}
  quadraticCurveTo() {}
  bezierCurveTo() {}
  ellipse() {}
  closePath() {}
}
FakePath.constructed = 0

describe('platform injection', () => {
  it('drawShape builds geo paths with the injected Path2D class', () => {
    FakePath.constructed = 0
    const { ctx } = stubCtx()
    drawShape(ctx, {
      id: 'g', typeName: 'shape', type: 'geo', x: 0, y: 0, rot: 0, z: 1,
      props: { geo: 'rectangle', w: 10, h: 10, color: 'black', size: 'm', dash: 'solid', fill: 'none' },
    }, { theme, store, Path2D: FakePath, patternCache: new Map() })
    expect(FakePath.constructed).toBeGreaterThan(0)
  })

  it('pattern fills use the per-render cache, not the shared one', () => {
    const { ctx } = stubCtx()
    const mine = new Map()
    const shape = {
      id: 'g', typeName: 'shape', type: 'geo', x: 0, y: 0, rot: 0, z: 1,
      props: { geo: 'rectangle', w: 10, h: 10, color: 'black', size: 'm', dash: 'solid', fill: 'pattern' },
    }
    drawShape(ctx, shape, { theme, store, Path2D: FakePath, patternCache: mine })
    expect(mine.size).toBe(1)
    expect(ctx.fillStyle).toEqual({ token: 'pattern' })
  })

  it('image shapes draw from opts.images without touching the browser loader', () => {
    const seen = []
    const ctx = stubCtx().ctx
    ctx.drawImage = (...a) => seen.push(a)
    ctx.clip = () => {}
    ctx.roundRect = () => {}
    const decoded = { fake: 'bitmap' }
    drawShape(ctx, {
      id: 'i', typeName: 'shape', type: 'image', x: 0, y: 0, rot: 0, z: 1,
      props: { w: 40, h: 30, assetId: 'asset:missing-from-store' },
    }, { theme, store, images: new Map([['asset:missing-from-store', decoded]]) })
    // asset is absent from the store, yet the pre-decoded bitmap draws:
    // the loader (and its placeholder) is fully bypassed
    expect(seen).toEqual([[decoded, 0, 0, 40, 30]])
  })

  it('text layout measures with the injected context', () => {
    const measured = []
    setShapePlatform({
      measureCtx: { font: '', measureText: (t) => { measured.push(t); return { width: t.length * 7 } } },
    })
    const l = textLayout({
      id: 't', typeName: 'shape', type: 'text', x: 0, y: 0, rot: 0, z: 1,
      props: { text: 'hello', size: 'm', color: 'black', font: 'draw' },
    })
    expect(measured.length).toBeGreaterThan(0)
    expect(l.w).toBeGreaterThan(0)
  })

  it('sortShapesForRender keeps highlighters beneath, z-ordered within groups', () => {
    const s = (id, type, z) => ({ id, typeName: 'shape', type, x: 0, y: 0, rot: 0, z, props: {} })
    expect(sortShapesForRender([
      s('geo-hi', 'geo', 99), s('hl-lo', 'highlight', 1), s('img', 'image', 50),
    ]).map((x) => x.id)).toEqual(['hl-lo', 'img', 'geo-hi'])
  })
})
