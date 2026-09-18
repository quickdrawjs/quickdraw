import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { GEO_IDS, GRID_IDS } from '../src/palette.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dts = readFileSync(resolve(__dirname, '../types/index.d.ts'), 'utf8')

function parseUnion(typeName) {
  const re = new RegExp(`export type ${typeName}\\s*=\\s*([^\\n]+)`)
  const m = dts.match(re)
  if (!m) throw new Error(`${typeName} not found in types/index.d.ts`)
  return m[1]
    .split('|')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean)
    .sort()
}

describe('type declarations stay in sync with palette.js', () => {
  it('GeoId union matches GEO_IDS', () => {
    expect(parseUnion('GeoId')).toEqual([...GEO_IDS].sort())
  })

  it('GridId union matches GRID_IDS', () => {
    expect(parseUnion('GridId')).toEqual([...GRID_IDS].sort())
  })
})
