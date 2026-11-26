// React bindings for Quickdraw. Written without JSX so the package ships as
// raw ESM — no build step, nothing to transpile but your own app.

import {
  createElement, forwardRef, useEffect, useImperativeHandle, useRef,
} from 'react'
import { Editor, Store, buildUI, buildWatermark } from '@quickdrawjs/core'

export * from '@quickdrawjs/core'

/**
 * <Quickdraw /> — a complete whiteboard in a div.
 *
 * props:
 *   theme        'light' | 'dark' (live-switchable)
 *   grid         'none' | 'lines' | 'ruled' | 'dots' | 'crosses' | 'iso' — the backdrop (live-switchable)
 *   readonly     lock input (also hides the toolbar)
 *   hideUi       hide the stock toolbar (bring your own chrome)
 *   themeToggle  show the theme switch in the board menu (default true)
 *   gridControl  show the grid switch in the board menu (default true)
 *   watermark    show the corner "Quickdraw" mark (default true)
 *   store        external Store to render (share one across components/peers)
 *   snapshot     serialized document loaded on mount (ignored when `store` given)
 *   camera       initial camera { x, y, z }
 *   styles       initial pen styles { color, size, dash, fill, font }
 *   autoFit      fit content into view on mount and container resize
 *   onMount      (editor, ui) => void
 *   onChange     (diff, source, editor) => void — every document change
 *   onSelectionChange  (ids: string[], editor) => void
 *   onThemeChange      (themeId, editor) => void — the in-board switch moved it
 *   onGridChange       (gridId, editor) => void
 *   onSave       (blob, background) => void — intercept toolbar PNG export
 *   className / style  applied to the host div
 *
 * ref: { editor, ui } (imperative access to the full core API)
 */
export const Quickdraw = forwardRef(function Quickdraw(props, ref) {
  const {
    theme = 'light',
    grid = 'lines',
    readonly = false,
    hideUi = false,
    disablePanScroll = false,
    themeToggle = true,
    gridControl = true,
    watermark = true,
    store,
    snapshot,
    camera,
    styles,
    autoFit = false,
    onMount,
    onChange,
    onSelectionChange,
    onThemeChange,
    onGridChange,
    onSave,
    className,
    style,
  } = props

  const hostRef = useRef(null)
  const editorRef = useRef(null)
  const uiRef = useRef(null)

  // latest callbacks without re-mounting the editor
  const cbRef = useRef({})
  cbRef.current = { onMount, onChange, onSelectionChange, onThemeChange, onGridChange, onSave }

  // mount once (per store identity); everything else updates in place
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const editor = new Editor({
      container: host,
      store: store || new Store(),
      theme,
      grid,
      readonly,
      disablePanScroll,
      camera,
      styles,
    })
    host.dataset.qdTheme = editor.theme.id
    const ui = buildUI(editor, {
      hidden: hideUi || readonly,
      themeToggle,
      gridControl,
      onSave: (blob, background) => {
        if (cbRef.current.onSave) return cbRef.current.onSave(blob, background)
        // default: download
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = 'quickdraw-' + new Date().toISOString().slice(0, 19).replaceAll(':', '.') + '.png'
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      },
    })
    editorRef.current = editor
    uiRef.current = ui
    const mark = watermark ? buildWatermark(editor) : null

    if (!store && snapshot) {
      editor.store.loadSnapshot(snapshot, 'remote')
      if (autoFit) editor.fitContent()
    }

    const unsubChange = editor.store.listen((diff, source) => {
      cbRef.current.onChange?.(diff, source, editor)
    })
    const unsubSel = editor.on('selection', () => {
      cbRef.current.onSelectionChange?.([...editor.selection], editor)
    })
    // the board menu can move theme/grid too — tell the host so its own state
    // (and any external toggle) can follow along
    const unsubTheme = editor.on('theme', () => {
      host.dataset.qdTheme = editor.theme.id
      cbRef.current.onThemeChange?.(editor.theme.id, editor)
    })
    const unsubGrid = editor.on('grid', () => {
      cbRef.current.onGridChange?.(editor.grid, editor)
    })

    let ro = null
    if (autoFit) {
      editor.fitContent()
      ro = new ResizeObserver(() => {
        editor.resize()
        editor.fitContent()
      })
      ro.observe(host)
    }

    cbRef.current.onMount?.(editor, ui)

    return () => {
      ro?.disconnect()
      unsubChange()
      unsubSel()
      unsubTheme()
      unsubGrid()
      mark?.remove()
      ui.destroy()
      editor.destroy()
      editorRef.current = null
      uiRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store])

  // live prop updates
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.setTheme(theme)
    hostRef.current.dataset.qdTheme = editor.theme.id
  }, [theme])

  useEffect(() => {
    editorRef.current?.setGrid(grid)
  }, [grid])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.setReadonly(readonly)
    uiRef.current?.setHidden(hideUi || readonly)
  }, [readonly, hideUi])

  useEffect(() => {
    if (editorRef.current) editorRef.current.disablePanScroll = !!disablePanScroll
  }, [disablePanScroll])

  useEffect(() => {
    uiRef.current?.setOptions({ themeToggle, gridControl })
  }, [themeToggle, gridControl])

  useImperativeHandle(ref, () => ({
    get editor() { return editorRef.current },
    get ui() { return uiRef.current },
  }), [])

  return createElement('div', {
    ref: hostRef,
    className,
    style: { width: '100%', height: '100%', ...style },
  })
})

/**
 * useQuickdrawStore — a stable Store instance for controlled usage:
 *   const store = useQuickdrawStore(initialSnapshot)
 *   <Quickdraw store={store} />
 */
export function useQuickdrawStore(snapshot) {
  const ref = useRef(null)
  if (!ref.current) {
    ref.current = new Store()
    if (snapshot) ref.current.loadSnapshot(snapshot, 'remote')
  }
  return ref.current
}
