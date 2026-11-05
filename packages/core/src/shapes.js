// Shape definitions: bounds, canvas rendering and hit-testing for every
// board shape type. Records are immutable, so per-shape caches (freehand
// outlines, wobbled geo paths, text layout) key off the props object in
// WeakMaps and invalidate themselves by replacement.
// Dependency-free ESM (see palette.js).

import {
  SIZES, INK_SIZES, FONT_SIZES, NOTE_FONT_SIZES, FONTS, HIGHLIGHT_ALPHA, HIGHLIGHT_SCALE,
} from './palette.js'
import {
  ptsBounds, rotWith, distToPolyline, pointInPolygon, pointInEllipse,
  geoPolygon, ellipsePolygon, cloudPolygon, CLOUD_START, CLOUD_CURVES,
  wobblePolyline, bowPolygon, traceSmooth, segIntersectsBounds,
  boundsIntersect, boundsContain,
} from './geometry.js'
import { strokeOutline, inkOptions } from './freehand.js'

export const NOTE_W = 200
const NOTE_PAD = 20
const LABEL_PAD = 12

// semi fill: a near-opaque wash of the paper, so the shape occludes what's
// behind it without committing to a color
const SEMI = { light: 'rgba(249, 247, 241, 0.85)', dark: 'rgba(32, 30, 25, 0.85)' }

// ---- local bounds (origin = shape.x/y, unrotated) --------------------------

export function localBounds(shape) {
  const p = shape.props
  switch (shape.type) {
    case 'draw':
    case 'highlight': {
      const b = ptsBounds(p.pts, 3)
      const m = shape.type === 'highlight' ? SIZES[p.size] * HIGHLIGHT_SCALE / 2 : inkReach(p.size)
      return { x: b.x - m, y: b.y - m, w: b.w + m * 2, h: b.h + m * 2 }
    }
    case 'arrow':
    case 'line': {
      const bend = p.bend || 0
      const x = Math.min(0, p.dx) - Math.abs(bend)
      const y = Math.min(0, p.dy) - Math.abs(bend)
      return { x, y, w: Math.abs(p.dx) + Math.abs(bend) * 2, h: Math.abs(p.dy) + Math.abs(bend) * 2 }
    }
    case 'text': {
      const l = textLayout(shape)
      return { x: 0, y: 0, w: l.w, h: l.h }
    }
    case 'note': {
      const l = noteLayout(shape)
      return { x: 0, y: 0, w: NOTE_W * (p.scale || 1), h: l.boxH * (p.scale || 1) }
    }
    case 'image':
      return { x: 0, y: 0, w: p.w, h: p.h }
    case 'geo':
    default:
      return { x: 0, y: 0, w: p.w || 1, h: p.h || 1 }
  }
}

// axis-aligned page bounds, rotation included
export function pageBounds(shape) {
  const lb = localBounds(shape)
  if (!shape.rot) return { x: shape.x + lb.x, y: shape.y + lb.y, w: lb.w, h: lb.h }
  const cx = shape.x + lb.x + lb.w / 2
  const cy = shape.y + lb.y + lb.h / 2
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [px, py] of [
    [shape.x + lb.x, shape.y + lb.y],
    [shape.x + lb.x + lb.w, shape.y + lb.y],
    [shape.x + lb.x + lb.w, shape.y + lb.y + lb.h],
    [shape.x + lb.x, shape.y + lb.y + lb.h],
  ]) {
    const r = rotWith(px, py, cx, cy, shape.rot)
    if (r.x < minX) minX = r.x
    if (r.x > maxX) maxX = r.x
    if (r.y < minY) minY = r.y
    if (r.y > maxY) maxY = r.y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

// page point -> shape-local point (un-rotate, un-translate)
export function toLocal(shape, px, py) {
  if (shape.rot) {
    const lb = localBounds(shape)
    const cx = shape.x + lb.x + lb.w / 2
    const cy = shape.y + lb.y + lb.h / 2
    const r = rotWith(px, py, cx, cy, -shape.rot)
    return { x: r.x - shape.x, y: r.y - shape.y }
  }
  return { x: px - shape.x, y: py - shape.y }
}

// ---- caches ----------------------------------------------------------------

const outlineCache = new WeakMap() // draw props -> Path2D
const geoPathCache = new WeakMap() // geo props+id key stored on props via WeakMap keyed by props (id captured at build)
let layoutCache = new WeakMap() // text/note/geo-label props -> layout

let measureCtx = null
const measurer = () => {
  if (!measureCtx) measureCtx = (typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(1, 1)
    : document.createElement('canvas')).getContext('2d')
  return measureCtx
}

// The editing textarea positions glyphs by CSS line-box math (half-leading
// around ascent+descent), while canvas 'middle' centers on the em square —
// they disagree by a few px, so committed text would shift. Draw with
// 'alphabetic' at the CSS baseline instead so canvas matches the textarea.
const baselineCache = new Map()
export function lineBaseline(font, fontSize, lh) {
  const key = `${fontSize}|${lh}|${font}`
  let b = baselineCache.get(key)
  if (b === undefined) {
    const ctx = measurer()
    ctx.font = `500 ${fontSize}px ${font}`
    const m = ctx.measureText('Mg')
    const a = m.fontBoundingBoxAscent ?? fontSize * 0.8
    const d = m.fontBoundingBoxDescent ?? fontSize * 0.2
    b = (lh - (a + d)) / 2 + a
    baselineCache.set(key, b)
  }
  return b
}

// Text is measured once per props object, so a web font that arrives after
// the first layout would leave every box sized for the fallback. The editor
// calls this when fonts finish loading, then redraws.
export function resetTextLayouts() {
  layoutCache = new WeakMap()
  baselineCache.clear()
}

// ---- text layout -----------------------------------------------------------

const graphemeSegmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null

function wrapOversizedLine(text, ctx, maxW) {
  const parts = graphemeSegmenter
    ? Array.from(graphemeSegmenter.segment(text), ({ segment }) => segment)
    : Array.from(text)
  const lines = []
  let line = ''
  for (const part of parts) {
    const next = line + part
    if (line && ctx.measureText(next).width > maxW) {
      lines.push({ text: line, w: ctx.measureText(line).width })
      line = part
    } else line = next
  }
  if (line) lines.push({ text: line, w: ctx.measureText(line).width })
  return lines
}

function wrapLines(text, font, fontSize, maxW) {
  const ctx = measurer()
  ctx.font = `500 ${fontSize}px ${font}`
  const out = []
  for (const para of String(text ?? '').split('\n')) {
    if (para === '') { out.push({ text: '', w: 0 }); continue }
    let line = ''
    for (const word of para.split(/(\s+)/)) {
      const test = line + word
      if (line && maxW && ctx.measureText(test).width > maxW) {
        out.push({ text: line, w: ctx.measureText(line).width })
        line = word.trimStart()
      } else line = test
      if (maxW && ctx.measureText(line).width > maxW) {
        const wrapped = wrapOversizedLine(line, ctx, maxW)
        out.push(...wrapped.slice(0, -1))
        line = wrapped.length ? wrapped[wrapped.length - 1].text : ''
      }
    }
    out.push({ text: line, w: ctx.measureText(line).width })
  }
  return out
}

export function textLayout(shape) {
  const p = shape.props
  const hit = layoutCache.get(p)
  if (hit) return hit
  const fontSize = FONT_SIZES[p.size] * (p.scale || 1)
  const font = FONTS[p.font || 'draw']
  const lh = fontSize * 1.32
  const maxW = p.autosize === false && p.w ? p.w : 0
  const lines = wrapLines(p.text, font, fontSize, maxW)
  const w = maxW || Math.max(8, ...lines.map((l) => l.w)) + 2
  const l = { lines, fontSize, font, lh, w, h: Math.max(lh, lines.length * lh) }
  layoutCache.set(p, l)
  return l
}

export function noteLayout(shape) {
  const p = shape.props
  const hit = layoutCache.get(p)
  if (hit) return hit
  const fontSize = NOTE_FONT_SIZES[p.size]
  const font = FONTS[p.font || 'draw']
  const lh = fontSize * 1.35
  const lines = wrapLines(p.text, font, fontSize, NOTE_W - NOTE_PAD * 2)
  const textH = lines.length * lh
  const l = { lines, fontSize, font, lh, textH, boxH: Math.max(NOTE_W, textH + NOTE_PAD * 2) }
  layoutCache.set(p, l)
  return l
}

function geoLabelLayout(shape) {
  const p = shape.props
  if (!p.label) return null
  const key = p
  let hit = layoutCache.get(key)
  if (hit) return hit
  const fontSize = FONT_SIZES[p.labelSize || 's'] * (p.labelScale || 1)
  const font = FONTS[p.font || 'draw']
  const lh = fontSize * 1.3
  const lines = wrapLines(p.label, font, fontSize, Math.max(24, p.w - LABEL_PAD * 2))
  hit = { lines, fontSize, font, lh, textH: lines.length * lh }
  layoutCache.set(key, hit)
  return hit
}

// ---- image assets ----------------------------------------------------------

const imgCache = new Map() // assetId -> { img, ready }
export function assetImage(store, assetId, onReady) {
  let e = imgCache.get(assetId)
  if (e) return e.ready ? e.img : null
  const asset = store.asset(assetId)
  if (!asset) return null
  const img = new Image()
  e = { img, ready: false }
  imgCache.set(assetId, e)
  img.onload = () => { e.ready = true; onReady && onReady() }
  img.src = asset.src
  return null
}

// ---- rendering -------------------------------------------------------------

const dashFor = (dash, w) =>
  dash === 'dashed' ? [w * 3.2, w * 2.6] : dash === 'dotted' ? [0.01, w * 2.5] : null

function strokeStyled(ctx, dash, w) {
  ctx.lineWidth = w
  ctx.lineJoin = 'round'
  ctx.lineCap = dash === 'dotted' ? 'round' : 'round'
  const d = dashFor(dash, w)
  ctx.setLineDash(d || [])
}

// The outline a 'draw'-dash geo is stroked along, in local space: `smooth`
// outlines (ellipse, cloud) are traced with midpoint quadratics, the rest
// joined straight. The wobble is deliberately quiet — a calm hand, not a
// shaky one. Exported so animation code can trace exactly what's drawn.
export function geoOutline(shape) {
  const p = shape.props
  const w = p.w, h = p.h
  if (p.geo === 'ellipse') {
    return { smooth: true, pts: wobblePolyline(ellipsePolygon(w, h, 48), shape.id, { step: 34, amp: Math.min(0.9, (w + h) / 400 + 0.3) }) }
  }
  if (p.geo === 'cloud') {
    return { smooth: true, pts: wobblePolyline(cloudPolygon(w, h), shape.id, { step: 30, amp: Math.min(0.8, (w + h) / 400 + 0.3) }) }
  }
  return { smooth: false, pts: bowPolygon(geoPolygon(p.geo, w, h), shape.id) }
}

// polygon path (hand-drawn for 'draw' dash), cached per props object
function geoPath(shape) {
  const p = shape.props
  let path = geoPathCache.get(p)
  if (path) return path
  path = new Path2D()
  if (p.dash === 'draw') {
    const { smooth, pts } = geoOutline(shape)
    if (smooth) traceSmooth(path, pts, true)
    else {
      const n = pts.length / 2
      path.moveTo(pts[0], pts[1])
      for (let i = 1; i < n; i++) path.lineTo(pts[i * 2], pts[i * 2 + 1])
    }
    path.closePath()
  } else if (p.geo === 'ellipse') {
    path.ellipse(p.w / 2, p.h / 2, Math.max(0.5, p.w / 2), Math.max(0.5, p.h / 2), 0, 0, Math.PI * 2)
  } else if (p.geo === 'cloud') {
    path.moveTo(CLOUD_START[0] * p.w, CLOUD_START[1] * p.h)
    for (const [c1x, c1y, c2x, c2y, ex, ey] of CLOUD_CURVES) {
      path.bezierCurveTo(c1x * p.w, c1y * p.h, c2x * p.w, c2y * p.h, ex * p.w, ey * p.h)
    }
    path.closePath()
  } else {
    const poly = geoPolygon(p.geo, p.w, p.h)
    const n = poly.length / 2
    path.moveTo(poly[0], poly[1])
    for (let i = 1; i < n; i++) path.lineTo(poly[i * 2], poly[i * 2 + 1])
    path.closePath()
  }
  geoPathCache.set(p, path)
  return path
}

const patternCache = new Map() // `${color}|${theme}` -> CanvasPattern
function hatchPattern(ctx, colorHex, themeId) {
  const key = colorHex + '|' + themeId
  let pat = patternCache.get(key)
  if (pat) return pat
  const c = document.createElement('canvas')
  c.width = c.height = 8
  const pctx = c.getContext('2d')
  pctx.strokeStyle = colorHex
  pctx.globalAlpha = 0.55
  pctx.lineWidth = 1.4
  pctx.beginPath()
  // 45° lines, tiled
  pctx.moveTo(-2, 6); pctx.lineTo(6, -2)
  pctx.moveTo(2, 10); pctx.lineTo(10, 2)
  pctx.stroke()
  pat = ctx.createPattern(c, 'repeat')
  patternCache.set(key, pat)
  return pat
}

function fillPath(ctx, path, p, theme) {
  if (!p.fill || p.fill === 'none') return
  if (p.fill === 'semi') ctx.fillStyle = SEMI[theme.id]
  else if (p.fill === 'pattern') ctx.fillStyle = hatchPattern(ctx, theme.colors[p.color].stroke, theme.id)
  else ctx.fillStyle = theme.colors[p.color].fill
  ctx.fill(path)
}

function drawLabel(ctx, layout, color, w, h) {
  if (!layout) return
  ctx.font = `500 ${layout.fontSize}px ${layout.font}`
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  let y = h / 2 - layout.textH / 2 + lineBaseline(layout.font, layout.fontSize, layout.lh)
  for (const line of layout.lines) {
    ctx.fillText(line.text, w / 2, y)
    y += layout.lh
  }
}

// the freehand outline as a Path2D, cached; live strokes (done !== true)
// rebuild every frame so the ink grows under the pen
function drawPath(shape) {
  const p = shape.props
  if (p.done) {
    const hit = outlineCache.get(p)
    if (hit) return hit
  }
  const path = new Path2D()
  const outline = strokeOutline(p.pts, inkOptions(INK_SIZES[p.size], { isPen: !!p.isPen, done: !!p.done }))
  traceSmooth(path, outline, true)
  path.closePath()
  if (p.done) outlineCache.set(p, path)
  return path
}

// how far the ink can reach from its centerline: a pen's widest is a little
// over its nominal width
function inkReach(size) {
  return INK_SIZES[size] + 1
}

// Draw one shape. ctx is already in PAGE space (camera applied by caller);
// this applies the shape's own translate/rotate.
// opts: { theme, store, zoom, onAssetLoad, ghost }
export function drawShape(ctx, shape, opts) {
  const { theme } = opts
  const p = shape.props
  const col = theme.colors[p.color || 'black']
  ctx.save()
  // the shape's own opacity style, under the eraser's ghosting
  const alpha = (opts.ghost ? 0.3 : 1) * (p.opacity ?? 1)
  if (alpha !== 1) ctx.globalAlpha = alpha
  const lb = localBounds(shape)
  if (shape.rot) {
    const cx = shape.x + lb.x + lb.w / 2
    const cy = shape.y + lb.y + lb.h / 2
    ctx.translate(cx, cy)
    ctx.rotate(shape.rot)
    ctx.translate(-cx, -cy)
  }
  ctx.translate(shape.x, shape.y)

  switch (shape.type) {
    case 'draw': {
      // 'draw' dash = pressure ink; solid/dashed/dotted render the same
      // smoothed centerline at an even width so the line style reads true
      if (p.dash && p.dash !== 'draw') {
        ctx.strokeStyle = col.stroke
        strokeStyled(ctx, p.dash, SIZES[p.size])
        ctx.beginPath()
        const flat = []
        for (let i = 0; i < p.pts.length; i += 3) flat.push(p.pts[i], p.pts[i + 1])
        traceSmooth(ctx, flat)
        ctx.stroke()
        ctx.setLineDash([])
      } else {
        ctx.fillStyle = col.stroke
        ctx.fill(drawPath(shape))
      }
      break
    }
    case 'highlight': {
      ctx.globalAlpha = alpha * HIGHLIGHT_ALPHA
      // multiply soaks into light paper; on dark paper it would blacken —
      // lighten glows instead, like a marker on a chalkboard
      ctx.globalCompositeOperation = theme.id === 'dark' ? 'lighten' : 'multiply'
      ctx.strokeStyle = col.stroke
      ctx.lineWidth = SIZES[p.size] * HIGHLIGHT_SCALE
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      const flat = []
      for (let i = 0; i < p.pts.length; i += 3) flat.push(p.pts[i], p.pts[i + 1])
      traceSmooth(ctx, flat)
      ctx.stroke()
      break
    }
    case 'geo': {
      const path = geoPath(shape)
      fillPath(ctx, path, p, theme)
      ctx.strokeStyle = col.stroke
      strokeStyled(ctx, p.dash, SIZES[p.size])
      ctx.stroke(path)
      ctx.setLineDash([])
      if (opts.hideText !== 'label') drawLabel(ctx, geoLabelLayout(shape), col.stroke, p.w, p.h)
      break
    }
    case 'arrow':
    case 'line': {
      const w = SIZES[p.size]
      ctx.strokeStyle = col.stroke
      strokeStyled(ctx, p.dash, w)
      const bend = p.bend || 0
      const len = Math.hypot(p.dx, p.dy) || 1
      const nx = -p.dy / len, ny = p.dx / len
      const cx2 = p.dx / 2 + nx * bend * 2 // control point: bend*2 puts the CURVE at bend offset
      const cy2 = p.dy / 2 + ny * bend * 2
      ctx.beginPath()
      ctx.moveTo(0, 0)
      if (bend) ctx.quadraticCurveTo(cx2, cy2, p.dx, p.dy)
      else ctx.lineTo(p.dx, p.dy)
      ctx.stroke()
      ctx.setLineDash([])
      if (shape.type === 'arrow') {
        // chevron head aligned with the end tangent
        const tx = p.dx - cx2, ty = p.dy - cy2
        const ta = bend ? Math.atan2(ty, tx) : Math.atan2(p.dy, p.dx)
        const hl = Math.min(Math.max(w * 3.2, 12), len * 0.4)
        ctx.beginPath()
        ctx.moveTo(p.dx - Math.cos(ta - 0.5) * hl, p.dy - Math.sin(ta - 0.5) * hl)
        ctx.lineTo(p.dx, p.dy)
        ctx.lineTo(p.dx - Math.cos(ta + 0.5) * hl, p.dy - Math.sin(ta + 0.5) * hl)
        ctx.lineWidth = w
        ctx.lineCap = 'round'
        ctx.stroke()
      }
      break
    }
    case 'text': {
      const l = textLayout(shape)
      ctx.font = `500 ${l.fontSize}px ${l.font}`
      ctx.fillStyle = col.stroke
      ctx.textBaseline = 'alphabetic'
      const align = p.align || 'start'
      ctx.textAlign = align === 'middle' ? 'center' : align === 'end' ? 'right' : 'left'
      const ax = align === 'middle' ? l.w / 2 : align === 'end' ? l.w : 0
      let y = lineBaseline(l.font, l.fontSize, l.lh)
      if (opts.hideText !== 'text') {
        for (const line of l.lines) {
          ctx.fillText(line.text, ax, y)
          y += l.lh
        }
      }
      break
    }
    case 'note': {
      const l = noteLayout(shape)
      const s = p.scale || 1
      ctx.scale(s, s)
      ctx.fillStyle = col.note
      ctx.beginPath()
      ctx.roundRect(0, 0, NOTE_W, l.boxH, 6)
      ctx.shadowColor = 'rgba(20, 16, 8, 0.22)'
      ctx.shadowBlur = 10
      ctx.shadowOffsetY = 4
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0
      ctx.font = `500 ${l.fontSize}px ${l.font}`
      ctx.fillStyle = theme.noteText
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      const bl = lineBaseline(l.font, l.fontSize, l.lh)
      let y = Math.max(NOTE_PAD, l.boxH / 2 - l.textH / 2) + bl
      if (opts.hideText !== 'text') {
        for (const line of l.lines) {
          ctx.fillText(line.text, NOTE_W / 2, y)
          y += l.lh
        }
      }
      break
    }
    case 'image': {
      const img = assetImage(opts.store, p.assetId, opts.onAssetLoad)
      if (img) {
        ctx.beginPath()
        ctx.roundRect(0, 0, p.w, p.h, 4)
        ctx.save()
        ctx.clip()
        ctx.drawImage(img, 0, 0, p.w, p.h)
        ctx.restore()
      } else {
        ctx.fillStyle = SEMI[theme.id]
        ctx.beginPath()
        ctx.roundRect(0, 0, p.w, p.h, 4)
        ctx.fill()
      }
      break
    }
  }
  ctx.restore()
}

// ---- hit testing -----------------------------------------------------------

// point hit in PAGE space; returns true when (px,py) touches the shape
export function hitShape(shape, px, py, tol, store) {
  const b = pageBounds(shape)
  const wide = tol + SIZES[shape.props.size || 'm'] * 2
  if (!boundsContain({ x: b.x - wide, y: b.y - wide, w: b.w + wide * 2, h: b.h + wide * 2 }, px, py)) return false
  const l = toLocal(shape, px, py)
  const p = shape.props
  switch (shape.type) {
    case 'draw':
      return distToPolyline(l.x, l.y, p.pts, 3) <= tol + inkReach(p.size)
    case 'highlight':
      return distToPolyline(l.x, l.y, p.pts, 3) <= tol + (SIZES[p.size] * HIGHLIGHT_SCALE) / 2
    case 'geo': {
      const edgeTol = tol + SIZES[p.size]
      if (p.geo === 'ellipse') {
        const inside = pointInEllipse(l.x, l.y, p.w / 2, p.h / 2, p.w / 2, p.h / 2)
        if (p.fill !== 'none' || p.label) return inside || nearEllipseEdge(l, p, edgeTol)
        return nearEllipseEdge(l, p, edgeTol)
      }
      const poly = geoPolygon(p.geo, p.w, p.h)
      if (p.fill !== 'none' || p.label) {
        if (pointInPolygon(l.x, l.y, poly)) return true
      }
      return distToPolyline(l.x, l.y, poly, 2, true) <= edgeTol
    }
    case 'arrow':
    case 'line': {
      const pts = sampleLinePts(p, p.bend || 0)
      return distToPolyline(l.x, l.y, pts, 2) <= tol + SIZES[p.size]
    }
    case 'text':
    case 'note':
    case 'image': {
      const lb = localBounds(shape)
      return l.x >= lb.x - tol && l.x <= lb.x + lb.w + tol && l.y >= lb.y - tol && l.y <= lb.y + lb.h + tol
    }
  }
  return false
}

const nearEllipseEdge = (l, p, tol) => {
  const rx = p.w / 2, ry = p.h / 2
  if (rx <= 0 || ry <= 0) return false
  const outer = pointInEllipse(l.x, l.y, rx, ry, rx + tol, ry + tol)
  const inner = pointInEllipse(l.x, l.y, rx, ry, Math.max(0.5, rx - tol), Math.max(0.5, ry - tol))
  return outer && !inner
}

export const sampleLinePts = (p, bend) => {
  if (!bend) return [0, 0, p.dx, p.dy]
  const len = Math.hypot(p.dx, p.dy) || 1
  const nx = -p.dy / len, ny = p.dx / len
  const cx = p.dx / 2 + nx * bend * 2
  const cy = p.dy / 2 + ny * bend * 2
  const pts = []
  for (let i = 0; i <= 16; i++) {
    const t = i / 16
    const mt = 1 - t
    pts.push(mt * mt * 0 + 2 * mt * t * cx + t * t * p.dx, mt * mt * 0 + 2 * mt * t * cy + t * t * p.dy)
  }
  return pts
}

// marquee (page-space rect) selection test
export function marqueeHits(shape, rect) {
  const b = pageBounds(shape)
  if (!boundsIntersect(b, rect)) return false
  // solid-bodied shapes select on bounds overlap
  if (['text', 'note', 'image'].includes(shape.type)) return true
  if (shape.type === 'geo' && shape.props.fill !== 'none') return true
  // stroke shapes want a real graze — cheap test on their (unrotated) points
  if (shape.rot) return true
  const p = shape.props
  const local = { x: rect.x - shape.x, y: rect.y - shape.y, w: rect.w, h: rect.h }
  let pts, stride = 2
  if (shape.type === 'draw' || shape.type === 'highlight') { pts = p.pts; stride = 3 }
  else if (shape.type === 'arrow' || shape.type === 'line') pts = sampleLinePts(p, p.bend || 0)
  else if (shape.type === 'geo') { pts = geoPolygon(p.geo, p.w, p.h); if (pointInPolygon(local.x + local.w / 2, local.y + local.h / 2, pts)) return true }
  if (!pts) return true
  const n = Math.floor(pts.length / stride)
  if (n === 1) return boundsContain(local, pts[0], pts[1])
  for (let i = 0; i < n - 1; i++) {
    if (segIntersectsBounds(pts[i * stride], pts[i * stride + 1], pts[(i + 1) * stride], pts[(i + 1) * stride + 1], local)) return true
  }
  // closed geo outline: also test the closing edge
  if (shape.type === 'geo' && n > 2) {
    if (segIntersectsBounds(pts[(n - 1) * stride], pts[(n - 1) * stride + 1], pts[0], pts[1], local)) return true
  }
  return false
}

// ---- transforms ------------------------------------------------------------

// scale a shape's local geometry about the LOCAL origin; caller repositions
// x/y. Returns a new shape.
export function scaleShape(shape, sx, sy) {
  const p = shape.props
  switch (shape.type) {
    case 'draw':
    case 'highlight': {
      const pts = p.pts.slice()
      for (let i = 0; i < pts.length; i += 3) {
        pts[i] *= sx
        pts[i + 1] *= sy
      }
      return { ...shape, props: { ...p, pts } }
    }
    case 'geo':
      return { ...shape, props: { ...p, w: Math.max(1, p.w * sx), h: Math.max(1, p.h * sy) } }
    case 'arrow':
    case 'line':
      return { ...shape, props: { ...p, dx: p.dx * sx, dy: p.dy * sy, ...(p.bend ? { bend: p.bend * Math.sqrt(Math.abs(sx * sy)) } : {}) } }
    case 'image':
      return { ...shape, props: { ...p, w: Math.max(1, p.w * sx), h: Math.max(1, p.h * sy) } }
    case 'text': {
      // uniform corner scale grows the type itself
      const s = Math.sqrt(Math.abs(sx * sy))
      return { ...shape, props: { ...p, scale: Math.max(0.2, (p.scale || 1) * s), ...(p.autosize === false && p.w ? { w: p.w * sx } : {}) } }
    }
    case 'note': {
      const s = Math.sqrt(Math.abs(sx * sy))
      return { ...shape, props: { ...p, scale: Math.max(0.3, (p.scale || 1) * s) } }
    }
    default:
      return shape
  }
}
