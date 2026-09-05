// The Quickdraw editor: camera, tools, selection, input and rendering over a
// Store. Framework-free — the React and React Native SDKs wrap it, plain
// pages use it bare, and every host gets the identical feel.
// Dependency-free ESM: runs in any modern browser as-is, no build step.

import { Store, newId } from './store.js'
import { themeOf, SIZES, FONT_SIZES, GEO_IDS, COLOR_IDS, GRID_IDS, GRID_STEP, GRID_MAJOR } from './palette.js'
import {
  localBounds, pageBounds, toLocal, drawShape, hitShape, marqueeHits,
  scaleShape, textLayout, noteLayout, NOTE_W, sampleLinePts,
} from './shapes.js'
import { boundsUnion, boundsExpand, boundsContain, clamp, rotWith } from './geometry.js'

const ZOOM_MIN = 0.05
const ZOOM_MAX = 8
const HANDLE = 8 // screen px
const RESIZE_CURSORS = {
  tl: 'nwse-resize', br: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize',
  t: 'ns-resize', b: 'ns-resize', l: 'ew-resize', r: 'ew-resize',
}
const DEFAULT_STYLES = { color: 'blue', size: 'm', dash: 'draw', fill: 'none', font: 'draw' }

export const TOOLS = ['select', 'hand', 'draw', 'highlight', 'eraser', 'laser', 'arrow', 'line', 'geo', 'text', 'note']

// local position of the bend handle: the curve's midpoint (chord midpoint
// when straight — sampleLinePts collapses to the two endpoints at bend 0)
const bendMidpoint = (pr) => {
  if (!pr.bend) return { x: pr.dx / 2, y: pr.dy / 2 }
  const mid = sampleLinePts(pr, pr.bend)
  const mi = Math.floor(mid.length / 4) * 2
  return { x: mid[mi], y: mid[mi + 1] }
}

export class Editor {
  constructor({ container, store, theme = 'light', grid = 'lines', readonly = false, camera, styles, geoKind } = {}) {
    this.container = container
    this.store = store || new Store()
    this.theme = themeOf(theme)
    this.grid = GRID_IDS.includes(grid) ? grid : 'lines'
    this.readonly = !!readonly
    this.camera = camera || { x: 0, y: 0, z: 1 }
    this.styles = { ...DEFAULT_STYLES, ...(styles || {}) }
    this.geoKind = geoKind || 'rectangle'
    this.tool = 'draw'
    this.selection = new Set()
    this.session = null
    this.editing = null // { id, textarea, field: 'text' | 'label' }
    this.scribbles = [] // local laser strokes
    this.remoteScribbles = []
    this.remoteScribblesAt = 0
    this.spaceHeld = false
    this.captureCanvas = null
    // pen mode: once a stylus is seen, fingers stop drawing — a resting palm
    // is ignored, two fingers still steer the camera. setPenMode(false) opts
    // back out; auto-arm happens only once so that choice sticks.
    this.penMode = false
    this._penSeen = false
    this._penDown = false
    this._events = new Map()
    this._raf = 0
    this._camAnim = 0
    this._pointers = new Map()
    this._ptrType = new Map() // pointerId -> pointerType, for pen-mode gating
    this._destroyed = false

    // DOM
    container.classList.add('qd-root')
    container.tabIndex = 0
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'qd-canvas'
    this.overlay = document.createElement('canvas')
    this.overlay.className = 'qd-overlay'
    container.prepend(this.overlay)
    container.prepend(this.canvas)

    this._bind()
    this._unsubStore = this.store.listen(() => {
      this._pruneSelection()
      this.requestRender()
      this.emit('change')
    })
    // history moves on its own channel: the end of a gesture batch changes
    // canUndo/canRedo without emitting a document diff
    this._unsubHistory = this.store.listenHistory(() => this.emit('history'))
    this.requestRender()
  }

  // ---- events --------------------------------------------------------------
  on(ev, fn) {
    if (!this._events.has(ev)) this._events.set(ev, new Set())
    this._events.get(ev).add(fn)
    return () => this._events.get(ev).delete(fn)
  }
  emit(ev, ...args) {
    const s = this._events.get(ev)
    if (s) for (const fn of [...s]) { try { fn(...args) } catch (e) { console.warn('board event failed', e) } }
  }

  // ---- camera --------------------------------------------------------------
  viewSize() {
    return { w: this.container.clientWidth || 1, h: this.container.clientHeight || 1 }
  }
  screenToPage(sx, sy) {
    const c = this.camera
    return { x: sx / c.z - c.x, y: sy / c.z - c.y }
  }
  pageToScreen(px, py) {
    const c = this.camera
    return { x: (px + c.x) * c.z, y: (py + c.y) * c.z }
  }
  viewportPageBounds() {
    const { w, h } = this.viewSize()
    const c = this.camera
    return { x: -c.x, y: -c.y, w: w / c.z, h: h / c.z }
  }
  setCamera(cam, { animate = 0 } = {}) {
    this._cancelFitEase()
    cancelAnimationFrame(this._camAnim)
    if (!animate) {
      this.camera = { ...cam }
      this._afterCamera()
      return
    }
    const from = { ...this.camera }
    const t0 = performance.now()
    const step = (now) => {
      const t = Math.min(1, (now - t0) / animate)
      const e = 1 - Math.pow(1 - t, 3)
      this.camera = {
        x: from.x + (cam.x - from.x) * e,
        y: from.y + (cam.y - from.y) * e,
        z: from.z + (cam.z - from.z) * e,
      }
      this._afterCamera()
      if (t < 1) this._camAnim = requestAnimationFrame(step)
    }
    this._camAnim = requestAnimationFrame(step)
  }
  _afterCamera() {
    this.requestRender()
    this.emit('camera')
  }
  pan(dxScreen, dyScreen) {
    const c = this.camera
    this.setCamera({ ...c, x: c.x + dxScreen / c.z, y: c.y + dyScreen / c.z })
  }
  zoomAt(sx, sy, mult, opts) {
    const c = this.camera
    const z = clamp(c.z * mult, ZOOM_MIN, ZOOM_MAX)
    const p = this.screenToPage(sx, sy)
    this.setCamera({ z, x: sx / z - p.x, y: sy / z - p.y }, opts)
  }
  contentBounds() {
    let b = null
    for (const s of this.store.shapes()) b = boundsUnion(b, pageBounds(s))
    return b
  }
  // Re-fit the camera to the drawn content with a margin — the transition
  // companion. Zoom capped at 1:1 so a lone small mark doesn't blow up.
  // `ease` (ms): one rAF loop owns the camera for the whole beat — the fit
  // target re-reads the live-resizing frame every frame, the camera's
  // starting offset from it decays once, and the render happens in the same
  // frame as the camera write. Resize ticks that arrive while the ease is
  // running are no-ops; a second driver on another clock reads as judder.
  fitContent({ margin = 0.08, maxZoom = 1, animate = 0, ease = 0 } = {}) {
    // called before the container has layout (mount effects, hidden tabs):
    // defer until the first render tick that sees real dimensions, or the
    // camera would clamp to minimum zoom and strand the drawing microscopic
    if (this._deferFit(() => this.fitContent({ margin, maxZoom, animate, ease }))) return
    const fitNow = () => {
      const b = this.contentBounds()
      if (!b || b.w <= 0 || b.h <= 0) return null
      const { w, h } = this.viewSize()
      const inset = Math.min(w, h) * margin
      const z = clamp(Math.min(maxZoom, (w - inset * 2) / b.w, (h - inset * 2) / b.h), ZOOM_MIN, ZOOM_MAX)
      if (!isFinite(z) || z <= 0) return null
      return { z, x: w / 2 / z - (b.x + b.w / 2), y: h / 2 / z - (b.y + b.h / 2) }
    }
    if (!ease) {
      const fit = fitNow()
      if (fit) this.setCamera(fit, { animate })
      return
    }
    this._easeToFit(fitNow, ease)
  }
  // Fit an explicit page rect into the view — e.g. a remote peer's viewport,
  // mirrored live. Cover-fit: the rect's center stays centered and the
  // frame fills edge to edge, so differing aspect ratios crop rather than
  // letterbox. `ease` tracks a live frame resize exactly like fitContent's.
  followBounds(b, { animate = 0, ease = 0 } = {}) {
    if (!b || !(b.w > 0) || !(b.h > 0)) return
    if (this._deferFit(() => this.followBounds(b, { animate, ease }))) return
    const fitNow = () => {
      const { w, h } = this.viewSize()
      const z = clamp(Math.max(w / b.w, h / b.h), ZOOM_MIN, ZOOM_MAX)
      if (!isFinite(z) || z <= 0) return null
      return { z, x: w / 2 / z - (b.x + b.w / 2), y: h / 2 / z - (b.y + b.h / 2) }
    }
    if (!ease) {
      const fit = fitNow()
      if (fit) this.setCamera(fit, { animate })
      return
    }
    this._easeToFit(fitNow, ease)
  }
  // true (and remembers the retry) while the container has no layout yet;
  // render() replays the latest pending fit once real dimensions appear
  _deferFit(retry) {
    const { w, h } = this.viewSize()
    if (w > 1 && h > 1) return false
    this._pendingFit = retry
    return true
  }
  // one rAF loop owns the camera for the whole beat: the fit target re-reads
  // the live-resizing frame every frame, the starting offset decays once
  _easeToFit(fitNow, ease) {
    if (this._fitEase) return // the loop below is already tracking the frame
    const fit0 = fitNow()
    if (!fit0) return
    const c = this.camera
    const fe = this._fitEase = { t0: 0, dur: ease, dx: c.x - fit0.x, dy: c.y - fit0.y, dz: c.z - fit0.z }
    cancelAnimationFrame(this._camAnim)
    const step = (now) => {
      if (this._fitEase !== fe || this._destroyed) return
      if (!fe.t0) fe.t0 = now
      const t = Math.min(1, (now - fe.t0) / fe.dur)
      const e = 1 - Math.pow(1 - t, 3)
      const fit = fitNow()
      if (fit) {
        this.camera = {
          z: fit.z + fe.dz * (1 - e),
          x: fit.x + fe.dx * (1 - e),
          y: fit.y + fe.dy * (1 - e),
        }
        this.render()
        this.emit('camera')
      }
      if (t < 1) this._fitEaseRaf = requestAnimationFrame(step)
      else this._fitEase = null
    }
    this._fitEaseRaf = requestAnimationFrame(step)
  }
  _cancelFitEase() {
    this._fitEase = null
    cancelAnimationFrame(this._fitEaseRaf)
  }
  // ---- tools / styles ------------------------------------------------------
  setTool(tool) {
    if (!TOOLS.includes(tool)) return
    this._commitText()
    this.tool = tool
    if (tool !== 'select') this.setSelection([])
    this._syncCursor()
    this.emit('tool')
    this.requestRender()
  }
  setGeoKind(kind) {
    if (GEO_IDS.includes(kind)) { this.geoKind = kind; this.emit('tool') }
  }
  setTheme(id) {
    const t = themeOf(id)
    if (t === this.theme) return
    this._crossfadeTheme()
    this.theme = t
    this.container.dataset.qdTheme = t.id
    this.requestRender()
    this.emit('theme')
  }
  // Freeze the outgoing theme as a bitmap over the board and fade it out, so
  // a theme switch melts from one paper to the other instead of hard-cutting.
  _crossfadeTheme() {
    if (this._destroyed) return
    if (typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const w = this.canvas.width, h = this.canvas.height
    if (!w || !h) return
    try {
      const snap = document.createElement('canvas')
      snap.width = w
      snap.height = h
      snap.getContext('2d').drawImage(this.canvas, 0, 0)
      snap.className = 'qd-theme-fade'
      this._themeFade?.remove()
      this._themeFade = snap
      this.overlay.after(snap)
      // two frames: one to paint at full opacity, one to start the transition
      requestAnimationFrame(() => requestAnimationFrame(() => { snap.style.opacity = '0' }))
      const done = () => {
        snap.remove()
        if (this._themeFade === snap) this._themeFade = null
      }
      snap.addEventListener('transitionend', done, { once: true })
      setTimeout(done, 600) // safety net if transitionend never fires
    } catch {
      // a stubbed 2D context (tests, exotic embeds) just skips the fade
    }
  }
  // 'none' | 'lines' | 'dots' — the backdrop behind the drawing
  setGrid(id) {
    if (!GRID_IDS.includes(id) || id === this.grid) return
    this.grid = id
    this.requestRender()
    this.emit('grid')
  }
  setReadonly(ro) {
    this.readonly = !!ro
    if (ro) { this._cancelSession(); this._commitText(); this.setSelection([]) }
    this._syncCursor()
  }
  setPenMode(on) {
    on = !!on
    if (this.penMode === on) return
    this.penMode = on
    this.emit('penmode')
  }
  // pointers eligible for the two-finger pinch: in pen mode the pen itself
  // never counts — only fingers steer the camera
  _pinchPoints() {
    const pts = []
    for (const [id, p] of this._pointers) {
      if (this.penMode && this._ptrType.get(id) === 'pen') continue
      pts.push(p)
    }
    return pts
  }
  setStyle(key, value) {
    this.styles = { ...this.styles, [key]: value }
    if (this.selection.size) {
      const APPLIES = {
        color: ['draw', 'highlight', 'geo', 'arrow', 'line', 'text', 'note'],
        size: ['draw', 'highlight', 'geo', 'arrow', 'line', 'text', 'note'],
        dash: ['draw', 'geo', 'arrow', 'line'],
        fill: ['geo'],
        font: ['text', 'note', 'geo'],
      }
      this.store.transact(() => {
        for (const id of this.selection) {
          const s = this.store.get(id)
          if (s && APPLIES[key]?.includes(s.type)) this.store.update(id, { props: { [key]: value } })
        }
      })
    }
    this.emit('styles')
  }
  // shared styles of the selection (null value = mixed), or the pen styles
  currentStyles() {
    if (!this.selection.size) return { ...this.styles }
    const out = {}
    for (const id of this.selection) {
      const s = this.store.get(id)
      if (!s) continue
      for (const k of ['color', 'size', 'dash', 'fill', 'font']) {
        if (s.props[k] === undefined) continue
        if (!(k in out)) out[k] = s.props[k]
        else if (out[k] !== s.props[k]) out[k] = null
      }
    }
    return { ...this.styles, ...out }
  }

  // ---- selection -----------------------------------------------------------
  setSelection(ids) {
    this.selection = new Set(ids)
    this.requestRender()
    this.emit('selection')
  }
  _pruneSelection() {
    let dirty = false
    for (const id of this.selection) if (!this.store.has(id)) { this.selection.delete(id); dirty = true }
    if (dirty) this.emit('selection')
  }
  selectionBounds() {
    let b = null
    for (const id of this.selection) {
      const s = this.store.get(id)
      if (s) b = boundsUnion(b, pageBounds(s))
    }
    return b
  }
  deleteSelection() {
    if (!this.selection.size) return
    this.store.remove([...this.selection])
    this.setSelection([])
  }
  // Empties the board in one undoable step (⇧⌘⌫, or the board menu).
  clearBoard() {
    if (!this.store.ids().length) return
    this._cancelSession()
    this._commitText()
    this.store.clear()
    this.setSelection([])
  }
  selectAll() {
    if (this.tool !== 'select') this.setTool('select')
    this.setSelection(this.store.shapes().map((s) => s.id))
  }
  duplicateSelection(offset = 16) {
    if (!this.selection.size) return
    const ids = []
    let z = this.store.maxZ()
    this.store.transact(() => {
      for (const id of this.selection) {
        const s = this.store.get(id)
        if (!s || s.typeName === 'asset') continue
        const copy = { ...s, id: newId(), x: s.x + offset, y: s.y + offset, z: ++z }
        this.store.put(copy)
        ids.push(copy.id)
      }
    })
    this.setSelection(ids)
  }
  bringToFront() {
    let z = this.store.maxZ()
    const sel = this.store.shapes().filter((s) => this.selection.has(s.id)).sort((a, b) => a.z - b.z)
    this.store.transact(() => { for (const s of sel) this.store.update(s.id, { z: ++z }) })
  }
  sendToBack() {
    let z = this.store.minZ()
    const sel = this.store.shapes().filter((s) => this.selection.has(s.id)).sort((a, b) => b.z - a.z)
    this.store.transact(() => { for (const s of sel) this.store.update(s.id, { z: --z }) })
  }

  shapesSorted() {
    // highlighter lives under the ink, like on paper — highlights render
    // first (in their own z order), everything else above
    return this.store.shapes().sort(
      (a, b) =>
        (a.type === 'highlight' ? 0 : 1) - (b.type === 'highlight' ? 0 : 1) ||
        a.z - b.z ||
        (a.id < b.id ? -1 : 1)
    )
  }
  hitTest(px, py) {
    const tol = 8 / this.camera.z
    const list = this.shapesSorted()
    for (let i = list.length - 1; i >= 0; i--) {
      if (hitShape(list[i], px, py, tol, this.store)) return list[i]
    }
    return null
  }

  // ---- input ---------------------------------------------------------------
  _bind() {
    const c = this.container
    this._onDown = (e) => this._pointerDown(e)
    this._onMove = (e) => this._pointerMove(e)
    this._onUp = (e) => this._pointerUp(e)
    this._onWheel = (e) => this._wheel(e)
    this._onKeyDown = (e) => this._keyDown(e)
    this._onKeyUp = (e) => this._keyUp(e)
    this._onDblClick = (e) => this._dblClick(e)
    this._onDrop = (e) => this._drop(e)
    this._onDragOver = (e) => { e.preventDefault(); e.stopPropagation() }
    this._onPaste = (e) => this._paste(e)
    c.addEventListener('pointerdown', this._onDown)
    c.addEventListener('pointermove', this._onMove)
    c.addEventListener('pointerup', this._onUp)
    c.addEventListener('pointercancel', this._onUp)
    c.addEventListener('wheel', this._onWheel, { passive: false })
    c.addEventListener('keydown', this._onKeyDown)
    c.addEventListener('keyup', this._onKeyUp)
    c.addEventListener('dblclick', this._onDblClick)
    c.addEventListener('drop', this._onDrop)
    c.addEventListener('dragover', this._onDragOver)
    c.addEventListener('paste', this._onPaste)
    // losing focus mid-gesture (a host app may reclaim the space key by
    // blurring the board) must not leave a sticky space-pan behind
    this._onBlur = () => { this.spaceHeld = false; this._syncCursor() }
    c.addEventListener('blur', this._onBlur)
    this._ro = new ResizeObserver(() => this.requestRender())
    this._ro.observe(c)
  }

  _evPoint(e) {
    const r = this.container.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  _pointerDown(e) {
    if (this.readonly) return
    if (e.target !== this.canvas && e.target !== this.overlay && e.target !== this.container) return
    if (e.button === 2) return
    if (this.editing) this._commitText()
    this.container.focus({ preventScroll: true })
    const s = this._evPoint(e)
    this._pointers.set(e.pointerId, s)
    this._ptrType.set(e.pointerId, e.pointerType)
    try { this.container.setPointerCapture(e.pointerId) } catch {}

    if (e.pointerType === 'pen') {
      this._penDown = true
      // first stylus contact arms pen mode, once — turning it off is a choice
      if (!this._penSeen) { this._penSeen = true; this.setPenMode(true) }
    }

    // second finger: the gesture becomes a pinch — a just-started stroke is
    // taken back, it was the start of a zoom, not a mark. While the pen is
    // down in pen mode, landing fingers are a resting palm, never a pinch.
    if (!this.penMode || e.pointerType !== 'pen') {
      const pp = this._pinchPoints()
      if (pp.length === 2 && !(this.penMode && this._penDown)) {
        this._abortForPinch()
        const [a, b] = pp
        this.session = {
          type: 'pinch',
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          cam: { ...this.camera },
        }
        return
      }
      if (pp.length > 2) return
    }
    // in pen mode a finger never draws
    if (this.penMode && e.pointerType === 'touch') return
    if (this._pointers.size > 2) return
    if (this.session?.type === 'pinch') return

    const p = this.screenToPage(s.x, s.y)
    if (e.button === 1 || this.spaceHeld || this.tool === 'hand') {
      this.session = { type: 'panning', last: s }
      this._syncCursor('grabbing')
      return
    }

    switch (this.tool) {
      case 'draw':
      case 'highlight': return this._beginDraw(e, p)
      case 'eraser': return this._beginErase(p)
      case 'laser': return this._beginLaser(p)
      case 'arrow':
      case 'line': return this._beginLineish(this.tool, p, e)
      case 'geo': return this._beginGeo(p, e)
      // placing waits for pointerup: the textarea we focus would otherwise be
      // blurred again by the browser's default focus-on-mousedown action
      case 'text':
      case 'note':
        this.session = { type: 'placing', tool: this.tool, page: p }
        return
      case 'select': return this._beginSelect(e, s, p)
    }
  }

  _pointerMove(e) {
    if (this.readonly) return
    if (this._pointers.has(e.pointerId)) this._pointers.set(e.pointerId, this._evPoint(e))
    const ss = this.session
    if (!ss) {
      this._hoverCursor(e)
      return
    }
    // in pen mode a finger only ever steers the camera — a palm dragging
    // across the glass must not extend the pen's stroke
    if (this.penMode && e.pointerType === 'touch' && ss.type !== 'pinch' && ss.type !== 'panning') return
    const s = this._evPoint(e)
    const p = this.screenToPage(s.x, s.y)

    switch (ss.type) {
      case 'pinch': {
        const pp = this._pinchPoints()
        if (pp.length < 2) return
        const [a, b] = pp
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const z = clamp(ss.cam.z * (dist / ss.dist), ZOOM_MIN, ZOOM_MAX)
        // keep the page point under the initial pinch center pinned, then pan
        // with the center as it travels
        const p0 = { x: ss.center.x / ss.cam.z - ss.cam.x, y: ss.center.y / ss.cam.z - ss.cam.y }
        this.setCamera({ z, x: center.x / z - p0.x, y: center.y / z - p0.y })
        return
      }
      case 'panning': {
        this.pan(s.x - ss.last.x, s.y - ss.last.y)
        ss.last = s
        return
      }
      case 'drawing': return this._extendDraw(e, p)
      case 'erasing': return this._extendErase(p)
      case 'lasering': return this._extendLaser(p)
      case 'lineish': return this._dragLineish(p, e)
      case 'geo-create': return this._dragGeo(p, e)
      case 'marquee': {
        ss.rect = {
          x: Math.min(ss.origin.x, p.x), y: Math.min(ss.origin.y, p.y),
          w: Math.abs(p.x - ss.origin.x), h: Math.abs(p.y - ss.origin.y),
        }
        const hits = this.shapesSorted().filter((sh) => marqueeHits(sh, ss.rect)).map((sh) => sh.id)
        this.setSelection(ss.additive ? [...new Set([...ss.base, ...hits])] : hits)
        return
      }
      case 'translating': return this._dragTranslate(p, e)
      case 'resizing': return this._dragResize(p, e)
      case 'rotating': return this._dragRotate(p, e)
      case 'handle': return this._dragHandle(p, e)
      case 'pressing': {
        if (Math.hypot(s.x - ss.start.x, s.y - ss.start.y) > 4) {
          // the press became a drag — start translating (alt = drag a copy)
          this.session = null
          this._beginTranslate(ss.page, e)
          if (this.session) this._dragTranslate(p, e)
        }
        return
      }
    }
  }

  _pointerUp(e) {
    this._pointers.delete(e.pointerId)
    this._ptrType.delete(e.pointerId)
    if (e.pointerType === 'pen') this._penDown = false
    const ss = this.session
    if (!ss) return
    if (ss.type === 'pinch') {
      if (this._pinchPoints().length < 2) this.session = null
      return
    }
    // a palm lift in pen mode must not end the pen's live stroke
    if (this.penMode && e.pointerType === 'touch' && ss.type !== 'panning') return
    switch (ss.type) {
      case 'panning':
        this.session = null
        this._syncCursor()
        return
      case 'drawing': return this._endDraw()
      case 'erasing': return this._endErase()
      case 'lasering': return this._endLaser()
      case 'lineish': return this._endLineish()
      case 'geo-create': return this._endGeo()
      case 'marquee':
        this.session = null
        this.requestRender()
        return
      case 'translating': return this._endTranslate()
      case 'placing': {
        this.session = null
        ss.tool === 'note' ? this._placeNote(ss.page) : this._placeText(ss.page)
        return
      }
      case 'resizing':
      case 'rotating':
      case 'handle':
        this.store.endBatch()
        this.session = null
        this._syncCursor()
        this.requestRender()
        return
      case 'pressing': {
        // a clean click: selection settles to the pressed shape (or clears);
        // an additive click toggles — unless the down-stroke just added it
        if (ss.hit) this.setSelection(ss.additive ? (ss.added ? [...this.selection] : this._toggled(ss.hit.id)) : [ss.hit.id])
        else if (!ss.additive) this.setSelection([])
        this.session = null
        return
      }
    }
  }

  _toggled(id) {
    const next = new Set(this.selection)
    next.has(id) ? next.delete(id) : next.add(id)
    return [...next]
  }

  _abortForPinch() {
    const ss = this.session
    if (!ss) return
    if (ss.type === 'drawing') {
      this.store.remove([ss.id])
      this.store.endBatch()
    } else if (ss.type === 'lineish' || ss.type === 'geo-create') {
      this.store.remove([ss.id])
      this.store.endBatch()
    } else if (['translating', 'resizing', 'rotating', 'handle', 'erasing'].includes(ss.type)) {
      this.store.endBatch()
    }
    this.session = null
  }
  _cancelSession() {
    this._abortForPinch()
    this.requestRender()
  }

  // ---- draw / highlight ----------------------------------------------------
  _beginDraw(e, p) {
    const type = this.tool
    const id = newId()
    this.store.beginBatch()
    const shape = {
      id, typeName: 'shape', type, x: p.x, y: p.y, rot: 0, z: this.store.maxZ() + 1,
      props: {
        pts: [0, 0, e.pressure || 0.5],
        color: this.styles.color,
        size: this.styles.size,
        // the pencil honors the line style too: 'draw' is pressure ink, the
        // others render as an even-width (dashed/dotted/solid) line
        ...(type === 'draw' ? { dash: this.styles.dash } : {}),
        done: false,
        ...(e.pointerType === 'pen' ? { isPen: true } : {}),
      },
    }
    this.store.put(shape)
    this.session = { type: 'drawing', id, last: p }
  }
  _extendDraw(e, p) {
    const ss = this.session
    const shape = this.store.get(ss.id)
    if (!shape) { this.session = null; return }
    const minD = 1.25 / this.camera.z
    if (Math.hypot(p.x - ss.last.x, p.y - ss.last.y) < minD) return
    ss.last = p
    // coalesced points ride along for pens — extra fidelity is free
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]
    const pts = shape.props.pts.slice()
    for (const ce of evs.length ? evs : [e]) {
      const cp = this.screenToPage(...(() => { const r = this._evPoint(ce); return [r.x, r.y] })())
      pts.push(cp.x - shape.x, cp.y - shape.y, ce.pressure || 0.5)
    }
    this.store.update(ss.id, { props: { pts } })
  }
  _endDraw() {
    const ss = this.session
    if (this.store.get(ss.id)) this.store.update(ss.id, { props: { done: true } })
    this.store.endBatch()
    this.session = null
  }

  // ---- eraser --------------------------------------------------------------
  _beginErase(p) {
    this.session = { type: 'erasing', hits: new Set(), trail: [p.x, p.y], last: p }
    this._eraseAt(p)
    this.requestRender()
  }
  _extendErase(p) {
    const ss = this.session
    // test along the swept segment so fast swipes don't tunnel through shapes
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - ss.last.x, p.y - ss.last.y) / (6 / this.camera.z)))
    for (let i = 1; i <= steps; i++) {
      this._eraseAt({ x: ss.last.x + ((p.x - ss.last.x) * i) / steps, y: ss.last.y + ((p.y - ss.last.y) * i) / steps })
    }
    ss.trail.push(p.x, p.y)
    if (ss.trail.length > 40) ss.trail.splice(0, ss.trail.length - 40)
    ss.last = p
    this.requestRender()
  }
  _eraseAt(p) {
    const hit = this.hitTest(p.x, p.y)
    if (hit) this.session.hits.add(hit.id)
  }
  _endErase() {
    const hits = [...this.session.hits]
    this.session = null
    if (hits.length) this.store.remove(hits) // one transaction — one undo
    this.requestRender()
  }

  // ---- laser ---------------------------------------------------------------
  _beginLaser(p) {
    const stroke = { id: newId('scrib'), points: [{ x: p.x, y: p.y }], opacity: 1, done: false, at: performance.now() }
    this.scribbles.push(stroke)
    this.session = { type: 'lasering', stroke }
    this._laserTick()
    this.emit('scribbles')
  }
  _extendLaser(p) {
    const st = this.session.stroke
    st.points.push({ x: p.x, y: p.y })
    if (st.points.length > 220) st.points.splice(0, st.points.length - 220)
    st.at = performance.now()
    this.emit('scribbles')
    this.requestRender()
  }
  _endLaser() {
    this.session.stroke.done = true
    this.session.stroke.at = performance.now()
    this.session = null
    this.emit('scribbles')
  }
  _laserTick() {
    if (this._laserRaf) return
    const tick = () => {
      this._laserRaf = 0
      const now = performance.now()
      let dirty = false
      this.scribbles = this.scribbles.filter((st) => {
        if (!st.done) return true
        const age = now - st.at
        const o = 1 - Math.max(0, age - 250) / 850
        if (o !== st.opacity) { st.opacity = Math.max(0, o); dirty = true }
        return o > 0
      })
      if (dirty) { this.emit('scribbles'); this.requestRender() }
      if (this.scribbles.length || this.remoteScribbles.length) this._laserRaf = requestAnimationFrame(tick)
    }
    this._laserRaf = requestAnimationFrame(tick)
  }
  // remote laser (a collaborator's) — drawn like ours, kept fresh by the caller
  setRemoteScribbles(list) {
    this.remoteScribbles = list || []
    this.remoteScribblesAt = performance.now()
    this._laserTick()
    this.requestRender()
  }
  getScribbles() {
    return this.scribbles.map((s) => ({ points: s.points, opacity: s.opacity }))
  }

  // ---- line / arrow --------------------------------------------------------
  _beginLineish(type, p, e) {
    const id = newId()
    this.store.beginBatch()
    this.store.put({
      id, typeName: 'shape', type, x: p.x, y: p.y, rot: 0, z: this.store.maxZ() + 1,
      props: {
        dx: 0.01, dy: 0.01, bend: 0,
        color: this.styles.color, size: this.styles.size,
        dash: this.styles.dash === 'draw' ? 'solid' : this.styles.dash,
      },
    })
    this.session = { type: 'lineish', id }
  }
  _dragLineish(p, e) {
    const s = this.store.get(this.session.id)
    if (!s) return
    let dx = p.x - s.x, dy = p.y - s.y
    if (e.shiftKey) {
      const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12)
      const len = Math.hypot(dx, dy)
      dx = Math.cos(a) * len
      dy = Math.sin(a) * len
    }
    this.store.update(s.id, { props: { dx, dy } })
  }
  _endLineish() {
    const s = this.store.get(this.session.id)
    this.session = null
    if (s && Math.hypot(s.props.dx, s.props.dy) < 2 / this.camera.z) this.store.remove([s.id])
    this.store.endBatch()
    if (s) { this.setTool('select'); this.setSelection([s.id]) }
  }

  // ---- geo -----------------------------------------------------------------
  _beginGeo(p, e) {
    const id = newId()
    this.store.beginBatch()
    this.store.put({
      id, typeName: 'shape', type: 'geo', x: p.x, y: p.y, rot: 0, z: this.store.maxZ() + 1,
      props: {
        geo: this.geoKind, w: 1, h: 1,
        color: this.styles.color, size: this.styles.size,
        dash: this.styles.dash, fill: this.styles.fill, font: this.styles.font,
      },
    })
    this.session = { type: 'geo-create', id, origin: p, dragged: false }
  }
  _dragGeo(p, e) {
    const ss = this.session
    const s = this.store.get(ss.id)
    if (!s) return
    ss.dragged = true
    let w = p.x - ss.origin.x
    let h = p.y - ss.origin.y
    if (e.shiftKey) {
      const m = Math.max(Math.abs(w), Math.abs(h))
      w = Math.sign(w || 1) * m
      h = Math.sign(h || 1) * m
    }
    this.store.update(ss.id, {
      x: Math.min(ss.origin.x, ss.origin.x + w),
      y: Math.min(ss.origin.y, ss.origin.y + h),
      props: { w: Math.max(1, Math.abs(w)), h: Math.max(1, Math.abs(h)) },
    })
  }
  _endGeo() {
    const ss = this.session
    this.session = null
    const s = this.store.get(ss.id)
    if (s && (!ss.dragged || s.props.w < 4 || s.props.h < 4)) {
      // a click drops a ready-made shape
      this.store.update(s.id, { x: s.x - 80, y: s.y - 80, props: { w: 160, h: 160 } })
    }
    this.store.endBatch()
    if (s) { this.setTool('select'); this.setSelection([s.id]) }
  }

  // ---- text / note ---------------------------------------------------------
  _placeText(p) {
    const id = newId()
    this.store.beginBatch()
    this.store.put({
      id, typeName: 'shape', type: 'text', x: p.x, y: p.y - FONT_SIZES[this.styles.size] * 0.66, rot: 0,
      z: this.store.maxZ() + 1,
      props: { text: '', color: this.styles.color, size: this.styles.size, font: this.styles.font, autosize: true, scale: 1 },
    })
    this.setTool('select')
    this.setSelection([id])
    this._startTextEdit(id, 'text', { fresh: true })
  }
  _placeNote(p) {
    const id = newId()
    this.store.beginBatch()
    this.store.put({
      id, typeName: 'shape', type: 'note', x: p.x - NOTE_W / 2, y: p.y - NOTE_W / 2, rot: 0,
      z: this.store.maxZ() + 1,
      props: { text: '', color: this.styles.color === DEFAULT_STYLES.color ? 'yellow' : this.styles.color, size: 'm', font: this.styles.font, scale: 1 },
    })
    this.setTool('select')
    this.setSelection([id])
    this._startTextEdit(id, 'text', { fresh: true })
  }

  // The text surface: a real textarea floated over the canvas, styled to
  // match the render, so editing feels native (IME, selection, caret).
  _startTextEdit(id, field, { fresh = false } = {}) {
    this._commitText()
    const shape = this.store.get(id)
    if (!shape) return
    if (!fresh) this.store.beginBatch()
    const ta = document.createElement('textarea')
    ta.className = 'qd-text-edit'
    ta.value = field === 'label' ? shape.props.label || '' : shape.props.text || ''
    ta.spellcheck = false
    this.container.appendChild(ta)
    this.editing = { id, field, textarea: ta, fresh }
    const sync = () => {
      const patch = field === 'label' ? { label: ta.value } : { text: ta.value }
      this.store.update(id, { props: patch })
      this._layoutTextEditor()
    }
    ta.addEventListener('input', sync)
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault()
        this._commitText()
        this.container.focus({ preventScroll: true })
      }
    })
    ta.addEventListener('pointerdown', (e) => e.stopPropagation())
    ta.addEventListener('blur', () => this._commitText())
    this._layoutTextEditor()
    ta.focus()
    if (!fresh) ta.select()
    this.emit('edit')
    this.requestRender()
  }
  _layoutTextEditor() {
    const ed = this.editing
    if (!ed) return
    const shape = this.store.get(ed.id)
    if (!shape) return
    const z = this.camera.z
    const ta = ed.textarea
    let lay, pos, w, h, align = 'left'
    if (shape.type === 'note') {
      lay = noteLayout(shape)
      const s = shape.props.scale || 1
      // anchor the textarea where the canvas draws the (vertically centered)
      // text block, so committing doesn't jump the text — 20 = NOTE_PAD
      const yStart = Math.max(20, lay.boxH / 2 - lay.textH / 2)
      pos = this.pageToScreen(shape.x + 20 * s, shape.y + yStart * s)
      w = (NOTE_W - 40) * s
      h = lay.textH * s
      align = 'center'
      ta.style.font = `500 ${lay.fontSize * s * z}px ${lay.font}`
      ta.style.lineHeight = lay.lh * s * z + 'px'
    } else if (shape.type === 'geo' && ed.field === 'label') {
      const p = shape.props
      const fs = FONT_SIZES[p.labelSize || 's']
      const fam = FONTS[p.font || 'draw']
      pos = this.pageToScreen(shape.x + 8, shape.y + 8)
      w = p.w - 16
      h = p.h - 16
      align = 'center'
      ta.style.font = `500 ${fs * z}px ${fam}`
      ta.style.lineHeight = fs * 1.3 * z + 'px'
      ta.style.paddingTop = Math.max(0, (h * z) / 2 - fs * 1.3 * z) / 2 + 'px'
    } else {
      lay = textLayout(shape)
      pos = this.pageToScreen(shape.x, shape.y)
      w = Math.max(lay.w + 4, 40)
      h = lay.h + 4
      const p = shape.props
      align = p.align === 'middle' ? 'center' : p.align === 'end' ? 'right' : 'left'
      ta.style.font = `500 ${lay.fontSize * z}px ${lay.font}`
      ta.style.lineHeight = lay.lh * z + 'px'
    }
    const col = this.theme.colors[shape.props.color || 'black']
    ta.style.left = pos.x + 'px'
    ta.style.top = pos.y + 'px'
    ta.style.width = w * z + 'px'
    ta.style.height = h * z + 'px'
    ta.style.textAlign = align
    ta.style.color = shape.type === 'note' ? this.theme.noteText : col.stroke
  }
  _commitText() {
    const ed = this.editing
    if (!ed) return
    this.editing = null
    const shape = this.store.get(ed.id)
    ed.textarea.remove()
    if (shape) {
      const value = ed.field === 'label' ? shape.props.label : shape.props.text
      if (!String(value || '').trim() && (shape.type === 'text' || (shape.type === 'note' && ed.fresh))) {
        // empty text evaporates
        this.store.remove([ed.id])
        this.selection.delete(ed.id)
      }
    }
    this.store.endBatch()
    this.emit('edit')
    this.requestRender()
  }

  // ---- select tool ---------------------------------------------------------
  _beginSelect(e, s, p) {
    const additive = e.shiftKey
    // handles first — they extend beyond the shapes
    const h = this._hitHandle(s.x, s.y)
    if (h) {
      this.store.beginBatch()
      if (h.kind === 'rotate') {
        const b = this.selectionBounds()
        this.session = {
          type: 'rotating',
          center: { x: b.x + b.w / 2, y: b.y + b.h / 2 },
          start: Math.atan2(p.y - (b.y + b.h / 2), p.x - (b.x + b.w / 2)),
          orig: this._snapshotSelection(),
        }
        this._syncCursor('grabbing')
      } else if (h.kind === 'handle') {
        this.session = { type: 'handle', which: h.which, id: h.id }
      } else {
        this.session = { type: 'resizing', handle: h.which, init: this.selectionBounds(), orig: this._snapshotSelection() }
        this._syncCursor(RESIZE_CURSORS[h.which] || 'default')
      }
      return
    }
    const hit = this.hitTest(p.x, p.y)
    if (hit) {
      const wasSelected = this.selection.has(hit.id)
      if (!wasSelected && !additive) this.setSelection([hit.id])
      else if (additive && !wasSelected) this.setSelection([...this.selection, hit.id])
      // `added` marks a shape shift-selected on the way down, so the clean
      // click on the way up keeps it instead of toggling it straight back out
      this.session = { type: 'pressing', hit, additive, added: additive && !wasSelected, start: s, page: p }
    } else {
      this.session = { type: 'marquee', origin: p, rect: null, additive, base: [...this.selection] }
      if (!additive) this.setSelection([])
    }
  }
  _snapshotSelection() {
    const m = new Map()
    for (const id of this.selection) {
      const sh = this.store.get(id)
      if (sh) m.set(id, sh)
    }
    return m
  }
  _beginTranslate(p, e) {
    if (!this.selection.size) return
    this.store.beginBatch()
    if (e.altKey) this.duplicateSelection(0)
    this.session = { type: 'translating', start: p, orig: this._snapshotSelection() }
    this._syncCursor('move')
  }
  _dragTranslate(p, e) {
    const ss = this.session
    let dx = p.x - ss.start.x
    let dy = p.y - ss.start.y
    if (e.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0)
    this.store.transact(() => {
      for (const [id, orig] of ss.orig) {
        if (this.store.has(id)) this.store.update(id, { x: orig.x + dx, y: orig.y + dy })
      }
    })
  }
  _endTranslate() {
    this.store.endBatch()
    this.session = null
    this._syncCursor()
    this.requestRender()
  }
  _dragResize(p, e) {
    const ss = this.session
    const { handle, init } = ss
    const ax = handle.includes('l') ? init.x + init.w : init.x // anchor
    const ay = handle.includes('t') ? init.y + init.h : init.y
    // scales clamp positive — dragging past the anchor pins at tiny, no flips
    let sx = handle.includes('l') || handle.includes('r')
      ? (p.x - ax) / ((handle.includes('l') ? init.x : init.x + init.w) - ax)
      : 1
    let sy = handle.includes('t') || handle.includes('b')
      ? (p.y - ay) / ((handle.includes('t') ? init.y : init.y + init.h) - ay)
      : 1
    sx = isFinite(sx) ? Math.max(0.02, sx) : 1
    sy = isFinite(sy) ? Math.max(0.02, sy) : 1
    const corner = handle.length === 2
    // corners keep proportions when shift asks, or when everything selected
    // is happier uniform (images, notes, text)
    const uniform =
      corner &&
      (e.shiftKey || [...ss.orig.values()].every((sh) => ['image', 'note', 'text'].includes(sh.type)))
    if (uniform) sx = sy = Math.max(sx, sy)
    this.store.transact(() => {
      for (const [id, orig] of ss.orig) {
        if (!this.store.has(id)) continue
        const scaled = scaleShape(orig, sx, sy)
        // shape origin maps through the anchor like any other point
        this.store.put({ ...scaled, x: ax + (orig.x - ax) * sx, y: ay + (orig.y - ay) * sy })
      }
    })
  }
  _dragRotate(p, e) {
    const ss = this.session
    let delta = Math.atan2(p.y - ss.center.y, p.x - ss.center.x) - ss.start
    if (e.shiftKey) delta = Math.round(delta / (Math.PI / 12)) * (Math.PI / 12)
    this.store.transact(() => {
      for (const [id, orig] of ss.orig) {
        if (!this.store.has(id)) continue
        const lb = localBounds(orig)
        const cx = orig.x + lb.x + lb.w / 2
        const cy = orig.y + lb.y + lb.h / 2
        const nc = rotWith(cx, cy, ss.center.x, ss.center.y, delta)
        this.store.update(id, {
          x: orig.x + nc.x - cx,
          y: orig.y + nc.y - cy,
          rot: ((orig.rot || 0) + delta) % (Math.PI * 2),
        })
      }
    })
  }
  // arrow / line endpoint + bend handles
  _dragHandle(p, e) {
    const ss = this.session
    const s = this.store.get(ss.id)
    if (!s) return
    const pr = s.props
    if (ss.which === 'start') {
      const ex = s.x + pr.dx, ey = s.y + pr.dy
      this.store.update(s.id, { x: p.x, y: p.y, props: { dx: ex - p.x, dy: ey - p.y } })
    } else if (ss.which === 'end') {
      let dx = p.x - s.x, dy = p.y - s.y
      if (e.shiftKey) {
        const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12)
        const len = Math.hypot(dx, dy)
        dx = Math.cos(a) * len
        dy = Math.sin(a) * len
      }
      this.store.update(s.id, { props: { dx, dy } })
    } else if (ss.which === 'bend') {
      // signed distance of the pointer from the straight chord
      const len = Math.hypot(pr.dx, pr.dy) || 1
      const nx = -pr.dy / len, ny = pr.dx / len
      const bend = (p.x - (s.x + pr.dx / 2)) * nx + (p.y - (s.y + pr.dy / 2)) * ny
      this.store.update(s.id, { props: { bend: Math.abs(bend) < 4 / this.camera.z ? 0 : bend } })
    }
  }

  // the pointer tells you what a press would do: resize arrows over handles,
  // move over a selected shape, grab over the rotate knob
  _hoverCursor(e) {
    if (this.tool !== 'select' || this.spaceHeld || this.editing) return
    if (e.target !== this.canvas && e.target !== this.overlay && e.target !== this.container) return
    const s = this._evPoint(e)
    const h = this._hitHandle(s.x, s.y)
    if (h) {
      this._syncCursor(
        h.kind === 'rotate' ? 'grab' : h.kind === 'handle' ? 'pointer' : RESIZE_CURSORS[h.which] || 'default'
      )
      return
    }
    const p = this.screenToPage(s.x, s.y)
    const hit = this.hitTest(p.x, p.y)
    this._syncCursor(hit && this.selection.has(hit.id) ? 'move' : null)
  }

  // which handle sits at screen point? returns { kind, which, id }
  _hitHandle(sx, sy) {
    if (this.tool !== 'select' || !this.selection.size) return null
    const one = this.selection.size === 1 ? this.store.get([...this.selection][0]) : null
    // arrows and lines carry their own handles instead of a resize box
    if (one && (one.type === 'arrow' || one.type === 'line')) {
      const pr = one.props
      const pts = [
        { which: 'start', x: one.x, y: one.y },
        { which: 'end', x: one.x + pr.dx, y: one.y + pr.dy },
      ]
      const bm = bendMidpoint(pr)
      pts.push({ which: 'bend', x: one.x + bm.x, y: one.y + bm.y })
      for (const h of pts) {
        const s = this.pageToScreen(h.x, h.y)
        if (Math.hypot(s.x - sx, s.y - sy) <= HANDLE + 3) return { kind: 'handle', which: h.which, id: one.id }
      }
      return null
    }
    const b = this.selectionBounds()
    if (!b) return null
    const tl = this.pageToScreen(b.x, b.y)
    const br = this.pageToScreen(b.x + b.w, b.y + b.h)
    const rotatable = !one || !['arrow', 'line'].includes(one.type)
    if (rotatable) {
      const rx = (tl.x + br.x) / 2
      const ry = tl.y - 22
      if (Math.hypot(rx - sx, ry - sy) <= HANDLE + 2) return { kind: 'rotate' }
    }
    // resize handles are hidden for a single rotated shape (correct > buggy)
    if (one && one.rot) return null
    const xs = { l: tl.x, m: (tl.x + br.x) / 2, r: br.x }
    const ys = { t: tl.y, m: (tl.y + br.y) / 2, b: br.y }
    for (const which of ['tl', 'tr', 'bl', 'br', 't', 'b', 'l', 'r']) {
      const hx = which.length === 2 ? xs[which[1]] : which === 'l' || which === 'r' ? xs[which] : xs.m
      const hy = which.length === 2 ? ys[which[0]] : which === 't' || which === 'b' ? ys[which] : ys.m
      if (Math.abs(hx - sx) <= HANDLE && Math.abs(hy - sy) <= HANDLE) {
        return { kind: 'resize', which: which.length === 2 ? which : which === 'l' || which === 'r' ? which : which }
      }
    }
    return null
  }

  _dblClick(e) {
    if (this.readonly || this.tool !== 'select') return
    const s = this._evPoint(e)
    const p = this.screenToPage(s.x, s.y)
    const hit = this.hitTest(p.x, p.y)
    if (hit) {
      if (hit.type === 'text' || hit.type === 'note') {
        this.setSelection([hit.id])
        this._startTextEdit(hit.id, 'text')
        return
      }
      if (hit.type === 'geo') {
        this.setSelection([hit.id])
        this._startTextEdit(hit.id, 'label')
        return
      }
      return
    }
    this._placeText(p)
  }

  // ---- keyboard ------------------------------------------------------------
  _keyDown(e) {
    if (this.readonly || this.editing) return
    const meta = e.metaKey || e.ctrlKey
    const k = e.key.toLowerCase()
    if (k === ' ') {
      if (!this.spaceHeld) { this.spaceHeld = true; this._syncCursor() }
      e.preventDefault()
      return
    }
    if (meta && k === 'z') { e.preventDefault(); e.shiftKey ? this.store.redo() : this.store.undo(); return }
    if (meta && k === 'a') { e.preventDefault(); this.selectAll(); return }
    if (meta && k === 'd') { e.preventDefault(); this.duplicateSelection(); return }
    if (meta && k === 'c') { e.preventDefault(); this.copySelection(); return }
    if (meta && k === 'x') { e.preventDefault(); this.copySelection().then(() => this.deleteSelection()); return }
    if (meta && k === 'v') { e.preventDefault(); this.pasteFromClipboard(); return }
    if (meta && (k === '=' || k === '+')) { e.preventDefault(); this._zoomCenter(1.25); return }
    if (meta && k === '-') { e.preventDefault(); this._zoomCenter(1 / 1.25); return }
    if (k === 'escape') {
      if (this.session) this._cancelSession()
      else if (this.selection.size) this.setSelection([])
      else this.setTool('select')
      return
    }
        if (k === '?') { e.preventDefault(); this.emit('help'); return }
    // wipe the board — two modifiers deep, and undoable like any other edit
    if (meta && e.shiftKey && (k === 'delete' || k === 'backspace')) {
      e.preventDefault()
      this.clearBoard()
      return
    }
    if (k === 'delete' || k === 'backspace') { this.deleteSelection(); return }
    if (k === 'enter' && this.selection.size === 1) {
      const s = this.store.get([...this.selection][0])
      if (s && ['text', 'note'].includes(s.type)) { e.preventDefault(); this._startTextEdit(s.id, 'text') }
      else if (s && s.type === 'geo') { e.preventDefault(); this._startTextEdit(s.id, 'label') }
      return
    }
    if (k.startsWith('arrow')) {
      const d = (e.shiftKey ? 32 : 4) / 1
      const dx = k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0
      const dy = k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0
      if (this.selection.size) {
        e.preventDefault()
        this.store.transact(() => {
          for (const id of this.selection) {
            const s = this.store.get(id)
            if (s) this.store.update(id, { x: s.x + dx, y: s.y + dy })
          }
        })
      }
      return
    }
    if (!meta) {
      if (k === ']') { this.bringToFront(); return }
      if (k === '[') { this.sendToBack(); return }
      const toolKeys = {
        v: 'select', '1': 'select', h: 'hand', d: 'draw', p: 'draw', b: 'draw',
        i: 'highlight', e: 'eraser', k: 'laser', a: 'arrow', l: 'line',
        t: 'text', n: 'note', g: 'geo',
      }
      if (toolKeys[k]) { this.setTool(toolKeys[k]); return }
      const geoKeys = { r: 'rectangle', o: 'ellipse' }
      if (geoKeys[k]) { this.setGeoKind(geoKeys[k]); this.setTool('geo'); return }
      if (e.shiftKey && k === '!') { this.fitContent({ animate: 220 }); return }
    }
    if (e.shiftKey && k === '1') { this.fitContent({ animate: 220 }); return }
    if (e.shiftKey && k === '0') {
      const { w, h } = this.viewSize()
      this.zoomAt(w / 2, h / 2, 1 / this.camera.z, { animate: 180 })
    }
  }
  _keyUp(e) {
    if (e.key === ' ') { this.spaceHeld = false; this._syncCursor() }
  }
  _zoomCenter(mult) {
    const { w, h } = this.viewSize()
    this.zoomAt(w / 2, h / 2, mult, { animate: 140 })
  }

  _wheel(e) {
    if (this.readonly) return
    e.preventDefault()
    const s = this._evPoint(e)
    if (e.ctrlKey || e.metaKey) {
      this.zoomAt(s.x, s.y, Math.exp(-e.deltaY * 0.012))
    } else {
      this.pan(-e.deltaX, -e.deltaY)
    }
  }

  _syncCursor(force) {
    const cur = force
      ? force
      : this.readonly
        ? 'default'
        : this.spaceHeld || this.tool === 'hand'
          ? 'grab'
          : ['draw', 'highlight', 'eraser', 'laser', 'arrow', 'line', 'geo'].includes(this.tool)
            ? 'crosshair'
            : this.tool === 'text'
              ? 'text'
              : 'default'
    this.container.style.cursor = cur
  }

  // ---- clipboard / images --------------------------------------------------
  async copySelection() {
    if (!this.selection.size) return
    const shapes = []
    const assets = {}
    for (const id of this.selection) {
      const s = this.store.get(id)
      if (!s) continue
      shapes.push(s)
      if (s.type === 'image' && s.props.assetId) {
        const a = this.store.asset(s.props.assetId)
        if (a) assets[a.id] = a
      }
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify({ quickdraw: 1, shapes, assets }))
    } catch (e) { console.warn('board copy failed', e) }
  }
  async pasteFromClipboard() {
    // images first, then our own shape payloads
    try {
      if (navigator.clipboard.read) {
        const items = await navigator.clipboard.read()
        for (const it of items) {
          const t = it.types.find((t2) => t2.startsWith('image/'))
          if (t) {
            const blob = await it.getType(t)
            this.importImageBlobs([blob])
            return
          }
        }
      }
    } catch {}
    try {
      const text = await navigator.clipboard.readText()
      const data = JSON.parse(text)
      if (data && data.quickdraw && Array.isArray(data.shapes)) this._pasteShapes(data)
    } catch {}
  }
  _pasteShapes(data) {
    let z = this.store.maxZ()
    const ids = []
    this.store.transact(() => {
      const assetMap = {}
      for (const a of Object.values(data.assets || {})) {
        const nid = newId('asset')
        assetMap[a.id] = nid
        this.store.put({ ...a, id: nid })
      }
      for (const s of data.shapes) {
        const nid = newId()
        ids.push(nid)
        this.store.put({
          ...s, id: nid, x: s.x + 16, y: s.y + 16, z: ++z,
          props: s.props.assetId ? { ...s.props, assetId: assetMap[s.props.assetId] || s.props.assetId } : s.props,
        })
      }
    })
    if (this.tool !== 'select') this.setTool('select')
    this.setSelection(ids)
  }
  _paste(e) {
    if (this.readonly || this.editing) return
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'))
    if (files.length) { e.preventDefault(); this.importImageBlobs(files) }
  }
  _drop(e) {
    if (this.readonly) return
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    e.preventDefault()
    e.stopPropagation()
    const s = this._evPoint(e)
    this.importImageBlobs(files, this.screenToPage(s.x, s.y))
  }
  async importImageBlobs(blobs, at) {
    for (const blob of blobs) {
      try {
        const { src, w, h } = await readImage(blob)
        const vp = this.viewportPageBounds()
        // land at a comfortable size: at most ~60% of the view
        const scale = Math.min(1, (vp.w * 0.6) / w, (vp.h * 0.6) / h)
        const pw = Math.max(8, w * scale)
        const ph = Math.max(8, h * scale)
        const cx = at ? at.x : vp.x + vp.w / 2
        const cy = at ? at.y : vp.y + vp.h / 2
        const assetId = newId('asset')
        this.store.transact(() => {
          this.store.put({ id: assetId, typeName: 'asset', src, w, h })
          this.store.put({
            id: newId(), typeName: 'shape', type: 'image',
            x: cx - pw / 2, y: cy - ph / 2, rot: 0, z: this.store.maxZ() + 1,
            props: { w: pw, h: ph, assetId },
          })
        })
        if (at) { at = { x: at.x + 24, y: at.y + 24 } }
      } catch (e2) { console.warn('image import failed', e2) }
    }
  }
  pickImage() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = true
    input.onchange = () => { if (input.files?.length) this.importImageBlobs([...input.files]) }
    input.click()
  }

  // ---- export --------------------------------------------------------------
  // Renders the drawing into a PNG at crisp resolution — with the paper
  // behind it, or on transparency. Everything by default; pass ids (a Set)
  // to export just those shapes.
  async exportImage({ background = true, scale = 2, margin = 48, ids = null } = {}) {
    let b = null
    const shapes = this.shapesSorted().filter((s) => !ids || ids.has(s.id))
    for (const s of shapes) b = boundsUnion(b, pageBounds(s))
    if (!b) return null
    b = boundsExpand(b, margin)
    // stay under ~24MP however big the drawing is
    const cap = Math.sqrt(24e6 / (b.w * b.h))
    const k = Math.min(scale, cap)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(b.w * k))
    canvas.height = Math.max(1, Math.round(b.h * k))
    const ctx = canvas.getContext('2d')
    if (background) {
      ctx.fillStyle = this.theme.background
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      // the grid travels with the paper: an exported board looks like the board
      this._drawGrid(ctx, { x: -b.x, y: -b.y, z: k }, canvas.width, canvas.height, 1)
    }
    ctx.setTransform(k, 0, 0, k, -b.x * k, -b.y * k)
    // make sure every image asset is decoded before the snap
    await this._decodeAssets(shapes)
    for (const s of shapes) drawShape(ctx, s, { theme: this.theme, store: this.store, zoom: k })
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
  }
  async _decodeAssets(shapes) {
    const waits = []
    for (const s of shapes) {
      if (s.type !== 'image' || !s.props.assetId) continue
      const a = this.store.asset(s.props.assetId)
      if (!a) continue
      waits.push(new Promise((res) => {
        const img = new Image()
        img.onload = res
        img.onerror = res
        img.src = a.src
        if (img.complete) res()
      }))
    }
    await Promise.all(waits)
  }

  // ---- rendering -----------------------------------------------------------
  requestRender() {
    if (this._raf || this._destroyed) return
    this._raf = requestAnimationFrame(() => {
      this._raf = 0
      this.render()
    })
  }
  resize() {
    this.requestRender()
  }

  // content-only pass (paper + shapes), reused by the screen, the capture
  // canvas and image export
  renderScene(ctx, cam, w, h, { dpr = 1, background = true, hideEditing = false } = {}) {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    if (background) {
      ctx.fillStyle = this.theme.background
      ctx.fillRect(0, 0, w * dpr, h * dpr)
    } else {
      ctx.clearRect(0, 0, w * dpr, h * dpr)
    }
    if (background) this._drawGrid(ctx, cam, w * dpr, h * dpr, dpr)
    ctx.setTransform(cam.z * dpr, 0, 0, cam.z * dpr, cam.x * cam.z * dpr, cam.y * cam.z * dpr)
    const vp = { x: -cam.x, y: -cam.y, w: w / cam.z, h: h / cam.z }
    const pad = 64 / cam.z
    const vis = boundsExpand(vp, pad)
    for (const s of this.shapesSorted()) {
      const pb = pageBounds(s)
      if (pb.x + pb.w < vis.x || pb.x > vis.x + vis.w || pb.y + pb.h < vis.y || pb.y > vis.y + vis.h) continue
      drawShape(ctx, s, {
        theme: this.theme, store: this.store, zoom: cam.z,
        ghost: this.session?.type === 'erasing' && this.session.hits.has(s.id),
        // the floating textarea is the visible text while editing — but only on
        // screen; capture/export have no DOM, so they keep the canvas text
        hideText: hideEditing && this.editing?.id === s.id ? this.editing.field : null,
        onAssetLoad: () => this.requestRender(),
      })
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }

  // The lattice, drawn in device pixels so rules stay hairline-crisp at any
  // zoom. Spacing doubles or halves to stay in a comfortable band, and a new
  // level fades in as you zoom rather than popping into place.
  // W/H are device px; the ctx must be untransformed.
  _drawGrid(ctx, cam, W, H, dpr) {
    if (this.grid === 'none' || !(cam.z > 0)) return
    // point-like marks (dots, crosses) carry less ink, so they use the darker ramp
    const g = this.theme.grid?.[['dots', 'crosses'].includes(this.grid) ? 'dot' : 'line']
    if (!g) return
    let step = GRID_STEP
    while (step * cam.z < 18) step *= 2
    while (step * cam.z > 72) step /= 2
    const fade = clamp((step * cam.z - 16) / 14, 0, 1)
    if (fade <= 0) return
    const z = cam.z * dpr
    // first line/dot of each axis that lands inside the frame
    const n0 = Math.ceil(-cam.x / step)
    const m0 = Math.ceil(-cam.y / step)
    const isMajor = (i) => i % GRID_MAJOR === 0
    const cols = [], rows = []
    for (let n = n0, x = (n0 * step + cam.x) * z; x <= W; n++, x += step * z) cols.push([x, isMajor(n)])
    for (let m = m0, y = (m0 * step + cam.y) * z; y <= H; m++, y += step * z) rows.push([y, isMajor(m)])

    ctx.save()
    if (this.grid === 'lines' || this.grid === 'ruled') {
      for (const major of [false, true]) {
        ctx.beginPath()
        // half-pixel offsets keep a 1px rule on one device pixel, not two
        if (this.grid === 'lines') {
          for (const [x, m] of cols) if (m === major) { const p = Math.round(x) + 0.5; ctx.moveTo(p, 0); ctx.lineTo(p, H) }
        }
        for (const [y, m] of rows) if (m === major) { const p = Math.round(y) + 0.5; ctx.moveTo(0, p); ctx.lineTo(W, p) }
        ctx.strokeStyle = major ? g.major : g.minor
        ctx.globalAlpha = fade
        ctx.lineWidth = 1
        ctx.stroke()
      }
    } else if (this.grid === 'crosses') {
      // a small + at each intersection — the draughtsman's registration marks
      for (const major of [false, true]) {
        const arm = (major ? 4.5 : 3) * dpr
        ctx.beginPath()
        for (const [y, my] of rows) {
          const py = Math.round(y) + 0.5
          for (const [x, mx] of cols) {
            if ((mx && my) !== major) continue
            const px = Math.round(x) + 0.5
            ctx.moveTo(px - arm, py); ctx.lineTo(px + arm, py)
            ctx.moveTo(px, py - arm); ctx.lineTo(px, py + arm)
          }
        }
        ctx.strokeStyle = major ? g.major : g.minor
        ctx.globalAlpha = fade
        ctx.lineWidth = 1
        ctx.stroke()
      }
    } else if (this.grid === 'iso') {
      // isometric weave: the two 30° diagonal families make a diamond lattice
      // that stays self-aligned at every zoom. One quiet weight — major
      // emphasis turns a woven field into noise.
      const s = Math.tan(Math.PI / 6) // 30° from horizontal
      ctx.beginPath()
      for (const sign of [1, -1]) {
        const slope = sign * s
        // page-space intercepts k*step, mapped into device space
        const b0 = -slope * cam.x + cam.y // device intercept of the k=0 line, /z
        const lo = Math.min(0, -slope * (W / z)) // device-x range → intercept range
        const hi = Math.max(H / z, H / z - slope * (W / z))
        const k0 = Math.ceil((lo - b0) / step)
        const k1 = Math.floor((hi - b0) / step)
        for (let k = k0; k <= k1; k++) {
          const b = (b0 + k * step) * z
          ctx.moveTo(0, b)
          ctx.lineTo(W, b + slope * W)
        }
      }
      ctx.strokeStyle = g.minor
      ctx.globalAlpha = fade
      ctx.lineWidth = 1
      ctx.stroke()
    } else {
      // one weight, one ink — emphasized dots read as stray marks on the paper
      const r = 1.6 * dpr
      ctx.beginPath()
      for (const [y] of rows) {
        for (const [x] of cols) {
          ctx.moveTo(x + r, y)
          ctx.arc(x, y, r, 0, Math.PI * 2)
        }
      }
      ctx.fillStyle = g.minor
      ctx.globalAlpha = fade
      ctx.fill()
    }
    ctx.restore()
  }

  render() {
    if (this._destroyed) return
    if (this._pendingFit) {
      const { w: pw, h: ph } = this.viewSize()
      if (pw > 1 && ph > 1) {
        const fit = this._pendingFit
        this._pendingFit = null
        fit()
      }
    }
    const { w, h } = this.viewSize()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    for (const c of [this.canvas, this.overlay]) {
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr)
        c.height = Math.round(h * dpr)
      }
    }
    const ctx = this.canvas.getContext('2d')
    this.renderScene(ctx, this.camera, w, h, { dpr, hideEditing: true })
    this._renderOverlay(w, h, dpr)
    this._renderCapture()
    if (this.editing) this._layoutTextEditor()
  }

  _renderOverlay(w, h, dpr) {
    const ctx = this.overlay.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height)
    ctx.scale(dpr, dpr)
    const cam = this.camera
    const t = this.theme

    // selection
    if (this.tool === 'select' && this.selection.size && !this.editing) {
      const one = this.selection.size === 1 ? this.store.get([...this.selection][0]) : null
      ctx.strokeStyle = t.selection
      ctx.fillStyle = t.handleFill
      ctx.lineWidth = 1.5
      if (one && (one.type === 'arrow' || one.type === 'line')) {
        const pr = one.props
        const hs = [
          this.pageToScreen(one.x, one.y),
          this.pageToScreen(one.x + pr.dx, one.y + pr.dy),
        ]
        const bm = bendMidpoint(pr)
        hs.push(this.pageToScreen(one.x + bm.x, one.y + bm.y))
        for (const p2 of hs) {
          ctx.beginPath()
          ctx.arc(p2.x, p2.y, 5, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        }
      } else {
        // rotated single shape draws its true (rotated) frame
        if (one && one.rot) {
          const lb = localBounds(one)
          const cx = one.x + lb.x + lb.w / 2
          const cy = one.y + lb.y + lb.h / 2
          ctx.beginPath()
          const corners = [
            [one.x + lb.x, one.y + lb.y], [one.x + lb.x + lb.w, one.y + lb.y],
            [one.x + lb.x + lb.w, one.y + lb.y + lb.h], [one.x + lb.x, one.y + lb.y + lb.h],
          ].map(([px, py]) => {
            const r = rotWith(px, py, cx, cy, one.rot)
            return this.pageToScreen(r.x, r.y)
          })
          ctx.moveTo(corners[0].x, corners[0].y)
          for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y)
          ctx.closePath()
          ctx.stroke()
        }
        const b = this.selectionBounds()
        if (b) {
          const tl = this.pageToScreen(b.x, b.y)
          const br = this.pageToScreen(b.x + b.w, b.y + b.h)
          if (!(one && one.rot)) ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y)
          // rotate handle
          const rx = (tl.x + br.x) / 2
          const ry = tl.y - 22
          ctx.beginPath()
          ctx.moveTo(rx, tl.y)
          ctx.lineTo(rx, ry + 5)
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(rx, ry, 5, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
          if (!(one && one.rot)) {
            for (const [hx, hy] of [
              [tl.x, tl.y], [br.x, tl.y], [tl.x, br.y], [br.x, br.y],
              [(tl.x + br.x) / 2, tl.y], [(tl.x + br.x) / 2, br.y],
              [tl.x, (tl.y + br.y) / 2], [br.x, (tl.y + br.y) / 2],
            ]) {
              ctx.beginPath()
              ctx.rect(hx - 4.5, hy - 4.5, 9, 9)
              ctx.fill()
              ctx.stroke()
            }
          }
        }
      }
    }

    // marquee
    if (this.session?.type === 'marquee' && this.session.rect) {
      const r = this.session.rect
      const tl = this.pageToScreen(r.x, r.y)
      ctx.fillStyle = t.selectionFill
      ctx.strokeStyle = t.selection
      ctx.lineWidth = 1
      ctx.fillRect(tl.x, tl.y, r.w * cam.z, r.h * cam.z)
      ctx.strokeRect(tl.x, tl.y, r.w * cam.z, r.h * cam.z)
    }

    // eraser trail
    if (this.session?.type === 'erasing' && this.session.trail.length > 2) {
      ctx.strokeStyle = t.id === 'dark' ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)'
      ctx.lineWidth = 5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      const tr = this.session.trail
      for (let i = 0; i < tr.length; i += 2) {
        const sp = this.pageToScreen(tr[i], tr[i + 1])
        i === 0 ? ctx.moveTo(sp.x, sp.y) : ctx.lineTo(sp.x, sp.y)
      }
      ctx.stroke()
    }

    // laser scribbles — local and remote, same glow
    const remoteAlive = this.remoteScribbles.length && performance.now() - this.remoteScribblesAt < 2500
    const all = [...this.scribbles, ...(remoteAlive ? this.remoteScribbles : [])]
    for (const sc of all) {
      const pts = sc.points || []
      if (pts.length < 2) continue
      ctx.beginPath()
      for (let i = 0; i < pts.length; i++) {
        const sp = this.pageToScreen(pts[i].x, pts[i].y)
        i === 0 ? ctx.moveTo(sp.x, sp.y) : ctx.lineTo(sp.x, sp.y)
      }
      ctx.strokeStyle = t.scribble
      ctx.lineWidth = 3.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.shadowColor = t.scribble
      ctx.shadowBlur = 9
      ctx.globalAlpha = sc.opacity ?? 1
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.shadowBlur = 0
    }
  }

  // clean pixels for recordings: the current view, contain-fitted into the
  // capture canvas (bands are paper — the compositor's cover crop trims them)
  setCaptureCanvas(canvas) {
    this.captureCanvas = canvas
    if (canvas) this.requestRender()
  }
  // heartbeat repaint for captureStream consumers — repaints ONLY the capture
  // canvas so idle recordings keep receiving frames
  renderCaptureTick() {
    this._renderCapture()
  }
  _renderCapture() {
    const c = this.captureCanvas
    if (!c) return
    // nobody is recording/streaming this board — skip the extra pass
    if (this.captureGate && !this.captureGate()) return
    const { w, h } = this.viewSize()
    if (!w || !h) return
    const cam = this.camera
    const vp = { x: -cam.x, y: -cam.y, w: w / cam.z, h: h / cam.z }
    const z2 = Math.min(c.width / vp.w, c.height / vp.h)
    const cam2 = {
      z: z2,
      x: c.width / 2 / z2 - (vp.x + vp.w / 2),
      y: c.height / 2 / z2 - (vp.y + vp.h / 2),
    }
    const ctx = c.getContext('2d', { alpha: false, desynchronized: true })
    this.renderScene(ctx, cam2, c.width, c.height, { dpr: 1 })
    // remote laser reaches recordings too
    const remoteAlive = this.remoteScribbles.length && performance.now() - this.remoteScribblesAt < 2500
    if (remoteAlive || this.scribbles.length) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      for (const sc of [...this.scribbles, ...(remoteAlive ? this.remoteScribbles : [])]) {
        const pts = sc.points || []
        if (pts.length < 2) continue
        ctx.beginPath()
        for (let i = 0; i < pts.length; i++) {
          const x = (pts[i].x + cam2.x) * cam2.z
          const y = (pts[i].y + cam2.y) * cam2.z
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.strokeStyle = this.theme.scribble
        ctx.lineWidth = 3.5 * (z2 / cam.z)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.shadowColor = this.theme.scribble
        ctx.shadowBlur = 9
        ctx.globalAlpha = sc.opacity ?? 1
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.shadowBlur = 0
      }
    }
  }

  destroy() {
    this._destroyed = true
    this._commitText()
    this._themeFade?.remove()
    this._themeFade = null
    cancelAnimationFrame(this._raf)
    cancelAnimationFrame(this._camAnim)
    cancelAnimationFrame(this._fitEaseRaf || 0)
    cancelAnimationFrame(this._laserRaf || 0)
    this._unsubStore()
    this._unsubHistory()
    this._ro.disconnect()
    const c = this.container
    c.removeEventListener('pointerdown', this._onDown)
    c.removeEventListener('pointermove', this._onMove)
    c.removeEventListener('pointerup', this._onUp)
    c.removeEventListener('pointercancel', this._onUp)
    c.removeEventListener('wheel', this._onWheel)
    c.removeEventListener('keydown', this._onKeyDown)
    c.removeEventListener('keyup', this._onKeyUp)
    c.removeEventListener('dblclick', this._onDblClick)
    c.removeEventListener('drop', this._onDrop)
    c.removeEventListener('dragover', this._onDragOver)
    c.removeEventListener('paste', this._onPaste)
    c.removeEventListener('blur', this._onBlur)
    this.canvas.remove()
    this.overlay.remove()
    c.classList.remove('qd-root')
  }
}

// decode + gently downscale an imported image, return a dataURL asset
async function readImage(blob) {
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    await new Promise((res, rej) => {
      img.onload = res
      img.onerror = rej
      img.src = url
    })
    let { width: w, height: h } = img
    const MAX = 2048
    const k = Math.min(1, MAX / Math.max(w, h))
    if (k < 1 || blob.type === 'image/heic') {
      const c = document.createElement('canvas')
      c.width = Math.round(w * k)
      c.height = Math.round(h * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      const isPhoto = blob.type === 'image/jpeg' || blob.size > 600_000
      return { src: c.toDataURL(isPhoto ? 'image/jpeg' : 'image/png', 0.85), w: c.width, h: c.height }
    }
    const src = await new Promise((res) => {
      const fr = new FileReader()
      fr.onload = () => res(fr.result)
      fr.readAsDataURL(blob)
    })
    return { src, w, h }
  } finally {
    URL.revokeObjectURL(url)
  }
}
