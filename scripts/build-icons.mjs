import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

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

mkdirSync(outDir, { recursive: true })

for (const variant of ['black', 'color']) {
  const from = join(pkgDir, variant, 'svg')
  if (existsSync(from)) {
    cpSync(from, join(outDir, variant, 'svg'), { recursive: true })
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

console.log(`[icons] copied ${index.length} OpenMoji entries to public/openmoji/`)
