import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'public/openmoji')

function openmojiDir() {
  try {
    return dirname(require.resolve('openmoji/package.json'))
  } catch {
    return resolve(root, 'node_modules/openmoji')
  }
}

const pkgDir = openmojiDir()
if (!existsSync(pkgDir)) {
  console.error('[icons] openmoji package not found. Run: pnpm install')
  process.exit(1)
}

const dataPath = join(pkgDir, 'data', 'openmoji.json')
if (!existsSync(dataPath)) {
  console.error(`[icons] metadata not found at ${dataPath}`)
  process.exit(1)
}

/**
 * Only the black SVG icons actually referenced by the shell and the apps are
 * copied, which keeps the deployed tree small. The color set is loaded from a
 * CDN at runtime (see src/core/icons.ts). Any quoted hexcode literal in the
 * source is treated as a candidate; entries without a matching SVG are ignored,
 * so false positives are harmless.
 */
const HEXCODE = /^[0-9A-F]{2,6}(?:-[0-9A-F]{2,6})*$/
const QUOTED = /['"]([0-9A-Fa-f]{2,6}(?:-[0-9A-Fa-f]{2,6})*)['"]/g
const SKIP_DIRS = new Set(['node_modules', 'dist', 'public', '.sounds-src', 'sounds', 'coverage'])
const EXTS = new Set(['.ts', '.mjs', '.js', '.json', '.html', '.css'])
const SCAN_ROOTS = ['src', 'apps', 'framework', 'types', 'templates']

function collectCodepoints() {
  const found = new Set()

  function scanText(text) {
    for (const match of text.matchAll(QUOTED)) {
      const hex = match[1].toUpperCase()
      if (HEXCODE.test(hex)) found.add(hex)
    }
  }

  function walk(dir) {
    for (const dirent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, dirent.name)
      if (dirent.isDirectory()) {
        if (SKIP_DIRS.has(dirent.name)) continue
        walk(full)
      } else if (EXTS.has(extname(dirent.name))) {
        scanText(readFileSync(full, 'utf8'))
      }
    }
  }

  for (const rel of SCAN_ROOTS) {
    const dir = join(root, rel)
    if (existsSync(dir)) walk(dir)
  }
  const indexHtml = join(root, 'index.html')
  if (existsSync(indexHtml)) scanText(readFileSync(indexHtml, 'utf8'))

  return found
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(join(outDir, 'black', 'svg'), { recursive: true })

const blackSrc = join(pkgDir, 'black', 'svg')
const candidates = [...collectCodepoints()].sort()
let copied = 0
for (const hex of candidates) {
  const from = join(blackSrc, `${hex}.svg`)
  if (!existsSync(from)) continue
  cpSync(from, join(outDir, 'black', 'svg', `${hex}.svg`))
  copied += 1
}

// The desktop build runs offline, so the color set (used by the emoji picker
// and color avatars) is bundled locally instead of being fetched from the CDN.
if (process.env.VITE_GF_DESKTOP) {
  const colorSrc = join(pkgDir, 'color', 'svg')
  if (existsSync(colorSrc)) {
    cpSync(colorSrc, join(outDir, 'color', 'svg'), { recursive: true })
    console.log(`[icons] copied the color SVG set to public/openmoji/color/svg/ (desktop)`)
  }
}

const license = join(pkgDir, 'LICENSE.txt')
if (existsSync(license)) cpSync(license, join(outDir, 'LICENSE.txt'))

const raw = JSON.parse(readFileSync(dataPath, 'utf8'))
const index = raw.map((entry) => ({
  hexcode: entry.hexcode,
  name: entry.annotation,
  group: entry.group,
  tags: entry.tags,
  order: entry.order,
}))
writeFileSync(join(outDir, 'icons.json'), JSON.stringify(index))

console.log(
  `[icons] copied ${copied}/${candidates.length} black SVGs and ${index.length} index entries to public/openmoji/`,
)
