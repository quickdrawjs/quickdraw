# Quickdraw

[![CI](https://github.com/quickdrawjs/quickdraw/actions/workflows/ci.yml/badge.svg)](https://github.com/quickdrawjs/quickdraw/actions/workflows/ci.yml)
[![npm: @quickdrawjs/core](https://img.shields.io/npm/v/@quickdrawjs/core?label=%40quickdrawjs%2Fcore&logo=npm)](https://www.npmjs.com/package/@quickdrawjs/core)
[![npm: @quickdrawjs/react](https://img.shields.io/npm/v/@quickdrawjs/react?label=%40quickdrawjs%2Freact&logo=npm)](https://www.npmjs.com/package/@quickdrawjs/react)
[![npm: @quickdrawjs/react-native](https://img.shields.io/npm/v/@quickdrawjs/react-native?label=%40quickdrawjs%2Freact-native&logo=npm)](https://www.npmjs.com/package/@quickdrawjs/react-native)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**The MIT-licensed infinite-canvas whiteboard SDK.** Drop a complete,
polished drawing surface into your React, React Native, or plain-JS app —
free for any use, including commercial products, forever. An open-source
alternative to tldraw with no license fee.

**[Website](https://tryquickdraw.com)** · **[Try the app](https://app.tryquickdraw.com)** · **[npm](https://www.npmjs.com/package/@quickdrawjs/core)** · [Docs](https://tryquickdraw.com/docs/) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/demo-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/demo-light.png">
  <img src="docs/demo-light.png" alt="A Quickdraw board explaining Quickdraw: hand-drawn color-filled boxes for your app, the editor and store, the canvas, the JSON diff and your backend, joined by bendable arrows, with a sticky note, a highlighted &quot;MIT, no license key&quot; line, and a red pen note pointing at the removable watermark" width="100%">
</picture>

<sup>The hosted app at <a href="https://app.tryquickdraw.com">app.tryquickdraw.com</a> — the same board <code>createQuickdraw()</code> drops into your page.</sup>

Quickdraw exists because embedding a whiteboard shouldn't cost thousands of
dollars a year. Quickdraw is MIT: no license key, no fees, no strings. A small
"Made with Quickdraw" badge sits in the board's corner by default; keeping it
helps people find the project, and turning it off is free, legal, and one line
— `watermark: false`, no license key, no signup, no phone-home. We just
appreciate the credit.

## What you get

A simple, joyful drawing experience:

- **Pressure ink** — a freehand pen whose width breathes with stylus pressure,
  or with velocity for mouse users; strokes taper like a real pen
- **Highlighter** that soaks into the paper (and glows on dark boards)
- **Shapes** — rectangle, ellipse, triangle, diamond, hexagon, star, cloud — with a
  seeded hand-drawn wobble, four fill styles, and editable labels
- **Arrows** with draggable bend, lines, text, sticky notes
- **Images** — paste, drag-drop, or pick; auto-downscaled and stored in-document
- **Laser pointer** for presenting (ephemeral, never saved)
- **Selection** — click, shift-click, marquee; move, resize, rotate, duplicate,
  reorder; full keyboard nudging
- **Infinite canvas** — pan, wheel zoom, two-finger pinch, zoom-to-fit
- **Palm rejection** — once a stylus is seen, fingers steer the camera and the
  pen draws
- **Undo/redo** — one entry per gesture, however many events it took
- **Light & dark themes**, twelve named colors that resolve per theme, and a
  theme switch built into the board menu
- **Grid backdrops** — plain, ruled lines, notebook rules, dots, crosses
  (blueprint), and isometric; default is `lines`; spacing adapts to the zoom
  and fades in rather than popping
- **PNG export** — whole board or selection, on paper or transparent
- **A responsive floating toolbar** that sheds tools gracefully as the frame
  narrows — or hide it and build your own from the headless API
- **Real-time sync built into the data model** — every change emits a
  JSON-safe diff you can ship over any transport

Zero runtime dependencies. The core is plain ESM that runs in any modern
browser without a build step.

## Packages

| Package | For | |
| --- | --- | --- |
| [`@quickdrawjs/core`](packages/core) | Any web page or framework | framework-free engine + toolbar |
| [`@quickdrawjs/react`](packages/react) | React apps | `<Quickdraw />` component + hooks |
| [`@quickdrawjs/react-native`](packages/react-native) | React Native / Expo apps | WebView component + typed bridge |

## Quick start — React

```bash
npm install @quickdrawjs/react
```

```jsx
import { Quickdraw } from '@quickdrawjs/react'
import '@quickdrawjs/core/quickdraw.css'

export default function App() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Quickdraw theme="light" grid="lines" watermark={false} />
      {/* the "Made with Quickdraw" badge is on by default;
          watermark={false} removes it — free, no strings */}
    </div>
  )
}
```

Persistence, imperative control, custom chrome:

```jsx
const ref = useRef(null)

<Quickdraw
  ref={ref}
  snapshot={saved}                          // load a serialized document
  autoFit                                   // fit content on mount/resize
  onChange={(diff, source, editor) =>       // every document change
    save(editor.store.getSnapshot())}
  onSave={(blob) => upload(blob)}           // intercept toolbar PNG export
/>

ref.current.editor.setTool('draw')
ref.current.editor.store.undo()
```

## Quick start — plain JS

```bash
npm install @quickdrawjs/core
```

```js
import { createQuickdraw } from '@quickdrawjs/core'
import '@quickdrawjs/core/quickdraw.css'

const board = createQuickdraw({ container: document.getElementById('board') })
board.editor.store.listen((diff) => console.log('changed', diff))
```

## Quick start — React Native

```bash
npm install @quickdrawjs/react-native react-native-webview
```

```jsx
import { Quickdraw } from '@quickdrawjs/react-native'

<Quickdraw
  ref={board}
  theme="dark"
  onChange={(diff) => sync(diff)}
  style={{ flex: 1 }}
/>

// const snapshot = await board.current.getSnapshot()
// const png = await board.current.exportPng({ scale: 2 })
```

The engine ships inside the package as a single self-contained HTML string —
no network, works offline, Apple Pencil pressure and palm rejection included.

## The data model

The document is a flat map of immutable records. Every mutation happens in a
transaction and emits a diff:

```js
{ added: { [id]: record }, removed: { [id]: record }, updated: { [id]: [from, to] } }
```

That one shape powers everything:

- **Persistence** — `store.getSnapshot()` / `store.loadSnapshot(snap)` are
  plain JSON round-trips
- **Sync** — ship user diffs to peers, `store.applyDiff(diff, 'remote')` on
  arrival; remote diffs never pollute local undo history, so collaborative
  undo behaves
- **History** — undo entries are diffs, composed per gesture; `invertDiff` and
  `composeDiff` are exported
- **Audit / recording** — log the diff stream and you can replay a drawing
  stroke by stroke

```js
// a complete sync client
store.listen((diff) => socket.send(JSON.stringify(diff)), { source: 'user' })
socket.onmessage = (e) => store.applyDiff(JSON.parse(e.data), 'remote')
```

## Keyboard shortcuts

| | |
| --- | --- |
| `V` / `1` | Select |
| `H` | Hand (or hold `Space`) |
| `D` / `P` / `B` | Draw |
| `I` | Highlight |
| `E` | Eraser |
| `K` | Laser |
| `A` / `L` | Arrow / Line |
| `G`, `R`, `O` | Shape / rectangle / ellipse |
| `T` / `N` | Text / sticky note |
| `⌘Z` / `⇧⌘Z` | Undo / redo |
| `⌘A` `⌘C` `⌘X` `⌘V` `⌘D` | Select all, copy, cut, paste, duplicate |
| `]` / `[` | Bring to front / send to back |
| Arrows (+`Shift`) | Nudge selection |
| `⇧1` / `⇧0` | Zoom to fit / reset zoom |
| `⌘+` / `⌘−` | Zoom in / out |
| `⌫` / `⇧⌘⌫` | Delete selection / clear the board (undoable) |
| `Enter` / `Esc` | Edit text / done |

## Repository

```
packages/core          @quickdrawjs/core — the engine (plain ESM, zero deps)
packages/react         @quickdrawjs/react
packages/react-native  @quickdrawjs/react-native
examples/vanilla       no-build-step example (open via any static server)
examples/react-demo    vite playground (npm run dev)
```

Development:

```bash
npm install       # workspace install
npm test          # vitest — engine, React bindings, RN bridge
npm run dev       # react demo at localhost:5173
npm run build     # bundle the RN WebView page
npm run typecheck # validate the published type declarations
```

## Roadmap — and what's honestly missing today

Quickdraw is young. What it doesn't have yet: a first-party multiplayer
server (the diff-based store is sync-ready — you bring the transport),
layers, frames, or rich text. The full roadmap lives in
[issue #1](https://github.com/quickdrawjs/quickdraw/issues/1) — comment there
if the missing feature that sent you back to a paid SDK is on it (or isn't).

## Made with Quickdraw

Projects and products built on Quickdraw. Shipped something? **Add it here** —
edit this table and open a PR (one row, alphabetical, ≤ 15-word description;
see the [showcase guidelines](CONTRIBUTING.md#add-your-project-to-the-showcase)).

| Project | Description |
| --- | --- |
| [tryquickdraw.com/app](https://app.tryquickdraw.com) | The official free whiteboard app — no account, autosaves locally. |
| _Your project here_ | [Add yours →](CONTRIBUTING.md#add-your-project-to-the-showcase) |

## Sponsors

Quickdraw is MIT-licensed with no paid tier — [sponsors](https://github.com/sponsors/quickdrawjs)
are what keep it that way. Sponsors get their logo on
[the website](https://tryquickdraw.com/sponsors/) and here:

<a href="https://tryquickdraw.com/sponsors/"><i>No sponsors yet — your logo could be the first.</i></a>

## Star history

Quickdraw is free forever — no license fees, no upsell. If it saves you one, a
star is how other developers find it.

<a href="https://github.com/quickdrawjs/quickdraw/stargazers">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/star-history-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="docs/star-history.svg">
    <img src="docs/star-history.svg" alt="Quickdraw's GitHub star count over time" width="100%">
  </picture>
</a>

<sup>Regenerated every night by
<a href=".github/workflows/star-history.yml">a scheduled workflow</a> —
same data as the chart on <a href="https://tryquickdraw.com/#support">the website</a>.</sup>

## Contributing

Quickdraw is open to contributions from everyone — bug reports, features,
docs, examples. Start with [CONTRIBUTING.md](CONTRIBUTING.md), browse
[`good first issue`](https://github.com/quickdrawjs/quickdraw/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22),
or open a [discussion](https://github.com/quickdrawjs/quickdraw/discussions)
if you're not sure where a change belongs. We follow the
[Contributor Covenant](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE). Use it, ship it, sell what you build with it.
