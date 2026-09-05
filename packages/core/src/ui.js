// The board's chrome: a floating dock of tools, a styles popover, and the
// board menu — plain DOM, one implementation for every host framework.
// The dock is responsive: tools overflow into a "more" flyout as the frame
// narrows, and a very small frame folds the whole kit into one button.
// Icons follow the Lucide geometry (24px grid, 2px stroke) so they read as
// the standard set users already know.
// Dependency-free ESM (see palette.js).

import { COLOR_IDS, SIZE_IDS, DASH_IDS, FILL_IDS, GEO_IDS, GRID_IDS, THEMES } from './palette.js'

const SVG = (inner) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`

const ICONS = {
  select: SVG('<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/>'),
  hand: SVG('<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>'),
  draw: SVG('<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>'),
  highlight: SVG('<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4l8 8Z"/>'),
  eraser: SVG('<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>'),
  // a pointer wand with sparks at the tip — the sun-burst read as brightness
  laser: SVG('<path d="m3 21 9-9"/><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h-2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="M12.2 6.2 11 5"/>'),
  line: SVG('<path d="M19 5 5 19"/>'),
  arrow: SVG('<path d="M7 7h10v10"/><path d="M7 17 17 7"/>'),
  text: SVG('<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>'),
  note: SVG('<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/>'),
  image: SVG('<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>'),
  undo: SVG('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>'),
  redo: SVG('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>'),
  menu: SVG('<circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"/>'),
  // double chevron up (the flyout opens above the dock) — dots would read as
  // a second dot-menu next to the board menu's vertical dots
  more: SVG('<path d="m7 12.5 5-5 5 5"/><path d="m7 18.5 5-5 5 5"/>'),
  // geo kinds
  rectangle: SVG('<rect width="18" height="18" x="3" y="3" rx="2"/>'),
  ellipse: SVG('<circle cx="12" cy="12" r="9"/>'),
  triangle: SVG('<path d="M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/>'),
  diamond: SVG('<path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z"/>'),
  hexagon: SVG('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>'),
  star: SVG('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
  cloud: SVG(`<path d="M7 17h10a4 4 0 0 0 .5-8A5.5 5.5 0 0 0 7 10a3.5 3.5 0 0 0 0 7z"/>`),
  // menu glyphs
  download: SVG('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>'),
  transparent: SVG('<rect width="18" height="18" x="3" y="3" rx="2"/><rect x="4" y="4" width="8" height="8" fill="currentColor" fill-opacity=".22" stroke="none"/><rect x="12" y="12" width="8" height="8" fill="currentColor" fill-opacity=".22" stroke="none"/>'),
  copy: SVG('<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"/>'),
  fit: SVG('<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>'),
  trash: SVG('<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'),
  check: SVG('<path d="M20 6 9 17l-5-5"/>'),
  chevronRight: SVG('<path d="m9 18 6-6-6-6"/>'),
  chevronLeft: SVG('<path d="m15 18-6-6 6-6"/>'),
  sun: SVG('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>'),
  moon: SVG('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
}
// the action bar wears the same glyphs the menu already uses
ICONS.duplicate = ICONS.copy
ICONS.delete = ICONS.trash

// grid backdrops: bare paper, ruled lines, dotted intersections
const GRID_ICONS = {
  none: SVG('<rect width="18" height="18" x="3" y="3" rx="2"/>'),
  lines: SVG('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18" stroke-width="1.4"/>'),
  ruled: SVG('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 8.5h18M3 13h18M3 17.5h18" stroke-width="1.4"/>'),
  dots: SVG('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" stroke-width="2.2"/>'),
  crosses: SVG('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 6.5v3M6.5 8h3M16 6.5v3M14.5 8h3M12 10.5v3M10.5 12h3M8 14.5v3M6.5 16h3M16 14.5v3M14.5 16h3" stroke-width="1.3"/>'),
  iso: SVG('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m3 7 10.4 14M8.6 3 19 17M21 7 10.6 21M15.4 3 5 17" stroke-width="1.2"/>'),
}
const GRID_TIPS = {
  none: 'No grid', lines: 'Grid lines', ruled: 'Ruled paper',
  dots: 'Grid dots', crosses: 'Crosses', iso: 'Isometric',
}
const GRID_LABELS = { none: 'None', lines: 'Lines', ruled: 'Ruled', dots: 'Dots', crosses: 'Crosses', iso: 'Isometric' }

const DASH_ICONS = {
  draw: SVG('<path d="M4 15c3.2-4.5 6-5.5 8-3.5s5 1.5 8-4.5"/>'),
  solid: SVG('<path d="M4 12h16"/>'),
  dashed: SVG('<path d="M4 12h3.2M10.4 12h3.2M16.8 12h3.2"/>'),
  dotted: SVG('<path d="M4.5 12h.01M9.5 12h.01M14.5 12h.01M19.5 12h.01" stroke-width="3"/>'),
}
const FILL_ICONS = {
  none: SVG('<rect x="5" y="5" width="14" height="14" rx="2"/>'),
  semi: SVG('<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" fill-opacity="0.18"/>'),
  solid: SVG('<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" fill-opacity="0.45" stroke="none"/><rect x="5" y="5" width="14" height="14" rx="2"/>'),
  pattern: SVG('<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M6 15 15 6M9 18l9-9" stroke-width="1.3"/>'),
}

const TIPS = {
  select: 'Select — V', hand: 'Hand — H', draw: 'Draw — D', highlight: 'Highlight — I',
  eraser: 'Eraser — E', laser: 'Laser — K', line: 'Line — L', arrow: 'Arrow — A',
  geo: 'Shape — G', text: 'Text — T', note: 'Sticky note — N', image: 'Insert image',
  undo: 'Undo — ⌘Z', redo: 'Redo — ⇧⌘Z', menu: 'Board menu', more: 'More tools',
  tools: 'Tools', duplicate: 'Duplicate — ⌘D', delete: 'Delete — ⌫',
}

// dock buttons in visual order (styles/more/menu ride at the end, always)
const DOCK_NAMES = ['select', 'hand', 'draw', 'highlight', 'eraser', 'laser', 'line', 'arrow', 'geo', 'text', 'note', 'image']
// what gives way first as the frame narrows (select and draw never yield)
const DROP_ORDER = ['hand', 'laser', 'line', 'note', 'image', 'highlight', 'text', 'arrow', 'eraser', 'geo']

export function buildUI(editor, { hidden = false, onSave, themeToggle = true, gridControl = true } = {}) {
  const root = editor.container
  // menu switches the host can drop — an app that owns its own theme chrome
  // doesn't want a second control for it on the canvas
  const opts = { themeToggle: themeToggle !== false, gridControl: gridControl !== false }
  const ui = el('div', 'qd-ui')
  root.appendChild(ui)

  let popover = null // { name, el }
  const closePopover = () => {
    if (popover) { popover.el.remove(); popover = null; refresh() }
  }
  const openPopover = (name, build, anchor) => {
    if (popover?.name === name) return closePopover()
    closePopover()
    const p = el('div', 'qd-popover')
    build(p)
    ui.appendChild(p)
    popover = { name, el: p }
    // keep it inside the frame, roughly above its anchor
    requestAnimationFrame(() => {
      const ar = anchor.getBoundingClientRect()
      const rr = root.getBoundingClientRect()
      const pw = p.offsetWidth
      let left = ar.left - rr.left + ar.width / 2 - pw / 2
      left = Math.max(8, Math.min(left, rr.width - pw - 8))
      p.style.left = left + 'px'
    })
    refresh()
  }

  // ---- actions -------------------------------------------------------------
  const run = (name, b) => {
    if (name === 'image') { closePopover(); return editor.pickImage() }
    if (name === 'geo') return geoTap(b)
    closePopover()
    editor.setTool(name)
  }
  // the shape button: every tap arms the current kind AND shows the kinds,
  // so picking a shape never takes a second hunt for the menu
  const geoTap = (b) => {
    editor.setTool('geo')
    openPopover('geo', (p) => {
      p.classList.add('qd-geo-pop')
      for (const g of GEO_IDS) {
        const gb = el('button', 'qd-tool' + (editor.geoKind === g ? ' on' : ''))
        gb.innerHTML = ICONS[g]
        gb.title = g
        gb.addEventListener('click', (ev) => {
          ev.stopPropagation()
          editor.setGeoKind(g)
          editor.setTool('geo')
          closePopover()
        })
        p.appendChild(gb)
      }
    }, b)
  }

  const makeBtn = (name, onClick, cls = 'qd-tool') => {
    const b = el('button', cls)
    b.dataset.name = name
    b.innerHTML = ICONS[name] || ''
    b.title = TIPS[name] || name
    b.addEventListener('pointerdown', (e) => e.stopPropagation())
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(e, b) })
    return b
  }

  // ---- dock ----------------------------------------------------------------
  const dock = el('div', 'qd-dock')
  ui.appendChild(dock)

  const dockBtns = new Map()
  const dividers = []
  const addBtn = (name) => {
    const b = makeBtn(name, (e, b2) => run(name, b2))
    dock.appendChild(b)
    dockBtns.set(name, b)
    return b
  }
  const divider = () => { const d = el('i', 'qd-div'); dock.appendChild(d); dividers.push(d) }

  addBtn('select'); addBtn('hand')
  divider()
  addBtn('draw'); addBtn('highlight'); addBtn('eraser'); addBtn('laser')
  divider()
  addBtn('line'); addBtn('arrow')
  addBtn('geo').classList.add('qd-geo-btn')
  addBtn('text'); addBtn('note'); addBtn('image')
  divider()

  // folded mode: one button wearing the current tool's icon opens the kit
  const toolsBtn = makeBtn('tools', (e, b) => openPopover('tools', (p) => buildGrid(p, [...DOCK_NAMES]), b))
  dock.appendChild(toolsBtn)

  // styles button: a ring of the current color
  const styleBtn = makeBtn('styles', (e, b) => openPopover('styles', buildStyles, b))
  styleBtn.classList.add('qd-style-btn')
  styleBtn.title = 'Color & style'
  const styleDot = el('span', 'qd-style-dot')
  styleBtn.appendChild(styleDot)
  dock.appendChild(styleBtn)

  const moreBtn = makeBtn('more', (e, b) => openPopover('more', (p) => buildGrid(p, hiddenNames), b))
  dock.appendChild(moreBtn)

  const menuBtn = makeBtn('menu', (e, b) => openPopover('menu', buildMenu, b))
  dock.appendChild(menuBtn)

  // ---- action bar ----------------------------------------------------------
  // history + selection actions ride their own small pill so they stay one
  // tap away no matter how far the tool dock folds
  const actionBar = el('div', 'qd-actions')
  ui.appendChild(actionBar)
  const actBtns = new Map()
  const addAction = (name, fn) => {
    const b = makeBtn(name, fn)
    actionBar.appendChild(b)
    actBtns.set(name, b)
    return b
  }
  addAction('undo', () => editor.store.undo())
  addAction('redo', () => editor.store.redo())
  actionBar.appendChild(el('i', 'qd-div'))
  addAction('duplicate', () => editor.duplicateSelection())
  addAction('delete', () => editor.deleteSelection())

  // ---- overflow grid (compact "more" / folded "tools") ---------------------
  function buildGrid(p, names) {
    p.classList.add('qd-grid-pop')
    for (const name of names) {
      const isTool = name !== 'image'
      const b = makeBtn(name, (e, b2) => run(name, b2))
      if (name === 'geo') b.innerHTML = ICONS[editor.geoKind]
      if (isTool && editor.tool === name) b.classList.add('on')
      p.appendChild(b)
    }
  }

  // ---- styles popover ------------------------------------------------------
  const theme = () => THEMES[editor.theme.id]
  function buildStyles(p) {
    p.classList.add('qd-style-pop')
    const cur = editor.currentStyles()
    const row = (cls) => { const r = el('div', 'qd-row ' + cls); p.appendChild(r); return r }

    const colors = row('qd-colors')
    for (const c of COLOR_IDS) {
      const b = el('button', 'qd-dot' + (cur.color === c ? ' on' : ''))
      b.style.setProperty('--dot', theme().colors[c].stroke)
      b.title = c
      b.addEventListener('click', (e) => { e.stopPropagation(); editor.setStyle('color', c); restyle() })
      colors.appendChild(b)
    }
    const sizes = row('qd-sizes')
    SIZE_IDS.forEach((s, i) => {
      const b = el('button', 'qd-opt' + (cur.size === s ? ' on' : ''))
      b.title = 'Size ' + s.toUpperCase()
      b.innerHTML = `<span class="qd-size-pip" style="--pip:${4 + i * 3}px"></span>`
      b.addEventListener('click', (e) => { e.stopPropagation(); editor.setStyle('size', s); restyle() })
      sizes.appendChild(b)
    })
    const dashes = row('qd-dashes')
    for (const d of DASH_IDS) {
      const b = el('button', 'qd-opt' + (cur.dash === d ? ' on' : ''))
      b.title = d === 'draw' ? 'hand-drawn' : d
      b.innerHTML = DASH_ICONS[d]
      b.addEventListener('click', (e) => { e.stopPropagation(); editor.setStyle('dash', d); restyle() })
      dashes.appendChild(b)
    }
    const fills = row('qd-fills')
    for (const f of FILL_IDS) {
      const b = el('button', 'qd-opt' + (cur.fill === f ? ' on' : ''))
      b.title = 'fill: ' + f
      b.innerHTML = FILL_ICONS[f]
      b.addEventListener('click', (e) => { e.stopPropagation(); editor.setStyle('fill', f); restyle() })
      fills.appendChild(b)
    }
    function restyle() {
      const c2 = editor.currentStyles()
      colors.querySelectorAll('.qd-dot').forEach((b, i) => b.classList.toggle('on', COLOR_IDS[i] === c2.color))
      sizes.querySelectorAll('.qd-opt').forEach((b, i) => b.classList.toggle('on', SIZE_IDS[i] === c2.size))
      dashes.querySelectorAll('.qd-opt').forEach((b, i) => b.classList.toggle('on', DASH_IDS[i] === c2.dash))
      fills.querySelectorAll('.qd-opt').forEach((b, i) => b.classList.toggle('on', FILL_IDS[i] === c2.fill))
      refresh()
    }
  }

  // ---- menu ----------------------------------------------------------------
  function buildMenu(p) {
    p.classList.add('qd-menu-pop')
    const item = (icon, label, key, fn) => {
      const b = el('button', 'qd-menu-item')
      b.innerHTML = `<span class="qd-mi-ico">${ICONS[icon] || ''}</span><span class="qd-mi-label"></span>`
      b.querySelector('.qd-mi-label').textContent = label
      if (key) {
        const k = el('span', 'qd-mi-key')
        k.textContent = key
        b.appendChild(k)
      }
      b.addEventListener('click', async (e) => {
        e.stopPropagation()
        closePopover()
        try { await fn() } catch (err) { console.warn('board menu action failed', err) }
      })
      p.appendChild(b)
      return b
    }
    // a labelled row of mutually exclusive icon buttons
    const segment = (label, ids, { icons, tips, current, onPick }) => {
      const row = el('div', 'qd-menu-row')
      const cap = el('span', 'qd-mi-label')
      cap.textContent = label
      row.appendChild(cap)
      const seg = el('div', 'qd-seg')
      for (const id of ids) {
        const b = el('button', 'qd-seg-btn' + (current === id ? ' on' : ''))
        b.innerHTML = icons[id]
        b.title = tips[id]
        b.setAttribute('aria-label', tips[id])
        b.addEventListener('click', (e) => {
          e.stopPropagation()
          onPick(id)
          seg.querySelectorAll('.qd-seg-btn').forEach((x, i) => x.classList.toggle('on', ids[i] === id))
        })
        seg.appendChild(b)
      }
      row.appendChild(seg)
      p.appendChild(row)
      return row
    }

    const hasSel = editor.selection.size > 0
    item('download', 'Export as PNG', null, () => saveImage(true, null))
    item('transparent', 'Export — transparent', null, () => saveImage(false, null))
    if (hasSel) item('image', 'Export selection', null, () => saveImage(true, new Set(editor.selection)))
    item('copy', hasSel ? 'Copy selection as image' : 'Copy as image', null, async () => {
      const blob = await editor.exportImage({ background: true, ids: hasSel ? new Set(editor.selection) : null })
      if (blob) await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    })
    p.appendChild(el('i', 'qd-menu-div'))
    if (hasSel) item('trash', 'Delete selection', '⌫', () => editor.deleteSelection())
    item('fit', 'Zoom to fit', '⇧1', () => editor.fitContent({ animate: 220 }))
    item('trash', 'Clear board', '⇧⌘⌫', () => editor.clearBoard())

    if (opts.gridControl || opts.themeToggle) p.appendChild(el('i', 'qd-menu-div'))
    if (opts.gridControl) {
      // a standard nested dropdown: the row grows a flyout beside the menu —
      // six buttons inline read as clutter
      // a div, not a button: the flyout nests inside, and buttons can't nest
      const row = el('div', 'qd-menu-item qd-has-sub')
      row.setAttribute('role', 'button')
      row.tabIndex = 0
      row.innerHTML =
        `<span class="qd-mi-ico">${GRID_ICONS[editor.grid]}</span>` +
        '<span class="qd-mi-label">Grid</span>' +
        '<span class="qd-mi-value"></span>' +
        `<span class="qd-mi-chev">${ICONS.chevronRight}</span>`
      row.querySelector('.qd-mi-value').textContent = GRID_LABELS[editor.grid]

      const sub = el('div', 'qd-submenu')
      for (const id of GRID_IDS) {
        const b = el('button', 'qd-menu-item')
        b.innerHTML =
          `<span class="qd-mi-ico">${GRID_ICONS[id]}</span>` +
          '<span class="qd-mi-label"></span>' +
          `<span class="qd-mi-check">${editor.grid === id ? ICONS.check : ''}</span>`
        b.querySelector('.qd-mi-label').textContent = GRID_LABELS[id]
        b.title = GRID_TIPS[id]
        b.addEventListener('click', (e) => {
          e.stopPropagation()
          editor.setGrid(id)
          sub.querySelectorAll('.qd-mi-check').forEach((c, i) => { c.innerHTML = GRID_IDS[i] === id ? ICONS.check : '' })
          row.querySelector('.qd-mi-ico').innerHTML = GRID_ICONS[id]
          row.querySelector('.qd-mi-value').textContent = GRID_LABELS[id]
        })
        sub.appendChild(b)
      }
      row.appendChild(sub)

      const openSub = () => {
        row.classList.add('sub-open')
        // side with room wins: nested menus prefer the right, but the board
        // menu usually hugs the right edge of the frame
        const rr = root.getBoundingClientRect()
        const br = row.getBoundingClientRect()
        const fitsRight = br.right + sub.offsetWidth + 12 <= rr.right
        sub.classList.toggle('qd-sub-left', !fitsRight)
        // grow upward when the row sits low in the frame
        const fitsDown = br.top - 7 + sub.offsetHeight <= rr.bottom - 8
        sub.style.top = fitsDown ? '' : 'auto'
        sub.style.bottom = fitsDown ? '' : '-7px'
      }
      const closeSub = () => row.classList.remove('sub-open')
      let subT
      row.addEventListener('mouseenter', () => { clearTimeout(subT); openSub() })
      row.addEventListener('mouseleave', () => { subT = setTimeout(closeSub, 180) })
      // tap toggles, for pointers that don't hover
      row.addEventListener('click', (e) => {
        e.stopPropagation()
        row.classList.contains('sub-open') ? closeSub() : openSub()
      })
      p.appendChild(row)
    }
    if (opts.themeToggle) {
      segment('Theme', ['light', 'dark'], {
        icons: { light: ICONS.sun, dark: ICONS.moon },
        tips: { light: 'Light theme', dark: 'Dark theme' },
        current: editor.theme.id,
        onPick: (id) => editor.setTheme(id),
      })
    }
  }
  async function saveImage(background, ids) {
    const blob = await editor.exportImage({ background, ids })
    if (!blob) return
    if (onSave) return onSave(blob, background)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'quickdraw-' + new Date().toISOString().slice(0, 19).replaceAll(':', '.') + '.png'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }
  // ---- keyboard help overlay (press ?) -----------------------------------
  const SHORTCUTS = [
    { label: 'Tools', rows: [
      ['Select', 'V / 1'], ['Hand (hold Space)', 'H'], ['Draw', 'D / P / B'],
      ['Highlight', 'I'], ['Eraser', 'E'], ['Laser', 'K'],
      ['Arrow', 'A'], ['Line', 'L'], ['Shape', 'G'],
      ['Rectangle', 'R'], ['Ellipse', 'O'], ['Text', 'T'], ['Sticky note', 'N'],
    ]},
    { label: 'Edit', rows: [
      ['Undo', '⌘Z'], ['Redo', '⇧⌘Z'], ['Select all', '⌘A'],
      ['Copy', '⌘C'], ['Cut', '⌘X'], ['Paste', '⌘V'], ['Duplicate', '⌘D'],
    ]},
    { label: 'Arrange', rows: [
      ['Bring to front', ']'], ['Send to back', '['], ['Nudge', 'Arrows (Shift = 8px)'],
    ]},
    { label: 'View', rows: [
      ['Zoom to fit', '⇧1'], ['Reset zoom', '⇧0'], ['Zoom in / out', '⌘+ / ⌘−'],
    ]},
    { label: 'Board', rows: [
      ['Delete selection', '⌫'], ['Clear board', '⇧⌘⌫'],
      ['Edit / finish text', 'Enter'], ['Cancel / deselect', 'Esc'],
    ]},
    { label: 'Help', rows: [['Keyboard shortcuts', '?']] },
  ]
  const buildHelp = () => {
    const backdrop = el('div', 'qd-help-backdrop')
    const panel = el('div', 'qd-help-panel')
    const head = el('div', 'qd-help-head')
    const title = el('div', 'qd-help-title'); title.textContent = 'Keyboard shortcuts'
    const close = el('button', 'qd-help-close')
    close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
    close.setAttribute('aria-label', 'Close')
    head.appendChild(title); head.appendChild(close)
    panel.appendChild(head)
    for (const g of SHORTCUTS) {
      const sec = el('div', 'qd-help-group')
      const gl = el('div', 'qd-help-glabel'); gl.textContent = g.label
      sec.appendChild(gl)
      for (const [name, keys] of g.rows) {
        const row = el('div', 'qd-help-row')
        const nm = el('span', 'qd-help-name'); nm.textContent = name
        const kc = el('span', 'qd-help-keys'); kc.textContent = keys
        row.appendChild(nm); row.appendChild(kc)
        sec.appendChild(row)
      }
      panel.appendChild(sec)
    }
    backdrop.appendChild(panel)
    backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) closeHelp() })
    close.addEventListener('click', () => closeHelp())
    return backdrop
  }
  let helpEl = null
  const closeHelp = () => {
    if (!helpEl) return
    helpEl.remove(); helpEl = null
    document.removeEventListener('keydown', onHelpKey, true)
  }
  const onHelpKey = (e) => {
    if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); e.stopPropagation(); closeHelp() }
  }
  const toggleHelp = () => {
    if (helpEl) { closeHelp(); return }
    helpEl = buildHelp()
    ui.appendChild(helpEl)
    document.addEventListener('keydown', onHelpKey, true)
    refresh()
  }
  editor.on('help', toggleHelp)

  // ---- responsive fit ------------------------------------------------------
  // Instead of scaling down, the dock sheds tools into the "more" flyout as
  // its frame narrows; below ~5 buttons of room it folds into a single
  // tools button. Fixed metrics keep the math cheap and honest.
  const BTN = 34 // 32px button + 2px gap
  const PAD = 16 // dock padding + border
  let hiddenNames = []
  let mode = null
  const fit = () => {
    const avail = (root.clientWidth || 600) - 16
    const fullW = PAD + (DOCK_NAMES.length + 2) * BTN + dividers.length * 7
    const slots = Math.floor((avail - PAD) / BTN)
    let m, hid
    if (avail >= fullW) {
      m = 'full'
      hid = []
    } else if (slots < 5) {
      m = 'mini'
      hid = [...DOCK_NAMES]
    } else {
      m = 'compact'
      // styles/more/menu take 3 slots; select and draw are pinned; the rest
      // of the room goes to the tools that yield last
      const extra = Math.max(0, slots - 5)
      const keep = new Set(['select', 'draw'])
      for (let i = DROP_ORDER.length - 1, n = extra; i >= 0 && n > 0; i--, n--) keep.add(DROP_ORDER[i])
      hid = DOCK_NAMES.filter((n) => !keep.has(n))
    }
    const changed = m !== mode || hid.join() !== hiddenNames.join()
    mode = m
    hiddenNames = hid
    if (!changed) return
    const hideSet = new Set(hid)
    for (const [n, b] of dockBtns) b.style.display = hideSet.has(n) ? 'none' : ''
    for (const d of dividers) d.style.display = m === 'full' ? '' : 'none'
    toolsBtn.style.display = m === 'mini' ? '' : 'none'
    moreBtn.style.display = m === 'compact' ? '' : 'none'
    dock.classList.toggle('qd-compact', m !== 'full')
    if (popover && ['more', 'tools', 'geo'].includes(popover.name)) closePopover()
    refresh()
  }
  const ro = new ResizeObserver(fit)
  ro.observe(root)
  fit()

  // ---- state sync ----------------------------------------------------------
  function refresh() {
    for (const n of DOCK_NAMES) {
      const b = dockBtns.get(n)
      if (n === 'image') continue
      b.classList.toggle('on', editor.tool === n)
    }
    const geoBtn = dockBtns.get('geo')
    geoBtn.innerHTML = ICONS[editor.geoKind]
    actBtns.get('undo').disabled = !editor.store.canUndo
    actBtns.get('redo').disabled = !editor.store.canRedo
    const hasSel = editor.selection.size > 0
    actBtns.get('duplicate').disabled = !hasSel
    actBtns.get('delete').disabled = !hasSel
    // the folded button wears the active tool so the state stays visible
    toolsBtn.innerHTML = ICONS[editor.tool === 'geo' ? editor.geoKind : editor.tool] || ICONS.select
    toolsBtn.classList.toggle('on', popover?.name === 'tools')
    styleDot.style.background = editor.theme.colors[editor.currentStyles().color || 'blue'].stroke
    menuBtn.classList.toggle('on', popover?.name === 'menu')
    styleBtn.classList.toggle('on', popover?.name === 'styles')
    moreBtn.classList.toggle('on', popover?.name === 'more')
  }
  const offs = [
    editor.on('tool', refresh),
    editor.on('styles', refresh),
    editor.on('history', refresh),
    editor.on('selection', refresh),
    editor.on('theme', refresh),
    editor.on('grid', refresh),
  ]

  // popovers close when the pointer goes to the canvas
  const closeOnCanvas = (e) => { if (!ui.contains(e.target)) closePopover() }
  root.addEventListener('pointerdown', closeOnCanvas, { capture: true })

  const setHidden = (h) => ui.classList.toggle('qd-hidden', !!h)
  setHidden(hidden)
  refresh()

  return {
    setHidden,
    // live toggles for the menu switches; an open menu is rebuilt on next open
    setOptions(next = {}) {
      if ('themeToggle' in next) opts.themeToggle = next.themeToggle !== false
      if ('gridControl' in next) opts.gridControl = next.gridControl !== false
      if (popover?.name === 'menu') closePopover()
    },
    destroy() {
      offs.forEach((f) => f())
      ro.disconnect()
      root.removeEventListener('pointerdown', closeOnCanvas, { capture: true })
      closeHelp()
      ui.remove()
    },
  }
}

const el = (tag, cls) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  return e
}
