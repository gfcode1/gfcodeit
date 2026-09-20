import { execSync } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'public/framework/v1')

execSync('pnpm exec vite build --config vite.framework.config.ts', { cwd: root, stdio: 'inherit' })

mkdirSync(outDir, { recursive: true })
copyFileSync(resolve(root, 'src/ui/tokens.css'), resolve(outDir, 'tokens.css'))

console.log('[framework] built public/framework/v1/{gf-runtime.js,tokens.css}')
