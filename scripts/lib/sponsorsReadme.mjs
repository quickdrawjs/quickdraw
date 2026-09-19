// Renders the sponsor block that lives between the markers in README.md, so
// the repo page shows the same wall as the website. Pure string-in/string-out
// — scripts/sponsors.mjs does the file I/O.

export const START = '<!-- sponsors:start -->'
export const END = '<!-- sponsors:end -->'

const SPONSORS_PAGE = 'https://tryquickdraw.com/sponsors/'
const EMPTY = `<a href="${SPONSORS_PAGE}"><i>No sponsors yet — your logo could be the first.</i></a>`

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// GitHub strips styles from README HTML, so layout is a plain table (the
// all-contributors trick): avatar on top, name under it, PER_ROW to a row.
const PER_ROW = 6

export function renderSponsorsBlock(sponsors) {
  if (!sponsors.length) return EMPTY
  const cells = sponsors
    .slice()
    .sort((a, b) => (b.monthly ?? 0) - (a.monthly ?? 0) || (a.since ?? '').localeCompare(b.since ?? ''))
    .map((s) => {
      const avatar = s.avatar + (s.avatar.includes('?') ? '&' : '?') + 's=128'
      return `<td align="center"><a href="${esc(s.url)}"><img src="${esc(avatar)}" width="64" height="64" alt="${esc(s.name)}"><br><sub><b>${esc(s.name)}</b></sub></a></td>`
    })
  const rows = []
  for (let i = 0; i < cells.length; i += PER_ROW) rows.push(`<tr>\n${cells.slice(i, i + PER_ROW).join('\n')}\n</tr>`)
  return `<table>\n${rows.join('\n')}\n</table>`
}

// Returns the README with the block between the markers replaced, or null
// when the markers are missing — the caller decides how loud to be about it.
export function replaceSponsorsBlock(readme, sponsors) {
  const a = readme.indexOf(START)
  const b = readme.indexOf(END)
  if (a === -1 || b === -1 || b < a) return null
  return `${readme.slice(0, a + START.length)}\n${renderSponsorsBlock(sponsors)}\n${readme.slice(b)}`
}
