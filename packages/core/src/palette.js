// Quickdraw's visual constants — colors, stroke sizes, dash styles, fonts.
// Dependency-free ESM: this file (like the whole engine) can be bundled or
// served raw, so it must run in any modern browser as-is.

// Twelve named colors, a roster whiteboard users already know. Each resolves per
// theme: `stroke` draws lines and text, `fill` is the pastel body of a filled
// shape, `semi` the neutral translucent body, `note` the sticky's paper.
export const COLOR_IDS = [
  'black', 'grey', 'light-violet', 'violet', 'blue', 'light-blue',
  'yellow', 'orange', 'green', 'light-green', 'light-red', 'red',
]

const LIGHT = {
  'black':        { stroke: '#1d1d1d', fill: '#e8e8e8', note: '#fdf0a8' },
  'grey':         { stroke: '#9fa8b2', fill: '#eceef0', note: '#eff0f2' },
  'light-violet': { stroke: '#e085f4', fill: '#f9ebfc', note: '#f5d9fb' },
  'violet':       { stroke: '#ae3ec9', fill: '#f0dcf5', note: '#e5b9ef' },
  'blue':         { stroke: '#4263eb', fill: '#dfe5fb', note: '#c0cdf8' },
  'light-blue':   { stroke: '#4dabf7', fill: '#e0f0fe', note: '#c6e5fd' },
  'yellow':       { stroke: '#f1ac4b', fill: '#fcefdc', note: '#fbe5c0' },
  'orange':       { stroke: '#e16919', fill: '#fae5d5', note: '#f8cfae' },
  'green':        { stroke: '#099268', fill: '#d3ebe3', note: '#b5e0d1' },
  'light-green':  { stroke: '#4cb05e', fill: '#dff0e2', note: '#c5e7cc' },
  'light-red':    { stroke: '#f87777', fill: '#fde4e4', note: '#fbcece' },
  'red':          { stroke: '#e03131', fill: '#f9dcdc', note: '#f4b8b8' },
}

// note papers stay bright in the dark theme too — the sticky is a lit object
// on the dark canvas, and noteText ink is dark in both themes
const DARK = {
  'black':        { stroke: '#e1e1e1', fill: '#2c2c2c', note: '#fcf089' },
  'grey':         { stroke: '#93a1ad', fill: '#26292c', note: '#e2e5e8' },
  'light-violet': { stroke: '#e085f4', fill: '#3b2a40', note: '#f2cbfa' },
  'violet':       { stroke: '#bd63d3', fill: '#352138', note: '#e3aeef' },
  'blue':         { stroke: '#6285f5', fill: '#20263e', note: '#b4c4f8' },
  'light-blue':   { stroke: '#4dabf7', fill: '#1c2c3a', note: '#b9defc' },
  'yellow':       { stroke: '#f1ac4b', fill: '#382e1e', note: '#fbdda9' },
  'orange':       { stroke: '#e8833a', fill: '#392619', note: '#f8c69c' },
  'green':        { stroke: '#12a67c', fill: '#172e27', note: '#a6dcc9' },
  'light-green':  { stroke: '#5cbd6e', fill: '#1d3120', note: '#bde4c5' },
  'light-red':    { stroke: '#f87777', fill: '#3b2222', note: '#fac1c1' },
  'red':          { stroke: '#e55959', fill: '#382020', note: '#f3aaaa' },
}

// Everything theme-dependent that isn't a shape color.
export const THEMES = {
  light: {
    id: 'light',
    background: '#fbf9f4', // warm paper
    colors: LIGHT,
    noteText: '#1d1d1d', // sticky ink stays dark on every light note paper
    selection: '#2f80ec',
    selectionFill: 'rgba(47, 128, 236, 0.07)',
    handleFill: '#ffffff',
    scribble: '#f2555a', // the laser pointer
    // The optional grid sits just above the paper: minor marks whisper, the
    // every-fifth majors give the eye something to measure against. Dots carry
    // far less ink than a rule of the same weight, so they run darker to land
    // at the same visual quiet.
    grid: {
      line: { minor: 'rgba(60, 50, 30, 0.30)', major: 'rgba(60, 50, 30, 0.52)' },
      dot: { minor: 'rgba(60, 50, 30, 0.52)', major: 'rgba(60, 50, 30, 0.72)' },
    },
  },
  dark: {
    id: 'dark',
    background: '#191713',
    colors: DARK,
    noteText: '#1d1d1d',
    selection: '#4f96f6',
    selectionFill: 'rgba(79, 150, 246, 0.09)',
    handleFill: '#26231c',
    scribble: '#f2555a',
    grid: {
      line: { minor: 'rgba(255, 246, 224, 0.38)', major: 'rgba(255, 246, 224, 0.58)' },
      dot: { minor: 'rgba(255, 246, 224, 0.56)', major: 'rgba(255, 246, 224, 0.76)' },
    },
  },
}

// Board backdrops. 'none' is bare paper; the rest dress the same lattice:
// full rules, notebook rules only, the intersections as dots or as small
// crosses (blueprint style), and an isometric triangle weave.
export const GRID_IDS = ['none', 'lines', 'ruled', 'dots', 'crosses', 'iso']
// Lattice spacing in page px at zoom 1, and the every-Nth emphasis.
export const GRID_STEP = 80
// The finest step the grid draws, in screen px: the lattice it shows spans
// GRID_BAND·2 to GRID_BAND·4 between levels.
export const GRID_BAND = 40
export const GRID_MAJOR = 5

export const themeOf = (id) => THEMES[id === 'dark' ? 'dark' : 'light']

// Stroke widths in page px at zoom 1. The pencil's freehand outline breathes
// around this; geometry strokes use it flat.
export const SIZES = { s: 2.5, m: 4, l: 6.5, xl: 10 }
// The pencil's pressure ink swells and thins around these widths; a touch
// fuller than the even-width styles, so the line reads as ink.
export const INK_SIZES = { s: 3.2, m: 4.6, l: 6.2, xl: 10 }
export const SIZE_IDS = ['s', 'm', 'l', 'xl']

// Font sizes for text shapes / labels, page px.
export const FONT_SIZES = { s: 20, m: 26, l: 36, xl: 48 }
export const NOTE_FONT_SIZES = { s: 16, m: 20, l: 26, xl: 32 }

export const DASH_IDS = ['draw', 'solid', 'dashed', 'dotted']
export const FILL_IDS = ['none', 'semi', 'solid', 'pattern']
export const FONT_IDS = ['draw', 'sans', 'serif', 'mono']

export const FONTS = {
  // 'Quickdraw Hand' is Libre Baskerville, bundled via quickdraw.css; the rest are
  // the fallbacks while it loads (or if the stylesheet isn't included)
  draw: "'Quickdraw Hand', 'Libre Baskerville', 'Baskerville', Georgia, serif",
  sans: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif",
  serif: "'Iowan Old Style', 'New York', Palatino, Georgia, serif",
  mono: "'SF Mono', ui-monospace, Menlo, monospace",
}

// Pluggable font stacks: remap any style id to a full CSS font-family stack
// (or register a brand-new id) — `setFontStacks({ sans: "'Inter', ..." })`.
// Everything that measures or draws type resolves through fontStackOf(), so
// one call reconfigures the editor, the UI previews and headless export
// alike. Process-global, like the backend injection: configure once at
// startup. Custom ids work anywhere a `font` prop is read.
const fontOverrides = {}
export function setFontStacks(stacks = {}) {
  for (const [id, stack] of Object.entries(stacks)) {
    if (typeof id !== 'string' || !id) throw new TypeError('font id must be a non-empty string')
    if (typeof stack !== 'string' || !stack.trim()) throw new TypeError(`font stack for '${id}' must be a non-empty CSS font-family string`)
    fontOverrides[id] = stack
  }
  return { ...fontOverrides }
}
export function resetFontStacks() {
  for (const k of Object.keys(fontOverrides)) delete fontOverrides[k]
}
export const fontStackOf = (id) => fontOverrides[id] ?? FONTS[id] ?? FONTS.draw

export const GEO_IDS = ['rectangle', 'ellipse', 'triangle', 'diamond', 'hexagon', 'star', 'cloud']

// Highlighter: wide translucent band that multiplies into the paper.
export const HIGHLIGHT_ALPHA = 0.55
export const HIGHLIGHT_SCALE = 4.5 // band width = SIZES[size] * this
