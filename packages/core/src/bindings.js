// Connected arrows: an arrow or line end can hold on to a shape. The end's
// binding, { id, ax, ay } on props.start / props.end, names the shape and a
// point in its box as fractions of its width and height. The record keeps
// its drawn geometry (x, y, dx, dy) as well, so anything that only draws
// records (exports, thumbnails, a peer on an older version) still shows the
// arrow where it is; the editor re-points it whenever its shapes change.
// Dependency-free ESM (see palette.js).

import { SIZES } from './palette.js'
import { localBounds, toLocal } from './shapes.js'
import { geoPolygon, ellipsePolygon, cloudPolygon, pointInPolygon, distToPolyline, rotWith, clamp } from './geometry.js'

// what an end can hold on to: shapes with a body
export const BINDABLE = ['geo', 'note', 'text', 'image']

export const canBind = (s) => !!s && s.typeName === 'shape' && BINDABLE.includes(s.type)
export const isLineish = (s) => !!s && (s.type === 'arrow' || s.type === 'line')

const isBinding = (b) =>
  !!b && typeof b === 'object' && typeof b.id === 'string' && Number.isFinite(b.ax) && Number.isFinite(b.ay)

// A press in the middle half of a shape holds on to its middle: the end aims
// at the centre and meets the outline wherever the other end leads it, so
// the arrow swings round the shape as things move. Nearer the edge it holds
// on to that very point.
const MIDDLE = 0.25

const hundredth = (v) => Math.round(v * 100) / 100
const thousandth = (v) => Math.round(v * 1000) / 1000

// the outline an end meets, as a closed polygon in the shape's local space
export function outlineOf(shape) {
  const p = shape.props
  if (shape.type === 'geo') {
    if (p.geo === 'ellipse') return ellipsePolygon(p.w, p.h, 48)
    if (p.geo === 'cloud') return cloudPolygon(p.w, p.h)
    return geoPolygon(p.geo, p.w, p.h)
  }
  const b = localBounds(shape)
  return [b.x, b.y, b.x + b.w, b.y, b.x + b.w, b.y + b.h, b.x, b.y + b.h]
}

// shape-local point -> page point (the inverse of toLocal)
export function toPage(shape, lx, ly) {
  const x = shape.x + lx, y = shape.y + ly
  if (!shape.rot) return { x, y }
  const b = localBounds(shape)
  return rotWith(x, y, shape.x + b.x + b.w / 2, shape.y + b.y + b.h / 2, shape.rot)
}

// the outline in page space: what lights up while an end is over the shape
export function pageOutline(shape) {
  const pts = outlineOf(shape)
  const out = []
  for (let i = 0; i < pts.length; i += 2) {
    const q = toPage(shape, pts[i], pts[i + 1])
    out.push(q.x, q.y)
  }
  return out
}

// the page point lands on the shape: inside its outline, or within tol of it.
// An unfilled box still takes an end anywhere inside, unlike a click.
export function coversPoint(shape, px, py, tol) {
  const l = toLocal(shape, px, py)
  const poly = outlineOf(shape)
  return pointInPolygon(l.x, l.y, poly) || distToPolyline(l.x, l.y, poly, 2, true) <= tol
}

// the binding for an end let go at page point (px, py) over shape
export function bindingAt(shape, px, py) {
  const b = localBounds(shape)
  const l = toLocal(shape, px, py)
  const ax = b.w ? clamp((l.x - b.x) / b.w, 0, 1) : 0.5
  const ay = b.h ? clamp((l.y - b.y) / b.h, 0, 1) : 0.5
  if (Math.abs(ax - 0.5) <= MIDDLE && Math.abs(ay - 0.5) <= MIDDLE) return { id: shape.id, ax: 0.5, ay: 0.5 }
  return { id: shape.id, ax: thousandth(ax), ay: thousandth(ay) }
}

// the page point a binding holds on to
export function anchorOf(shape, bind) {
  const b = localBounds(shape)
  return toPage(shape, b.x + bind.ax * b.w, b.y + bind.ay * b.h)
}

// props with the start or end binding set, or dropped (bind null)
export function withBinding(props, end, bind) {
  if (bind) return { ...props, [end]: bind }
  if (!(end in props)) return props
  const { [end]: _gone, ...rest } = props
  return rest
}

// A copied arrow holds on to the copies of its shapes (ids: old id -> new
// id), and lets go of shapes that weren't copied with it.
export function remapBindings(props, ids) {
  let out = props
  for (const end of ['start', 'end']) {
    const b = props[end]
    if (!b) continue
    out = ids.has(b.id) ? { ...out, [end]: { ...b, id: ids.get(b.id) } } : withBinding(out, end, null)
  }
  return out
}

// smallest t in [0, 1] where segment a -> b crosses the closed polygon, or null
function firstCrossing(a, b, poly) {
  const n = poly.length / 2
  const rx = b.x - a.x, ry = b.y - a.y
  let best = null
  for (let i = 0; i < n; i++) {
    const cx = poly[i * 2], cy = poly[i * 2 + 1]
    const j = ((i + 1) % n) * 2
    const sx = poly[j] - cx, sy = poly[j + 1] - cy
    const den = rx * sy - ry * sx
    if (!den) continue
    const qx = cx - a.x, qy = cy - a.y
    const t = (qx * sy - qy * sx) / den
    const u = (qx * ry - qy * rx) / den
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && (best === null || t < best)) best = t
  }
  return best
}

// Where the segment from `from` toward `to` first meets the shape's outline,
// pulled back `gap` toward `from`. When `from` is inside the shape, or the
// segment never reaches the outline, the end goes all the way to `to`.
export function meetOutline(shape, from, to, gap) {
  // toLocal only turns and shifts, so t along the local segment is t on the page
  const a = toLocal(shape, from.x, from.y)
  const b = toLocal(shape, to.x, to.y)
  const poly = outlineOf(shape)
  if (pointInPolygon(a.x, a.y, poly)) return to
  const t = firstCrossing(a, b, poly)
  if (t === null) return to
  const len = Math.hypot(to.x - from.x, to.y - from.y)
  const k = len > 0 ? Math.max(0, t - gap / len) : t
  return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }
}

// the head stops short of the outline: half its own line, half the shape's
// border, and a hair of paper between them
const gapFor = (shape, width) => width / 2 + (shape.type === 'geo' ? (SIZES[shape.props.size] || 0) / 2 : 0) + 2

const near = (a, b) => Math.abs(a - b) < 0.01

// The arrow re-pointed at what its ends hold on to: a held end aims at the
// other end (at what that end holds on to, when it holds on too) and stops
// at its shape's outline. An end whose shape is gone lets go where it is.
// Returns the new record, or null when nothing changes.
export function followBindings(arrow, get) {
  const p = arrow.props
  if (!p.start && !p.end) return null
  let props = p
  const ends = {}
  for (const end of ['start', 'end']) {
    if (!p[end]) continue
    const shape = isBinding(p[end]) ? get(p[end].id) : null
    if (canBind(shape)) ends[end] = shape
    else props = withBinding(props, end, null)
  }
  let x = arrow.x, y = arrow.y
  let ex = arrow.x + p.dx, ey = arrow.y + p.dy
  if (ends.start || ends.end) {
    const sa = ends.start ? anchorOf(ends.start, p.start) : { x, y }
    const ea = ends.end ? anchorOf(ends.end, p.end) : { x: ex, y: ey }
    const w = SIZES[p.size] || SIZES.m
    if (ends.start) ({ x, y } = meetOutline(ends.start, ea, sa, gapFor(ends.start, w)))
    if (ends.end) ({ x: ex, y: ey } = meetOutline(ends.end, sa, ea, gapFor(ends.end, w)))
  }
  const nx = hundredth(x), ny = hundredth(y)
  const dx = hundredth(ex - nx), dy = hundredth(ey - ny)
  // under a hundredth of a pixel is no move: peers that work it out with
  // other float rounding never trade the same arrow back and forth
  const moved = !near(nx, arrow.x) || !near(ny, arrow.y) || !near(dx, p.dx) || !near(dy, p.dy)
  if (!moved && props === p) return null
  if (!moved) return { ...arrow, props }
  return { ...arrow, x: nx, y: ny, props: { ...props, dx, dy } }
}
