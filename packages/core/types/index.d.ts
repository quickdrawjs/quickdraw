// Type declarations for @quickdrawjs/core.
// The engine itself is dependency-free ESM JavaScript; these types describe
// its public API.

export type ToolId =
  | 'select' | 'hand' | 'draw' | 'highlight' | 'eraser' | 'laser'
  | 'arrow' | 'line' | 'geo' | 'text' | 'note'

export type ColorId =
  | 'black' | 'grey' | 'light-violet' | 'violet' | 'blue' | 'light-blue'
  | 'yellow' | 'orange' | 'green' | 'light-green' | 'light-red' | 'red'

export type SizeId = 's' | 'm' | 'l' | 'xl'
export type DashId = 'draw' | 'solid' | 'dashed' | 'dotted'
export type FillId = 'none' | 'semi' | 'solid' | 'pattern'
export type FontId = 'draw' | 'sans' | 'serif' | 'mono'
export type GeoId = 'rectangle' | 'ellipse' | 'triangle' | 'diamond' | 'hexagon' | 'star' | 'cloud'
export type ThemeId = 'light' | 'dark'
export type GridId = 'none' | 'lines' | 'ruled' | 'dots' | 'crosses' | 'iso'

export interface Bounds { x: number; y: number; w: number; h: number }
export interface Camera { x: number; y: number; z: number }

export interface Styles {
  color: ColorId
  size: SizeId
  dash: DashId
  fill: FillId
  font: FontId
}

export type ShapeType =
  | 'draw' | 'highlight' | 'geo' | 'arrow' | 'line' | 'text' | 'note' | 'image'

/** A shape record. `props` vary by `type`; records are treated as immutable. */
export interface ShapeRecord {
  id: string
  typeName: 'shape'
  type: ShapeType
  x: number
  y: number
  rot: number
  z: number
  props: Record<string, any>
}

/** An image asset record (dataURL source shared by image shapes). */
export interface AssetRecord {
  id: string
  typeName: 'asset'
  src: string
  w: number
  h: number
}

export type BoardRecord = ShapeRecord | AssetRecord

/**
 * A diff between two document states. This is the wire format: sync relays,
 * op logs and undo history all speak it.
 */
export interface Diff {
  added: Record<string, BoardRecord>
  removed: Record<string, BoardRecord>
  updated: Record<string, [BoardRecord, BoardRecord]>
}

export type DiffSource = 'user' | 'remote'

/** Serialized document: `{ document: { store: { [id]: record } } }`. */
export interface Snapshot {
  document: { store: Record<string, BoardRecord> }
}

export interface Theme {
  id: ThemeId
  background: string
  colors: Record<ColorId, { stroke: string; fill: string; note: string }>
  noteText: string
  selection: string
  selectionFill: string
  handleFill: string
  scribble: string
  grid: {
    line: { minor: string; major: string }
    dot: { minor: string; major: string }
  }
}

export interface ScribbleStroke {
  points: Array<{ x: number; y: number }>
  opacity?: number
}

export const TOOLS: ToolId[]
export const COLOR_IDS: ColorId[]
export const SIZE_IDS: SizeId[]
export const DASH_IDS: DashId[]
export const FILL_IDS: FillId[]
export const GEO_IDS: GeoId[]
export const GRID_IDS: GridId[]
export const THEMES: Record<ThemeId, Theme>
export const SIZES: Record<SizeId, number>
export const FONT_SIZES: Record<SizeId, number>
export const FONTS: Record<FontId, string>

export function themeOf(id?: string): Theme
export function newId(prefix?: string): string
export function isDiffEmpty(d: Diff | null | undefined): boolean
export function invertDiff(d: Diff): Diff
export function composeDiff(a: Diff, b: Diff): Diff

/** Local (unrotated, origin-relative) bounds of a shape. */
export function localBounds(shape: ShapeRecord): Bounds
/** Axis-aligned page bounds of a shape, rotation included. */
export function pageBounds(shape: ShapeRecord): Bounds
/** Render one shape into a 2d context already transformed to page space. */
export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: ShapeRecord,
  opts: { theme: Theme; store: Store; zoom?: number; ghost?: boolean; onAssetLoad?: () => void }
): void
/** Point hit-test in page space. */
export function hitShape(shape: ShapeRecord, px: number, py: number, tol: number, store: Store): boolean

/**
 * Turn a raw pointer trail ([x, y, pressure, ...] triplets) into a filled
 * outline polygon ([x, y, ...]) whose width breathes with pressure.
 */
export function strokeOutline(
  pts: number[],
  opts?: { size?: number; thinning?: number; streamline?: number; simulate?: boolean; taper?: boolean }
): number[]

/**
 * The document store. Every mutation happens inside a transaction; one diff
 * is emitted per outermost transaction. History batches gestures so a whole
 * stroke or drag undoes as one step.
 */
export class Store {
  records: Map<string, BoardRecord>
  undos: Diff[]
  redos: Diff[]

  get(id: string): BoardRecord | undefined
  has(id: string): boolean
  ids(): string[]
  all(): BoardRecord[]
  shapes(): ShapeRecord[]
  asset(id: string): AssetRecord | null
  readonly size: number

  /** Subscribe to changes; returns an unsubscribe function. */
  listen(fn: (diff: Diff, source: DiffSource) => void, opts?: { source?: DiffSource | 'all' }): () => void

  /**
   * Subscribe to undo/redo availability changes (fires when canUndo/canRedo
   * may have changed, including at the end of a gesture batch, which emits no
   * document diff of its own).
   */
  listenHistory(fn: () => void): () => void

  transact(fn: () => void, source?: DiffSource): void
  put(rec: BoardRecord, source?: DiffSource): void
  update(id: string, patch: Partial<BoardRecord> & { props?: Record<string, any> }, source?: DiffSource): void
  remove(ids: string[], source?: DiffSource): void
  /** Apply a diff produced elsewhere (a peer, an op log). */
  applyDiff(diff: Diff, source?: DiffSource): void

  beginBatch(): void
  endBatch(): void
  readonly canUndo: boolean
  readonly canRedo: boolean
  undo(): void
  redo(): void

  getSnapshot(): Snapshot
  loadSnapshot(snap: Snapshot, source?: DiffSource): void
  clear(source?: DiffSource): void
  maxZ(): number
  minZ(): number
}

export interface EditorOptions {
  container: HTMLElement
  store?: Store
  theme?: ThemeId | string
  grid?: GridId
  readonly?: boolean
  camera?: Camera
  styles?: Partial<Styles>
  geoKind?: GeoId
}

export type EditorEvent =
  | 'change' | 'history' | 'camera' | 'tool' | 'styles' | 'selection'
  | 'theme' | 'grid' | 'edit' | 'scribbles' | 'penmode'

/**
 * The editor: camera, tools, selection, input and rendering over a Store.
 * Framework-free — attach it to any element.
 */
export class Editor {
  constructor(opts: EditorOptions)

  container: HTMLElement
  canvas: HTMLCanvasElement
  overlay: HTMLCanvasElement
  store: Store
  theme: Theme
  grid: GridId
  readonly: boolean
  camera: Camera
  styles: Styles
  geoKind: GeoId
  tool: ToolId
  selection: Set<string>
  penMode: boolean

  on(ev: EditorEvent, fn: (...args: any[]) => void): () => void
  emit(ev: EditorEvent, ...args: any[]): void

  // camera
  viewSize(): { w: number; h: number }
  screenToPage(sx: number, sy: number): { x: number; y: number }
  pageToScreen(px: number, py: number): { x: number; y: number }
  viewportPageBounds(): Bounds
  setCamera(cam: Camera, opts?: { animate?: number }): void
  pan(dxScreen: number, dyScreen: number): void
  zoomAt(sx: number, sy: number, mult: number, opts?: { animate?: number }): void
  contentBounds(): Bounds | null
  fitContent(opts?: { margin?: number; maxZoom?: number; animate?: number; ease?: number }): void
  followBounds(b: Bounds, opts?: { animate?: number; ease?: number }): void

  // tools / styles
  setTool(tool: ToolId): void
  setGeoKind(kind: GeoId): void
  setTheme(id: ThemeId | string): void
  /** 'none' | 'lines' | 'ruled' | 'dots' | 'crosses' | 'iso' — the backdrop behind the drawing. */
  setGrid(id: GridId): void
  setReadonly(ro: boolean): void
  setPenMode(on: boolean): void
  setStyle<K extends keyof Styles>(key: K, value: Styles[K]): void
  currentStyles(): Partial<Record<keyof Styles, string | null>>

  // selection
  setSelection(ids: string[]): void
  selectionBounds(): Bounds | null
  deleteSelection(): void
  /** Empty the board in one undoable step (⇧⌘⌫). */
  clearBoard(): void
  selectAll(): void
  duplicateSelection(offset?: number): void
  bringToFront(): void
  sendToBack(): void
  shapesSorted(): ShapeRecord[]
  hitTest(px: number, py: number): ShapeRecord | null

  // laser scribbles (live pointer trails, not part of the document)
  setRemoteScribbles(list: ScribbleStroke[]): void
  getScribbles(): ScribbleStroke[]

  // clipboard / images
  copySelection(): Promise<void>
  pasteFromClipboard(): Promise<void>
  importImageBlobs(blobs: Blob[] | File[], at?: { x: number; y: number }): Promise<void>
  pickImage(): void

  /** Render the drawing to a PNG blob (null when the board is empty). */
  exportImage(opts?: { background?: boolean; scale?: number; margin?: number; ids?: Set<string> | null }): Promise<Blob | null>

  // rendering
  requestRender(): void
  render(): void
  resize(): void
  renderScene(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    w: number,
    h: number,
    opts?: { dpr?: number; background?: boolean; hideEditing?: boolean }
  ): void
  /** Mirror clean board pixels into an extra canvas (for capture/recording). */
  setCaptureCanvas(canvas: HTMLCanvasElement | null): void
  renderCaptureTick(): void

  destroy(): void
}

export interface BoardUI {
  setHidden(hidden: boolean): void
  /** Live-toggle the board menu's theme / grid switches. */
  setOptions(opts: { themeToggle?: boolean; gridControl?: boolean }): void
  destroy(): void
}

export interface BuildUIOptions {
  hidden?: boolean
  onSave?: (blob: Blob, background: boolean) => void
  /** Show the theme switch in the board menu (default true). */
  themeToggle?: boolean
  /** Show the grid switch in the board menu (default true). */
  gridControl?: boolean
}

/** Build the floating toolbar / style popovers / board menu for an editor. */
export function buildUI(editor: Editor, opts?: BuildUIOptions): BoardUI

/**
 * Append the corner "Quickdraw" mark to a board's container and return it.
 * `createQuickdraw` and the framework bindings call this for you.
 */
export function buildWatermark(editor: Editor): HTMLAnchorElement

export interface QuickdrawInstance {
  editor: Editor
  ui: BoardUI
  destroy(): void
}

export interface CreateQuickdrawOptions extends EditorOptions {
  hideUi?: boolean
  onSave?: (blob: Blob, background: boolean) => void
  themeToggle?: boolean
  gridControl?: boolean
  /**
   * Show the small "Quickdraw" mark in the board's corner (default true).
   * Keeping it is a free way to support the project.
   */
  watermark?: boolean
}

/** One call: editor + toolbar chrome in a container. */
export function createQuickdraw(opts: CreateQuickdrawOptions): QuickdrawInstance
