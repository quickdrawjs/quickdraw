#!/usr/bin/env node
// Refreshes docs/sponsors.json from the GitHub Sponsors GraphQL API, so the
// website's sponsor wall updates itself — nobody edits a list by hand when a
// sponsorship starts or lapses. Same shape as star-history: CI runs this on a
// schedule and commits the snapshot; the static build just reads the file.
// The same run rewrites the sponsor block between the markers in README.md,
// so the repo page never lags the website.
//
// Reading sponsorships needs an authenticated token. The Actions token can
// usually read an org's public sponsors; if GitHub rejects it, add a classic
// PAT with read:org as the SPONSORS_TOKEN repo secret (the workflow prefers
// it when present).
//
//   GITHUB_TOKEN=<token> node scripts/sponsors.mjs

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { replaceSponsorsBlock } from './lib/sponsorsReadme.mjs'

const LOGIN = process.env.SPONSORS_LOGIN ?? 'quickdrawjs'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs')

const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
if (!token) {
  console.error('sponsors: GITHUB_TOKEN is required — the Sponsors API rejects anonymous reads.')
  process.exit(1)
}

const SPONSOR_FIELDS = `
  totalCount
  nodes {
    createdAt
    isOneTimePayment
    tier { monthlyPriceInDollars }
    sponsorEntity {
      ... on User { login name avatarUrl url websiteUrl }
      ... on Organization { login name avatarUrl url websiteUrl }
    }
  }
`

// The profile might live on an org or a user account — ask for both and take
// whichever exists. includePrivate stays false: private sponsors asked not to
// be shown, and this file is public.
const QUERY = `
  query($login: String!) {
    organization(login: $login) {
      sponsorshipsAsMaintainer(first: 100, activeOnly: true, includePrivate: false, orderBy: { field: CREATED_AT, direction: ASC }) { ${SPONSOR_FIELDS} }
    }
    user(login: $login) {
      sponsorshipsAsMaintainer(first: 100, activeOnly: true, includePrivate: false, orderBy: { field: CREATED_AT, direction: ASC }) { ${SPONSOR_FIELDS} }
    }
  }
`

const res = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'quickdraw-sponsors',
  },
  body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
})
if (!res.ok) {
  console.error(`sponsors: GraphQL request failed — ${res.status} ${res.statusText}`)
  process.exit(1)
}
const payload = await res.json()

// "Could not resolve to an Organization" for the unused half is expected —
// only bail when neither half resolved.
const conn =
  payload.data?.organization?.sponsorshipsAsMaintainer ??
  payload.data?.user?.sponsorshipsAsMaintainer
if (!conn) {
  console.error('sponsors: no sponsorable account found for', LOGIN, JSON.stringify(payload.errors ?? payload))
  process.exit(1)
}

const sponsors = (conn.nodes ?? [])
  .filter((n) => n?.sponsorEntity?.login)
  .map((n) => ({
    login: n.sponsorEntity.login,
    name: n.sponsorEntity.name || n.sponsorEntity.login,
    url: n.sponsorEntity.websiteUrl || n.sponsorEntity.url,
    avatar: n.sponsorEntity.avatarUrl,
    monthly: n.tier?.monthlyPriceInDollars ?? 0,
    oneTime: !!n.isOneTimePayment,
    since: n.createdAt?.slice(0, 10) ?? null,
  }))

// Only rewrite the snapshot when the wall actually changed — a fresh
// generatedAt alone would mean a commit (and a site deploy) on every run.
const snapshotPath = join(OUT, 'sponsors.json')
let previous = null
try {
  previous = JSON.parse(readFileSync(snapshotPath, 'utf8')).sponsors
} catch {
  // first run — no snapshot yet
}
if (JSON.stringify(previous) === JSON.stringify(sponsors)) {
  console.log(`sponsors: ${sponsors.length} sponsor(s), unchanged`)
} else {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(
    snapshotPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), login: LOGIN, sponsors }, null, 2) + '\n',
  )
  console.log(`sponsors: wrote ${sponsors.length} sponsor(s) to docs/sponsors.json`)
}

const readmePath = join(ROOT, 'README.md')
const readme = readFileSync(readmePath, 'utf8')
const next = replaceSponsorsBlock(readme, sponsors)
if (next === null) {
  console.warn('sponsors: README.md has no sponsors markers — left it alone')
} else if (next !== readme) {
  writeFileSync(readmePath, next)
  console.log('sponsors: updated the README sponsor block')
}
