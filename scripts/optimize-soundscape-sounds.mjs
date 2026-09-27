import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Transcodes the Soundscape ambience to small, universally supported MP3s.
 *
 * Ambient loops are downmixed to mono 64 kbps; binaural tones must stay stereo
 * (the effect depends on a different frequency per ear) so they keep 96 kbps;
 * noise keeps 96 kbps to avoid artifacts. WAV sources become MP3.
 *
 * Usage:
 *   node scripts/optimize-soundscape-sounds.mjs [--src DIR] [--dest DIR] [--force]
 *
 * Defaults to transcoding in place (apps/soundscape/sounds). Re-running skips
 * files that already match the target profile unless --force is passed.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)

function argValue(name, fallback) {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const force = args.includes('--force')
const srcDir = resolve(root, argValue('--src', 'apps/soundscape/sounds'))
const destDir = resolve(root, argValue('--dest', 'apps/soundscape/sounds'))

if (!existsSync(srcDir)) {
  console.error(`[sounds] source directory not found: ${srcDir}`)
  process.exit(1)
}

try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
} catch {
  console.error('[sounds] ffmpeg is required (install it and re-run)')
  process.exit(1)
}

/** Target profile per relative path. */
function profileFor(relPath) {
  const base = relPath.toLowerCase()
  if (base.startsWith('binaural/')) return { channels: 2, bitrate: '96k' }
  if (base.startsWith('noise/')) return { channels: 1, bitrate: '96k' }
  if (base.includes('silence')) return { channels: 1, bitrate: '32k' }
  return { channels: 1, bitrate: '64k' }
}

function probe(file) {
  const out = execFileSync('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'a:0',
    '-show_entries',
    'stream=channels,bit_rate',
    '-of',
    'csv=p=0',
    file,
  ])
  const [channels, bitRate] = String(out).trim().split(',')
  return { channels: Number(channels), bitRate: Number(bitRate) }
}

function walk(dir) {
  const files = []
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, dirent.name)
    if (dirent.isDirectory()) files.push(...walk(full))
    else if (/\.(mp3|wav)$/i.test(dirent.name)) files.push(full)
  }
  return files
}

function targetFor(file) {
  const rel = relative(srcDir, file)
  const profile = profileFor(rel)
  const destRel = rel.replace(/\.wav$/i, '.mp3')
  return { rel, destRel, dest: join(destDir, destRel), profile }
}

const files = walk(srcDir)
let converted = 0
let skipped = 0
let bytesBefore = 0
let bytesAfter = 0

for (const file of files) {
  const { rel, dest, profile } = targetFor(file)
  const isWav = extname(file).toLowerCase() === '.wav'
  const before = statSync(file).size
  bytesBefore += before

  if (!isWav && !force && existsSync(dest)) {
    try {
      const { channels, bitRate } = probe(file)
      const targetRate = Number.parseInt(profile.bitrate, 10) * 1000
      if (channels === profile.channels && bitRate > 0 && bitRate <= targetRate + 8_000) {
        bytesAfter += before
        skipped += 1
        continue
      }
    } catch {
      /* fall through and transcode */
    }
  }

  mkdirSync(dirname(dest), { recursive: true })
  const tmp = `${dest}.tmp.mp3`
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      file,
      '-vn',
      '-map_metadata',
      '-1',
      '-ac',
      String(profile.channels),
      '-ar',
      '44100',
      '-c:a',
      'libmp3lame',
      '-b:a',
      profile.bitrate,
      tmp,
    ],
    { stdio: 'ignore' },
  )
  renameSync(tmp, dest)
  if (isWav && resolve(file) !== resolve(dest)) rmSync(file)

  const after = statSync(dest).size
  bytesAfter += after
  converted += 1
  process.stdout.write(`  ✓ ${rel} → ${profile.bitrate} ${profile.channels === 1 ? 'mono' : 'stereo'}\n`)
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1)
console.log(
  `[sounds] ${converted} converted, ${skipped} already optimized · ${mb(bytesBefore)} MB → ${mb(bytesAfter)} MB`,
)
