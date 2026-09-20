import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'apps', 'soundscape', 'sounds')
const CDN = 'https://cdn.jsdelivr.net/gh/remvze/moodist@main/public/sounds'
const CONCURRENCY = 6

const FILES = [
  'alarm.mp3',
  'silence.wav',
  'animals/beehive.mp3',
  'animals/birds.mp3',
  'animals/cat-purring.mp3',
  'animals/chickens.mp3',
  'animals/cows.mp3',
  'animals/crickets.mp3',
  'animals/crows.mp3',
  'animals/dog-barking.mp3',
  'animals/frog.mp3',
  'animals/horse-gallop.mp3',
  'animals/owl.mp3',
  'animals/seagulls.mp3',
  'animals/sheep.mp3',
  'animals/whale.mp3',
  'animals/wolf.mp3',
  'animals/woodpecker.mp3',
  'binaural/binaural-alpha.wav',
  'binaural/binaural-beta.wav',
  'binaural/binaural-delta.wav',
  'binaural/binaural-gamma.wav',
  'binaural/binaural-theta.wav',
  'nature/campfire.mp3',
  'nature/droplets.mp3',
  'nature/howling-wind.mp3',
  'nature/jungle.mp3',
  'nature/river.mp3',
  'nature/walk-in-snow.mp3',
  'nature/walk-on-gravel.mp3',
  'nature/walk-on-leaves.mp3',
  'nature/waterfall.mp3',
  'nature/waves.mp3',
  'nature/wind-in-trees.mp3',
  'nature/wind.mp3',
  'noise/brown-noise.wav',
  'noise/pink-noise.wav',
  'noise/white-noise.wav',
  'places/airport.mp3',
  'places/cafe.mp3',
  'places/carousel.mp3',
  'places/church.mp3',
  'places/construction-site.mp3',
  'places/crowded-bar.mp3',
  'places/laboratory.mp3',
  'places/laundry-room.mp3',
  'places/library.mp3',
  'places/night-village.mp3',
  'places/office.mp3',
  'places/restaurant.mp3',
  'places/subway-station.mp3',
  'places/supermarket.mp3',
  'places/temple.mp3',
  'places/underwater.mp3',
  'rain/heavy-rain.mp3',
  'rain/light-rain.mp3',
  'rain/rain-on-car-roof.mp3',
  'rain/rain-on-leaves.mp3',
  'rain/rain-on-tent.mp3',
  'rain/rain-on-umbrella.mp3',
  'rain/rain-on-window.mp3',
  'rain/thunder.mp3',
  'things/boiling-water.mp3',
  'things/bubbles.mp3',
  'things/ceiling-fan.mp3',
  'things/clock.mp3',
  'things/dryer.mp3',
  'things/keyboard.mp3',
  'things/morse-code.mp3',
  'things/paper.mp3',
  'things/singing-bowl.mp3',
  'things/slide-projector.mp3',
  'things/tuning-radio.mp3',
  'things/typewriter.mp3',
  'things/vinyl-effect.mp3',
  'things/washing-machine.mp3',
  'things/wind-chimes.mp3',
  'things/windshield-wipers.mp3',
  'transport/airplane.mp3',
  'transport/inside-a-train.mp3',
  'transport/rowing-boat.mp3',
  'transport/sailboat.mp3',
  'transport/submarine.mp3',
  'transport/train.mp3',
  'urban/ambulance-siren.mp3',
  'urban/busy-street.mp3',
  'urban/crowd.mp3',
  'urban/fireworks.mp3',
  'urban/highway.mp3',
  'urban/road.mp3',
  'urban/traffic.mp3',
]

async function fetchFile(relativePath) {
  const target = join(dest, relativePath)
  if (existsSync(target) && statSync(target).size > 0) {
    return { relativePath, status: 'skip' }
  }
  const response = await fetch(`${CDN}/${relativePath}`)
  if (!response.ok) {
    throw new Error(`${relativePath}: HTTP ${response.status}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, bytes)
  return { relativePath, status: 'write', size: bytes.length }
}

async function run() {
  const queue = [...FILES]
  let downloaded = 0
  let skipped = 0
  let failed = 0

  async function worker() {
    for (;;) {
      const relativePath = queue.shift()
      if (!relativePath) return
      try {
        const result = await fetchFile(relativePath)
        if (result.status === 'skip') {
          skipped += 1
        } else {
          downloaded += 1
          process.stdout.write(`  ↓ ${result.relativePath}\n`)
        }
      } catch (error) {
        failed += 1
        console.error(`  ✗ ${(error).message}`)
      }
    }
  }

  mkdirSync(dest, { recursive: true })
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

  console.log(`[sounds] ${downloaded} downloaded, ${skipped} up to date, ${failed} failed → apps/soundscape/sounds`)
  if (failed > 0) process.exit(1)
}

await run()
