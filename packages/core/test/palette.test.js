// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import {
  THEMES, themeOf, COLOR_IDS, SIZE_IDS, DASH_IDS, FILL_IDS, GEO_IDS, GRID_IDS,
  SIZES, FONT_SIZES, FONTS, FONT_IDS, setFontStacks, resetFontStacks, fontStackOf,
} from '../src/palette.js'

describe('palette', () => {
  it('themeOf falls back to light for anything but dark', () => {
    expect(themeOf('dark').id).toBe('dark')
    expect(themeOf('light').id).toBe('light')
    expect(themeOf('nope').id).toBe('light')
    expect(themeOf(undefined).id).toBe('light')
  })

  it('both themes resolve every color id with stroke/fill/note', () => {
    for (const theme of Object.values(THEMES)) {
      for (const id of COLOR_IDS) {
        const c = theme.colors[id]
        expect(c, `${theme.id}/${id}`).toBeTruthy()
        for (const k of ['stroke', 'fill', 'note']) {
          expect(c[k]).toMatch(/^#[0-9a-f]{6}$/i)
        }
      }
    }
  })

  it('size/dash/fill/geo rosters are consistent with their maps', () => {
    for (const s of SIZE_IDS) {
      expect(SIZES[s]).toBeGreaterThan(0)
      expect(FONT_SIZES[s]).toBeGreaterThan(0)
    }
    expect(DASH_IDS).toContain('draw')
    expect(FILL_IDS).toContain('none')
    expect(GEO_IDS.length).toBeGreaterThanOrEqual(6)
    for (const f of Object.values(FONTS)) expect(typeof f).toBe('string')
  })

  it('every theme carries two-weight grid ink for rules and dots', () => {
    expect(GRID_IDS).toEqual(['none', 'lines', 'ruled', 'dots', 'crosses', 'iso'])
    const alpha = (c) => parseFloat(c.split(',').pop())
    for (const theme of Object.values(THEMES)) {
      for (const kind of ['line', 'dot']) {
        const g = theme.grid[kind]
        expect(g.minor, `${theme.id}/${kind}`).toMatch(/^rgba\(/)
        expect(g.major, `${theme.id}/${kind}`).toMatch(/^rgba\(/)
        expect(alpha(g.major)).toBeGreaterThan(alpha(g.minor))
      }
      // a dot lays down less ink than a rule, so it has to run darker
      expect(alpha(theme.grid.dot.minor)).toBeGreaterThan(alpha(theme.grid.line.minor))
    }
  })
})

describe('font stacks', () => {
  afterEach(() => resetFontStacks())

  it('defaults resolve every rostered id; unknown ids fall back to draw', () => {
    for (const id of FONT_IDS) expect(fontStackOf(id)).toBe(FONTS[id])
    expect(fontStackOf('nope')).toBe(FONTS.draw)
    expect(fontStackOf()).toBe(FONTS.draw)
  })

  it('setFontStacks remaps ids (and registers new ones); reset restores', () => {
    setFontStacks({ sans: "'Inter', sans-serif", brand: "'Brand', serif" })
    expect(fontStackOf('sans')).toBe("'Inter', sans-serif")
    expect(fontStackOf('brand')).toBe("'Brand', serif")
    expect(fontStackOf('draw')).toBe(FONTS.draw)
    resetFontStacks()
    expect(fontStackOf('sans')).toBe(FONTS.sans)
    expect(fontStackOf('brand')).toBe(FONTS.draw)
  })

  it('rejects empty ids and stacks', () => {
    expect(() => setFontStacks({ '': 'serif' })).toThrow(TypeError)
    expect(() => setFontStacks({ sans: '' })).toThrow(TypeError)
    expect(() => setFontStacks({ sans: 42 })).toThrow(TypeError)
  })

  it('text layout follows the override', async () => {
    const { textLayout } = await import('../src/shapes.js')
    const shape = (font) => ({
      id: 't', typeName: 'shape', type: 'text', x: 0, y: 0, rot: 0, z: 1,
      props: { text: 'hi', size: 'm', color: 'black', font },
    })
    expect(textLayout(shape('sans')).font).toBe(FONTS.sans)
    setFontStacks({ sans: "'Inter', sans-serif" })
    expect(textLayout(shape('sans')).font).toBe("'Inter', sans-serif")
  })
})
