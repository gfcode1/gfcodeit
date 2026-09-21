// Generates public/rss-catalog.json from the OPML files of
// https://github.com/plenaryapp/awesome-rss-feeds (raw.githubusercontent.com
// serves them with CORS enabled, but we vendor them at build time so the app
// works offline and does not depend on GitHub at runtime).
//
// Failure is non-fatal: when the network is unavailable an existing catalog is
// kept, otherwise an empty one is written so the build can still proceed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outFile = resolve(root, 'public/rss-catalog.json')

const RAW = 'https://raw.githubusercontent.com/spians/awesome-RSS-feeds/master'

const CATEGORIES = [
  'Android',
  'Android Development',
  'Apple',
  'Architecture',
  'Beauty',
  'Books',
  'Business & Economy',
  'Cars',
  'Cricket',
  'Interior design',
  'DIY',
  'Fashion',
  'Food',
  'Football',
  'Funny',
  'Gaming',
  'History',
  'iOS Development',
  'Movies',
  'Music',
  'News',
  'Personal finance',
  'Photography',
  'Programming',
  'Science',
  'Space',
  'Sports',
  'Startups',
  'Tech',
  'Television',
  'Tennis',
  'Travel',
  'UI / UX',
  'Web Development',
]

const COUNTRIES = [
  'Australia',
  'Bangladesh',
  'Brazil',
  'Canada',
  'Germany',
  'Spain',
  'France',
  'United Kingdom',
  'Hong Kong SAR China',
  'Indonesia',
  'Ireland',
  'India',
  'Iran',
  'Italy',
  'Japan',
  'Myanmar (Burma)',
  'Mexico',
  'Nigeria',
  'Philippines',
  'Pakistan',
  'Poland',
  'Russia',
  'Ukraine',
  'United States',
  'South Africa',
]

// A few OPML file names differ from the display title in the README.
const FILE_OVERRIDES = {
  'UI / UX': 'UI - UX',
}

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeEntities(value) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X'
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return ENTITIES[entity.toLowerCase()] ?? match
  })
}

function attr(attrs, name) {
  const match = attrs.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'))
  if (!match) return ''
  return decodeEntities(match[1]).trim()
}

/** Parses the flat `<outline xmlUrl=... />` entries of a without_category OPML. */
function parseOpml(xml) {
  const feeds = []
  const outlineRe = /<outline\b([^>]*?)\/?>/gi
  let match
  while ((match = outlineRe.exec(xml)) !== null) {
    const attrs = match[1]
    const url = attr(attrs, 'xmlUrl')
    if (!url) continue
    const title = attr(attrs, 'title') || attr(attrs, 'text') || url
    const description = attr(attrs, 'description')
    feeds.push({ title, url, description })
  }
  return feeds
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function fetchOpml(path) {
  const response = await fetch(`${RAW}/${path}`, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

async function buildGroup(name, kind) {
  const dir = kind === 'category' ? 'recommended' : 'countries'
  const file = FILE_OVERRIDES[name] ?? name
  const path = `${dir}/without_category/${encodeURIComponent(file)}.opml`
  const xml = await fetchOpml(path)
  const seen = new Set()
  const feeds = []
  for (const feed of parseOpml(xml)) {
    const key = feed.url.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    feeds.push(feed)
  }
  return { id: slug(name), title: name, kind, feeds }
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  async function run() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}

function readExisting() {
  if (!existsSync(outFile)) return null
  try {
    return JSON.parse(readFileSync(outFile, 'utf8'))
  } catch {
    return null
  }
}

async function main() {
  const jobs = [
    ...CATEGORIES.map((name) => ({ name, kind: 'category' })),
    ...COUNTRIES.map((name) => ({ name, kind: 'country' })),
  ]

  let failures = 0
  const groups = await mapPool(jobs, 6, async ({ name, kind }) => {
    try {
      return await buildGroup(name, kind)
    } catch (error) {
      failures += 1
      console.warn(`[rss-catalog] warn: ${kind} "${name}" failed — ${error.message}`)
      return null
    }
  })

  const resolved = groups.filter(Boolean)
  const feedCount = resolved.reduce((total, group) => total + group.feeds.length, 0)

  if (resolved.length === 0) {
    const existing = readExisting()
    if (existing) {
      console.warn('[rss-catalog] network unavailable — keeping existing catalog')
      return
    }
    console.warn('[rss-catalog] network unavailable — writing empty catalog')
  }

  const catalog = {
    source: 'https://github.com/plenaryapp/awesome-rss-feeds',
    generatedAt: new Date().toISOString(),
    groups: resolved,
  }

  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, `${JSON.stringify(catalog)}\n`)
  console.log(
    `[rss-catalog] ${resolved.length}/${jobs.length} group(s), ${feedCount} feed(s)` +
      (failures ? ` (${failures} failed)` : ''),
  )
}

await main()
