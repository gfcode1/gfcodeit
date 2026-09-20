import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const id = process.argv[2]
const icon = process.argv[3] ?? '1F9E9'

if (!id || !/^[a-z][a-z0-9-]{1,31}$/.test(id)) {
  console.error('Usage: pnpm new-app <id> [openmoji-hexcode]')
  console.error('  id must match ^[a-z][a-z0-9-]{1,31}$  e.g. "weather"')
  process.exit(1)
}

const dest = resolve(root, 'apps', id)
if (existsSync(dest)) {
  console.error(`App "${id}" already exists at apps/${id}`)
  process.exit(1)
}

const template = resolve(root, 'templates/app')
const name = id
  .split('-')
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ')

cpSync(template, dest, { recursive: true })

const TEXT_EXTENSIONS = ['.json', '.html', '.ts', '.css', '.md']
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full)
      continue
    }
    if (!TEXT_EXTENSIONS.some((ext) => full.endsWith(ext))) continue
    const content = readFileSync(full, 'utf8')
      .replaceAll('__ID__', id)
      .replaceAll('__NAME__', name)
      .replaceAll('__ICON__', icon)
    writeFileSync(full, content)
  }
}
walk(dest)

console.log(`Created apps/${id} (icon ${icon}). Run: pnpm dev:app ${id}`)
