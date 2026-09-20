import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'public/icons')
mkdirSync(outDir, { recursive: true })

const jobs = [
  ['public/favicon.svg', 'icon-192.png', 192],
  ['public/favicon.svg', 'icon-512.png', 512],
  ['public/icons/maskable.svg', 'maskable-512.png', 512],
  ['public/favicon.svg', 'apple-touch-icon.png', 180],
]

for (const [source, target, size] of jobs) {
  await sharp(resolve(root, source)).resize(size, size).png().toFile(resolve(outDir, target))
}

console.log(`[pwa] generated ${jobs.length} icons in public/icons/`)
