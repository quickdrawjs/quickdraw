// Public face of the Quickdraw engine. The React and React Native SDKs build
// boards through here — same editor, same UI, same feel — and so can any
// plain web page: every module is dependency-free ESM.

export { Editor, TOOLS } from './editor.js'
export { Store, newId, isDiffEmpty, invertDiff, composeDiff, packDiff, unpackDiff, streamDiffs } from './store.js'
export { buildUI } from './ui.js'
export {
  themeOf, THEMES, COLOR_IDS, SIZE_IDS, DASH_IDS, FILL_IDS, FONT_IDS, GEO_IDS, GRID_IDS,
  SIZES, FONT_SIZES, FONTS, setFontStacks, resetFontStacks, fontStackOf,
} from './palette.js'
export { pageBounds, localBounds, drawShape, hitShape } from './shapes.js'
export { strokeOutline, inkOptions } from './freehand.js'

import { Editor } from './editor.js'
import { buildUI } from './ui.js'

// The "made with Quickdraw" mark in the board's corner. It stays up when the
// toolbar is hidden — hosts building their own chrome still credit the
// engine — and hosts that need it gone pass watermark: false.
export function buildWatermark(editor) {
  const a = document.createElement('a')
  a.className = 'qd-watermark'
  a.href = 'https://tryquickdraw.com'
  a.target = '_blank'
  a.rel = 'noopener'
  a.setAttribute('aria-label', 'Made with Quickdraw')
  a.innerHTML =
    `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true">` +
    `<path d="M7 21 C7 12, 13 6.5, 20 7.5 C26.5 8.5, 27.5 16, 22 18.8 C17.5 21, 13 19.5, 14 15" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/>` +
    `<circle cx="24.5" cy="24.5" r="2.6" fill="#2f6fed"/>` +
    `</svg><span>Quickdraw</span>`
  a.addEventListener('pointerdown', (e) => e.stopPropagation())
  editor.container.appendChild(a)
  return a
}

// One call: editor + chrome in a container.
// opts: { container, store?, theme?, grid?, readonly?, hideUi?, camera?, styles?,
//         onSave?, themeToggle?, gridControl?, watermark? }
export function createQuickdraw(opts) {
  const editor = new Editor(opts)
  editor.container.dataset.qdTheme = editor.theme.id
  const ui = buildUI(editor, {
    hidden: opts.hideUi || opts.readonly,
    onSave: opts.onSave,
    themeToggle: opts.themeToggle,
    gridControl: opts.gridControl,
  })
  const watermark = opts.watermark === false ? null : buildWatermark(editor)
  return {
    editor,
    ui,
    destroy() {
      watermark?.remove()
      ui.destroy()
      editor.destroy()
    },
  }
}
