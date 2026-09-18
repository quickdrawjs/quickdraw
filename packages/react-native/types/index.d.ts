import * as React from 'react'
import type {
  ColorId, DashId, Diff, DiffSource, FillId, FontId, GridId, SizeId, Snapshot, Styles,
  ThemeId, ToolId,
} from '@quickdrawjs/core'

/** The self-contained HTML page the WebView renders (engine + CSS inlined). */
export const BOARD_HTML: string

export function encodeDispatch(msg: object): string
export function createBridge(
  send: (js: string) => void,
  opts?: { timeout?: number }
): {
  post(msg: object): void
  request<T = any>(msg: object): Promise<T>
  settle(id: string, value: any): boolean
  dispose(): void
}

export interface QuickdrawRef {
  loadSnapshot(snapshot: Snapshot, fit?: boolean): void
  applyDiff(diff: Diff): void
  setTool(tool: ToolId): void
  setStyle(key: keyof Styles, value: ColorId | SizeId | DashId | FillId | FontId): void
  setGrid(grid: GridId): void
  undo(): void
  redo(): void
  clear(): void
  fitContent(animate?: number): void
  getSnapshot(): Promise<Snapshot>
  exportPng(opts?: { background?: boolean; scale?: number; margin?: number }): Promise<string | null>
}

export interface QuickdrawProps {
  theme?: ThemeId | string
  /** 'none' | 'lines' | 'ruled' | 'dots' | 'crosses' | 'iso' — the backdrop. Live-switchable. */
  grid?: GridId
  readonly?: boolean
  hideUi?: boolean
  /** Show the theme switch in the board menu (default true). */
  themeToggle?: boolean
  /** Show the grid switch in the board menu (default true). */
  gridControl?: boolean
  /** Show the corner "Quickdraw" mark (default true). */
  watermark?: boolean
  snapshot?: Snapshot
  styles?: Partial<Styles>
  onReady?: () => void
  onChange?: (diff: Diff, source: DiffSource) => void
  onSelectionChange?: (ids: string[]) => void
  /** The in-board switch changed the theme — mirror it into your own state. */
  onThemeChange?: (theme: ThemeId) => void
  /** The in-board switch changed the grid. */
  onGridChange?: (grid: GridId) => void
  /** Toolbar PNG export handed to you as a data URL. */
  onSave?: (dataUrl: string, background: boolean) => void
  onError?: (message: string) => void
  style?: any
  /** Extra props spread onto the underlying react-native-webview WebView. */
  webviewProps?: Record<string, any>
}

/** A complete whiteboard in a React Native view (WebView-based). */
export const Quickdraw: React.ForwardRefExoticComponent<
  QuickdrawProps & React.RefAttributes<QuickdrawRef>
>
