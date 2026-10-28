# Changelog

All notable changes to the `@quickdrawjs/*` packages are documented here.
The project follows [semver](https://semver.org); the three packages are
versioned in lockstep.

## Unreleased

- Undo never seems to do nothing: an edit that ends where it began (a drag
  back to the start, a style set to what it was) leaves no undo step.
- Holding an arrow key moves the selection as one undo step.
- ⌘Z in the middle of a drag ends the drag first, so the undo takes back all
  of it.

## 0.3.0 — 2026-10-12

- Text is set in Libre Baskerville, bundled with the engine (SIL OFL 1.1),
  so it reads the same on every machine; the fallbacks are serifs.
- Calmer hand-drawn shapes; geo labels take a `labelScale` for type past `xl`.
- Built-in cloud shape.
- Keyboard shortcuts overlay (press `?`).
- Grid: stronger lines and dots in both themes, constant ink through zoom,
  relaxed spacing, and an isometric weave at twice the step.
- Blue default ink and canvas chrome that follows the board's theme.
- Fixed: editing existing text on touch, stray iOS canvas selection, the
  shape button dropping a selection instead of re-kinding it, and the
  `GeoId`/`GridId` type unions drifting from `palette.js`.

## 0.1.3 — 2026-08-01

- The pen (draw) tool is now selected by default when a board mounts,
  instead of the select tool — everywhere: core, React, React Native,
  the hosted app, and the site demos.

## 0.1.2 — 2026-08-01

- npm discovery keywords added to all three packages. No code changes.

## 0.1.1 — 2026-08-01

- Lines are now bendable: drag the new midpoint anchor to curve a line,
  exactly like arrows. Lines and arrows both show three anchors
  (start, midpoint, end).
- Fixed: straight arrows could not be bent — the midpoint anchor
  collapsed onto the end anchor when `bend` was 0, making it ungrabbable.

## 0.1.0 — 2026-08-01

First public release.

- `@quickdrawjs/core` — the framework-free engine: pressure-sensitive
  freehand ink, highlighter, shapes with hand-drawn wobble, arrows with
  draggable bend, text, sticky notes, images, laser pointer, selection with
  move/resize/rotate, infinite canvas with pan/zoom/pinch, palm rejection,
  per-gesture undo/redo, light & dark themes, ruled/dotted grid backdrops,
  PNG export, responsive floating toolbar, and a diff-emitting store built
  for persistence and real-time sync. Zero runtime dependencies.
- `@quickdrawjs/react` — `<Quickdraw />` component with `snapshot`,
  `onChange`, `onSave`, `autoFit`, and an imperative ref to the editor.
- `@quickdrawjs/react-native` — WebView-based component with a typed bridge:
  `getSnapshot()`, `exportPng()`, theme control, Apple Pencil pressure, and
  palm rejection. Ships a self-contained HTML bundle; works offline.
