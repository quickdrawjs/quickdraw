// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { localBounds, pageBounds, hitShape, marqueeHits, scaleShape, textLayout, geoOutline, resetTextLayouts } from '../src/shapes.js'
import { Store } from '../src/store.js'

const geo = (over = {}, props = {}) => ({
  id: 'g1', typeName: 'shape', type: 'geo', x: 10, y: 10, rot: 0, z: 1,
  props: { geo: 'rectangle', w: 100, h: 50, color: 'black', size: 'm', dash: 'solid', fill: 'none', font: 'draw', ...props },
  ...over,
})

describe('bounds', () => {
  it('geo localBounds is its box; pageBounds adds position', () => {
    expect(localBounds(geo())).toEqual({ x: 0, y: 0, w: 100, h: 50 })
    expect(pageBounds(geo())).toEqual({ x: 10, y: 10, w: 100, h: 50 })
  })

  it('rotation grows the axis-aligned page bounds', () => {
    const r = pageBounds(geo({ rot: Math.PI / 4 }))
    expect(r.w).toBeGreaterThan(100)
    expect(r.h).toBeGreaterThan(50)
    // center is preserved
    expect(r.x + r.w / 2).toBeCloseTo(60)
    expect(r.y + r.h / 2).toBeCloseTo(35)
  })

  it('draw bounds cover the points plus stroke margin', () => {
    const d = {
      id: 'd1', typeName: 'shape', type: 'draw', x: 0, y: 0, rot: 0, z: 1,
      props: { pts: [0, 0, 0.5, 50, 20, 0.5], size: 'm', color: 'black', done: true },
    }
    const b = localBounds(d)
    expect(b.x).toBeLessThan(0)
    expect(b.w).toBeGreaterThan(50)
  })

  it('line bounds include negative deltas and arrow bend', () => {
    const line = { id: 'l', typeName: 'shape', type: 'line', x: 0, y: 0, rot: 0, z: 1, props: { dx: -40, dy: 30, size: 'm', color: 'black' } }
    expect(localBounds(line)).toEqual({ x: -40, y: 0, w: 40, h: 30 })
    const arrow = { ...line, type: 'arrow', props: { ...line.props, bend: 10 } }
    expect(localBounds(arrow).w).toBeGreaterThan(40)
    const bentLine = { ...line, props: { ...line.props, bend: 10 } }
    expect(localBounds(bentLine).w).toBeGreaterThan(40)
  })
})

describe('hit testing', () => {
  const store = new Store()

  it('unfilled geo hits only near the edge', () => {
    const s = geo()
    expect(hitShape(s, 10, 10, 4, store)).toBe(true) // corner
    expect(hitShape(s, 60, 35, 4, store)).toBe(false) // center of unfilled rect
  })

  it('filled geo hits anywhere inside', () => {
    const s = geo({}, { fill: 'solid' })
    expect(hitShape(s, 60, 35, 4, store)).toBe(true)
  })

  it('ellipse edge vs inside honors fill', () => {
    const s = geo({}, { geo: 'ellipse' })
    expect(hitShape(s, 60, 35, 4, store)).toBe(false) // hollow center
    expect(hitShape(s, 10 + 50, 10, 4, store)).toBe(true) // top edge midpoint
  })

  it('line hits along its length within tolerance', () => {
    const line = { id: 'l', typeName: 'shape', type: 'line', x: 0, y: 0, rot: 0, z: 1, props: { dx: 100, dy: 0, size: 'm', color: 'black', dash: 'solid' } }
    expect(hitShape(line, 50, 3, 4, store)).toBe(true)
    expect(hitShape(line, 50, 30, 4, store)).toBe(false)
  })

  it('rotated geo hit-tests in rotated space', () => {
    // thin rect rotated 90°: a point above the center (page space) now hits
    const s = geo({ rot: Math.PI / 2 }, { w: 100, h: 10, fill: 'solid' })
    // page center of the shape
    const cx = 10 + 50, cy = 10 + 5
    expect(hitShape(s, cx, cy + 40, 4, store)).toBe(true) // along rotated long axis
    expect(hitShape(s, cx + 40, cy, 4, store)).toBe(false) // along old long axis
  })
})

describe('marquee', () => {
  it('solid-bodied shapes select on bounds overlap; strokes need a graze', () => {
    const note = { id: 'n', typeName: 'shape', type: 'note', x: 0, y: 0, rot: 0, z: 1, props: { text: 'hi', size: 'm', color: 'yellow', font: 'draw' } }
    expect(marqueeHits(note, { x: -5, y: -5, w: 20, h: 20 })).toBe(true)

    const line = { id: 'l', typeName: 'shape', type: 'line', x: 0, y: 0, rot: 0, z: 1, props: { dx: 100, dy: 100, size: 'm', color: 'black' } }
    // rect overlapping the line's bounds but far from the diagonal
    expect(marqueeHits(line, { x: 60, y: 5, w: 30, h: 20 })).toBe(false)
    // rect the diagonal passes through (interior, not just corners)
    expect(marqueeHits(line, { x: 40, y: 30, w: 20, h: 20 })).toBe(true)
  })
})

describe('scaleShape', () => {
  it('scales geo and image boxes', () => {
    expect(scaleShape(geo(), 2, 0.5).props).toMatchObject({ w: 200, h: 25 })
    const img = { id: 'i', typeName: 'shape', type: 'image', x: 0, y: 0, rot: 0, z: 1, props: { w: 40, h: 30, assetId: 'a' } }
    expect(scaleShape(img, 0.5, 0.5).props).toMatchObject({ w: 20, h: 15 })
  })

  it('scales draw points in place', () => {
    const d = { id: 'd', typeName: 'shape', type: 'draw', x: 0, y: 0, rot: 0, z: 1, props: { pts: [10, 10, 0.5], size: 'm' } }
    expect(scaleShape(d, 2, 3).props.pts).toEqual([20, 30, 0.5])
  })

  it('text and note scale via the scale prop, floored', () => {
    const t = { id: 't', typeName: 'shape', type: 'text', x: 0, y: 0, rot: 0, z: 1, props: { text: 'x', size: 'm', scale: 1 } }
    expect(scaleShape(t, 2, 2).props.scale).toBeCloseTo(2)
    expect(scaleShape(t, 0.01, 0.01).props.scale).toBe(0.2)
  })

  it('line deltas scale; arrow bend scales geometrically', () => {
    const a = { id: 'a', typeName: 'shape', type: 'arrow', x: 0, y: 0, rot: 0, z: 1, props: { dx: 10, dy: 10, bend: 4 } }
    const s = scaleShape(a, 2, 2)
    expect(s.props.dx).toBe(20)
    expect(s.props.bend).toBeCloseTo(8)
  })
})

describe('text layout', () => {
  it('wraps long text when autosize is off and width fixed', () => {
    const t = { id: 't', typeName: 'shape', type: 'text', x: 0, y: 0, rot: 0, z: 1, props: { text: 'aaaa bbbb cccc dddd', size: 'm', autosize: false, w: 120, font: 'draw' } }
    const l = textLayout(t)
    expect(l.lines.length).toBeGreaterThan(1)
    expect(l.w).toBe(120)
  })

  it('wraps oversized tokens within a fixed-width box', () => {
    const text = 'https://example.com/abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz'
    const t = { id: 't', typeName: 'shape', type: 'text', x: 0, y: 0, rot: 0, z: 1, props: { text, size: 'm', autosize: false, w: 200, font: 'draw' } }
    const l = textLayout(t)
    expect(l.lines.length).toBeGreaterThan(1)
    expect(l.lines.map(({ text }) => text).join('')).toBe(text)
    expect(l.lines.every(({ w }) => w <= 200)).toBe(true)
  })

  it('wraps at grapheme boundaries for emoji and combining marks', () => {
    const family = '👨‍👩‍👧‍👦'
    const combining = 'e\u0301'
    const text = family.repeat(8) + combining.repeat(8)
    const t = { id: 't', typeName: 'shape', type: 'text', x: 0, y: 0, rot: 0, z: 1, props: { text, size: 'm', autosize: false, w: 200, font: 'draw' } }
    const l = textLayout(t)
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    const clusters = (value) => Array.from(segmenter.segment(value), ({ segment }) => segment)
    expect(l.lines.map(({ text }) => text).flatMap(clusters)).toEqual(clusters(text))
    expect(l.lines.every(({ w }) => w <= 200)).toBe(true)
  })

  it('caches per props object (identity)', () => {
    const t = { id: 't', typeName: 'shape', type: 'text', x: 0, y: 0, rot: 0, z: 1, props: { text: 'hello', size: 'm' } }
    expect(textLayout(t)).toBe(textLayout(t))
  })

  it('empty and multi-line text still lay out', () => {
    const mk = (text) => textLayout({ id: 't', typeName: 'shape', type: 'text', x: 0, y: 0, rot: 0, z: 1, props: { text, size: 'm' } })
    expect(mk('').lines.length).toBe(1)
    expect(mk('a\nb\nc').lines.length).toBe(3)
    expect(mk('a\nb\nc').h).toBeGreaterThan(mk('a').h)
  })
})

describe('hand-drawn outlines and text re-measure', () => {
  const geo = (id, g, w = 200, h = 120) => ({ id, typeName: 'shape', type: 'geo', x: 0, y: 0, rot: 0, props: { geo: g, w, h, dash: 'draw' } })

  it('geoOutline is stable per shape and hugs the box', () => {
    for (const g of ['rectangle', 'ellipse', 'diamond', 'cloud']) {
      const o = geoOutline(geo('s:' + g, g))
      expect(o).toEqual(geoOutline(geo('s:' + g, g)))
      expect(o.smooth).toBe(g === 'ellipse' || g === 'cloud')
      for (let i = 0; i < o.pts.length; i += 2) {
        expect(o.pts[i]).toBeGreaterThan(-3)
        expect(o.pts[i]).toBeLessThan(203)
        expect(o.pts[i + 1]).toBeGreaterThan(-3)
        expect(o.pts[i + 1]).toBeLessThan(123)
      }
    }
  })

  it('resetTextLayouts drops cached layouts so text is measured again', () => {
    const t = { id: 't', typeName: 'shape', type: 'text', x: 0, y: 0, rot: 0, props: { text: 'Hello', size: 'm', color: 'black' } }
    const a = textLayout(t)
    expect(textLayout(t)).toBe(a)
    resetTextLayouts()
    expect(textLayout(t)).not.toBe(a)
  })
})
