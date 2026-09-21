import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const appsDir = resolve(root, 'apps')

const CATEGORIES = ['productivity', 'utilities', 'media', 'data', 'tools', 'games', 'misc']
const PERMISSIONS = [
  'storage',
  'profile',
  'navigation',
  'ui.toast',
  'ui.modal',
  'ui.confirm',
  'theme.write',
  'notifications',
  'scheduler',
  'clipboard',
  'external',
  'media',
]

const errors = []
const warnings = []
const seen = new Set()

const SEMVER = /^\d+\.\d+\.\d+$/
const RANGE = /^[\^~>=<]*\d+\.\d+\.\d+$/
const ID = /^[a-z][a-z0-9-]{1,31}$/
const HEXCODE = /^[0-9A-F]{2,6}(-[0-9A-F]{2,6})*$/

function check(condition, message, app) {
  if (!condition) errors.push(`${app}: ${message}`)
}

if (existsSync(appsDir)) {
  for (const dirent of readdirSync(appsDir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue
    const appId = dirent.name
    const manifestPath = join(appsDir, appId, 'app.manifest.json')
    if (!existsSync(manifestPath)) {
      errors.push(`${appId}: missing app.manifest.json`)
      continue
    }
    let manifest
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch (error) {
      errors.push(`${appId}: invalid JSON (${error.message})`)
      continue
    }

    const label = manifest.id ?? appId
    check(typeof manifest.id === 'string' && ID.test(manifest.id), 'invalid id (use ^[a-z][a-z0-9-]{1,31}$)', label)
    check(manifest.id === appId, `id "${manifest.id}" must match folder name "${appId}"`, label)
    check(!seen.has(manifest.id), `duplicate id "${manifest.id}"`, label)
    seen.add(manifest.id)

    check(typeof manifest.name === 'string' && manifest.name.length > 0, 'missing name', label)
    check(typeof manifest.icon === 'string' && HEXCODE.test(manifest.icon), 'icon must be an OpenMoji hexcode e.g. "1F4DD"', label)
    check(typeof manifest.version === 'string' && SEMVER.test(manifest.version), 'version must be semver (x.y.z)', label)
    check(typeof manifest.sdk === 'string' && RANGE.test(manifest.sdk), 'sdk must be a semver range e.g. "^1.0.0"', label)
    check(typeof manifest.entry === 'string', 'missing entry', label)
    check(
      !manifest.category || CATEGORIES.includes(manifest.category),
      `unknown category "${manifest.category}" (allowed: ${CATEGORIES.join(', ')})`,
      label,
    )

    if (manifest.entry) {
      check(existsSync(join(appsDir, appId, manifest.entry)), `entry "${manifest.entry}" does not exist`, label)
    }

    if (manifest.permissions) {
      check(Array.isArray(manifest.permissions), 'permissions must be an array', label)
      for (const permission of manifest.permissions ?? []) {
        check(PERMISSIONS.includes(permission), `unknown permission "${permission}"`, label)
      }
    }

    if (manifest.storage) {
      const scope = manifest.storage.scope
      check(
        scope === undefined || scope === 'profile' || scope === 'shared',
        `storage.scope must be "profile" or "shared"`,
        label,
      )
      check(
        manifest.storage.schemaVersion === undefined || Number.isInteger(manifest.storage.schemaVersion),
        'storage.schemaVersion must be an integer',
        label,
      )
    }
  }
} else {
  warnings.push('no apps/ directory found')
}

for (const warning of warnings) console.warn(`[validate] warn: ${warning}`)

if (errors.length > 0) {
  console.error('[validate] manifest errors:')
  for (const error of errors) console.error(`  - ${error}`)
  process.exit(1)
}

console.log(`[validate] ${seen.size} app manifest(s) valid`)
