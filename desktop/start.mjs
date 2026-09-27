import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from './build.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

build()

const require = createRequire(import.meta.url)
const electron = require('electron')
const child = spawn(electron, ['desktop/main.mjs'], { cwd: root, stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))

// Keep the wrapper responsive to Ctrl+C so electron is torn down with it.
process.on('SIGINT', () => {
  child.kill('SIGTERM')
  process.exit(0)
})
