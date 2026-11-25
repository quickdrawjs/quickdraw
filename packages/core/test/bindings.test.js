// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  canBind, isLineish, outlineOf, toPage, pageOutline, coversPoint, bindingAt, anchorOf,
  withBinding, remapBindings, meetOutline, followBindings,
} from '../src/bindings.js'
import { toLocal } from '../src/shapes.js'

const box = (id, x, y, over = {}, props = {}) => ({
  id, typeName: 'shape', type: 'geo', x, y, rot: 0, z: 1,
  props: { geo: 'rectangle', w: 100, h: 100, color: 'black', size: 'm', dash: 'solid', fill: 'none', font: 'draw', ...props },
  ...over,
})
const arrow = (props = {}, over = {}) => ({
  id: 'shape:arrow', typeName: 'shape', type: 'arrow', x: 0, y: 0, rot: 0, z: 9,
  props: { dx: 10, dy: 0, bend: 0, color: 'black', size: 'm', dash: 'solid', ...props },
  ...over,
})
// size m: half the arrow's 4, half the box border's 4, and 2 of paper
const GAP = 6

describe('what an end can hold on to', () => {
  it('shapes with a body, never lines, strokes or assets', () => {
    expect(canBind(box('a', 0, 0))).toBe(true)
    for (const type of ['note', 'text', 'image']) expect(canBind({ ...box('a', 0, 0), type })).toBe(true)
    for (const type of ['arrow', 'line', 'draw', 'highlight']) expect(canBind({ ...box('a', 0, 0), type })).toBe(false)
    expect(canBind({ id: 'asset:1', typeName: 'asset', src: '', w: 1, h: 1 })).toBe(false)
    expect(canBind(undefined)).toBe(false)
    expect(isLineish(arrow())).toBe(true)
    expect(isLineish(box('a', 0, 0))).toBe(false)
  })

  it('takes an end anywhere inside, an unfilled box too, and near the outline', () => {
    const b = box('a', 0, 0)
    expect(coversPoint(b, 50, 50, 8)).toBe(true)
    expect(coversPoint(b, 105, 50, 8)).toBe(true)
    expect(coversPoint(b, 120, 50, 8)).toBe(false)
    // a diamond's box corner is off the shape
    expect(coversPoint(box('d', 0, 0, {}, { geo: 'diamond' }), 3, 3, 1)).toBe(false)
  })
})

describe('bindings', () => {
  it('a press in the middle half holds on to the middle, nearer the edge to that point', () => {
    const b = box('a', 0, 0)
    expect(bindingAt(b, 40, 70)).toEqual({ id: 'a', ax: 0.5, ay: 0.5 })
    expect(bindingAt(b, 90, 30)).toEqual({ id: 'a', ax: 0.9, ay: 0.3 })
    // past the edge it clamps to the box
    expect(bindingAt(b, 105, 50)).toEqual({ id: 'a', ax: 1, ay: 0.5 })
  })

  it('a turned shape keeps its point: toPage undoes toLocal', () => {
    const b = box('a', 20, 30, { rot: 0.7 })
    const p = toPage(b, 80, 10)
    const l = toLocal(b, p.x, p.y)
    expect(l.x).toBeCloseTo(80)
    expect(l.y).toBeCloseTo(10)
    const bind = bindingAt(b, p.x, p.y)
    const back = anchorOf(b, bind)
    expect(back.x).toBeCloseTo(p.x, 0)
    expect(back.y).toBeCloseTo(p.y, 0)
    expect(pageOutline(b).length).toBe(outlineOf(b).length)
  })

  it('withBinding sets or drops an end; remapBindings follows copies', () => {
    const p = { dx: 1, dy: 1 }
    const held = withBinding(p, 'end', { id: 'a', ax: 0.5, ay: 0.5 })
    expect(held.end.id).toBe('a')
    expect(withBinding(held, 'end', null)).toEqual(p)
    expect(withBinding(p, 'start', null)).toBe(p)
    const both = { ...held, start: { id: 'b', ax: 0, ay: 0 } }
    const copied = remapBindings(both, new Map([['a', 'a2']]))
    expect(copied.end.id).toBe('a2')
    expect('start' in copied).toBe(false)
  })
})

describe('meeting the outline', () => {
  it('stops at a box edge, gap short of it', () => {
    const b = box('a', 100, 0)
    const q = meetOutline(b, { x: 0, y: 50 }, { x: 150, y: 50 }, GAP)
    expect(q.x).toBeCloseTo(100 - GAP)
    expect(q.y).toBeCloseTo(50)
  })

  it('stops at an ellipse, not at its box', () => {
    const b = box('a', 0, 0, {}, { geo: 'ellipse' })
    // aimed at the middle along the diagonal, the box corner is far outside the ellipse
    const q = meetOutline(b, { x: -100, y: -100 }, { x: 50, y: 50 }, 0)
    const r = Math.hypot(q.x - 50, q.y - 50)
    expect(r).toBeGreaterThan(48)
    expect(r).toBeLessThan(51)
  })

  it('goes all the way when it starts inside the shape', () => {
    const b = box('a', 0, 0)
    expect(meetOutline(b, { x: 20, y: 20 }, { x: 50, y: 50 }, GAP)).toEqual({ x: 50, y: 50 })
  })
})

describe('followBindings', () => {
  const get = (...shapes) => (id) => shapes.find((s) => s.id === id)

  it('points an arrow from one box to the other, edge to edge', () => {
    const a = box('a', 0, 0), b = box('b', 300, 0)
    const next = followBindings(arrow({ start: { id: 'a', ax: 0.5, ay: 0.5 }, end: { id: 'b', ax: 0.5, ay: 0.5 } }), get(a, b))
    expect(next.x).toBeCloseTo(100 + GAP)
    expect(next.y).toBeCloseTo(50)
    expect(next.props.dx).toBeCloseTo(300 - GAP - (100 + GAP))
    expect(next.props.dy).toBeCloseTo(0)
  })

  it('leaves a free end where it is', () => {
    const b = box('b', 300, 0)
    const next = followBindings(arrow({ dx: 10, dy: 0, end: { id: 'b', ax: 0.5, ay: 0.5 } }, { x: 0, y: 50 }), get(b))
    expect(next.x).toBe(0)
    expect(next.y).toBe(50)
    expect(next.props.dx).toBeCloseTo(300 - GAP)
  })

  it('is null when nothing would move, and lets go of shapes that are gone or never were', () => {
    const a = box('a', 0, 0), b = box('b', 300, 0)
    const settled = followBindings(arrow({ start: { id: 'a', ax: 0.5, ay: 0.5 }, end: { id: 'b', ax: 0.5, ay: 0.5 } }), get(a, b))
    expect(followBindings(settled, get(a, b))).toBeNull()
    expect(followBindings(arrow(), get())).toBeNull()

    const gone = followBindings(settled, get(a))
    expect('end' in gone.props).toBe(false)
    expect(gone.props.start.id).toBe('a')
    // with only its start held, the free end stays where the arrow last drew it
    expect(gone.x + gone.props.dx).toBeCloseTo(settled.x + settled.props.dx)

    const bad = followBindings(arrow({ start: { id: 'a' }, end: { id: 'line', ax: 0.5, ay: 0.5 } }), get(a, { ...box('line', 0, 0), type: 'line' }))
    expect(bad.props.start).toBeUndefined()
    expect(bad.props.end).toBeUndefined()
    expect(bad.x).toBe(0)
  })
})
