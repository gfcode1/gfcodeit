import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Recursively walks a directory, returning [relativePath, bytes] for every file. */
function walk(dir) {
  const out = []
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()
    for (const dirent of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, dirent.name)
      if (dirent.isDirectory()) stack.push(full)
      else if (dirent.isFile()) out.push([relative(root, full), statSync(full).size])
    }
  }
  return out
}

function human(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GiB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${bytes} B`
}

const targets = process.argv.slice(2)
const dirs = targets.length > 0 ? targets : ['dist', 'public/framework', 'public/openmoji', 'public/icons']

console.log('GFCode size report\n')

for (const target of dirs) {
  const abs = resolve(root, target)
  if (!existsSync(abs)) {
    console.log(`${target.padEnd(22)} (missing)`)
    continue
  }
  const files = walk(abs)
  const total = files.reduce((sum, [, size]) => sum + size, 0)
  console.log(`${target.padEnd(22)} ${human(total).padStart(10)}  ${files.length} file(s)`)
  const top = files.sort((a, b) => b[1] - a[1]).slice(0, 8)
  for (const [name, size] of top) {
    console.log(`    ${human(size).padStart(10)}  ${name}`)
  }
  console.log('')
}
