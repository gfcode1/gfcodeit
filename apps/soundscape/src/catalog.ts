/**
 * Sound catalog mirrored from remvze/moodist (github.com/remvze/moodist).
 * Moodist code is MIT; the audio files are third-party (Pixabay Content
 * License / CC0). See apps/soundscape/README.md.
 */

export interface SoundDef {
  id: string
  label: string
  /** Path relative to apps/soundscape/sounds/, e.g. "rain/light-rain.mp3". */
  file: string
  /** Resolved, Vite-hashed asset URL. */
  url: string
}

export interface Category {
  id: string
  title: string
  /** OpenMoji hexcode. */
  icon: string
  sounds: SoundDef[]
}

const SOUND_URLS = import.meta.glob('../sounds/**/*.{mp3,wav}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

function resolveUrl(file: string): string {
  const suffix = `sounds/${file}`
  for (const [key, url] of Object.entries(SOUND_URLS)) {
    if (key.endsWith(suffix)) return url
  }
  throw new Error(`Soundscape: missing audio file "${file}" (run pnpm sounds:sync)`)
}

interface RawSound {
  id: string
  label: string
  file: string
}

interface RawCategory {
  id: string
  title: string
  icon: string
  sounds: RawSound[]
}

const RAW: RawCategory[] = [
  {
    id: 'nature',
    title: 'Nature',
    icon: '1F332',
    sounds: [
      { id: 'river', label: 'River', file: 'nature/river.mp3' },
      { id: 'waves', label: 'Waves', file: 'nature/waves.mp3' },
      { id: 'campfire', label: 'Campfire', file: 'nature/campfire.mp3' },
      { id: 'wind', label: 'Wind', file: 'nature/wind.mp3' },
      { id: 'howling-wind', label: 'Howling Wind', file: 'nature/howling-wind.mp3' },
      { id: 'wind-in-trees', label: 'Wind in Trees', file: 'nature/wind-in-trees.mp3' },
      { id: 'waterfall', label: 'Waterfall', file: 'nature/waterfall.mp3' },
      { id: 'walk-in-snow', label: 'Walk in Snow', file: 'nature/walk-in-snow.mp3' },
      { id: 'walk-on-leaves', label: 'Walk on Leaves', file: 'nature/walk-on-leaves.mp3' },
      { id: 'walk-on-gravel', label: 'Walk on Gravel', file: 'nature/walk-on-gravel.mp3' },
      { id: 'droplets', label: 'Droplets', file: 'nature/droplets.mp3' },
      { id: 'jungle', label: 'Jungle', file: 'nature/jungle.mp3' },
    ],
  },
  {
    id: 'rain',
    title: 'Rain',
    icon: '1F327',
    sounds: [
      { id: 'light-rain', label: 'Light Rain', file: 'rain/light-rain.mp3' },
      { id: 'heavy-rain', label: 'Heavy Rain', file: 'rain/heavy-rain.mp3' },
      { id: 'thunder', label: 'Thunder', file: 'rain/thunder.mp3' },
      { id: 'rain-on-window', label: 'Rain on Window', file: 'rain/rain-on-window.mp3' },
      { id: 'rain-on-car-roof', label: 'Rain on Car Roof', file: 'rain/rain-on-car-roof.mp3' },
      { id: 'rain-on-umbrella', label: 'Rain on Umbrella', file: 'rain/rain-on-umbrella.mp3' },
      { id: 'rain-on-tent', label: 'Rain on Tent', file: 'rain/rain-on-tent.mp3' },
      { id: 'rain-on-leaves', label: 'Rain on Leaves', file: 'rain/rain-on-leaves.mp3' },
    ],
  },
  {
    id: 'animals',
    title: 'Animals',
    icon: '1F43E',
    sounds: [
      { id: 'birds', label: 'Birds', file: 'animals/birds.mp3' },
      { id: 'seagulls', label: 'Seagulls', file: 'animals/seagulls.mp3' },
      { id: 'crickets', label: 'Crickets', file: 'animals/crickets.mp3' },
      { id: 'wolf', label: 'Wolf', file: 'animals/wolf.mp3' },
      { id: 'owl', label: 'Owl', file: 'animals/owl.mp3' },
      { id: 'frog', label: 'Frog', file: 'animals/frog.mp3' },
      { id: 'dog-barking', label: 'Dog Barking', file: 'animals/dog-barking.mp3' },
      { id: 'horse-gallop', label: 'Horse Gallop', file: 'animals/horse-gallop.mp3' },
      { id: 'cat-purring', label: 'Cat Purring', file: 'animals/cat-purring.mp3' },
      { id: 'crows', label: 'Crows', file: 'animals/crows.mp3' },
      { id: 'whale', label: 'Whale', file: 'animals/whale.mp3' },
      { id: 'beehive', label: 'Beehive', file: 'animals/beehive.mp3' },
      { id: 'woodpecker', label: 'Woodpecker', file: 'animals/woodpecker.mp3' },
      { id: 'chickens', label: 'Chickens', file: 'animals/chickens.mp3' },
      { id: 'cows', label: 'Cows', file: 'animals/cows.mp3' },
      { id: 'sheep', label: 'Sheep', file: 'animals/sheep.mp3' },
    ],
  },
  {
    id: 'urban',
    title: 'Urban',
    icon: '1F3D9',
    sounds: [
      { id: 'highway', label: 'Highway', file: 'urban/highway.mp3' },
      { id: 'road', label: 'Road', file: 'urban/road.mp3' },
      { id: 'ambulance-siren', label: 'Ambulance Siren', file: 'urban/ambulance-siren.mp3' },
      { id: 'busy-street', label: 'Busy Street', file: 'urban/busy-street.mp3' },
      { id: 'crowd', label: 'Crowd', file: 'urban/crowd.mp3' },
      { id: 'traffic', label: 'Traffic', file: 'urban/traffic.mp3' },
      { id: 'fireworks', label: 'Fireworks', file: 'urban/fireworks.mp3' },
    ],
  },
  {
    id: 'places',
    title: 'Places',
    icon: '1F4CD',
    sounds: [
      { id: 'cafe', label: 'Cafe', file: 'places/cafe.mp3' },
      { id: 'airport', label: 'Airport', file: 'places/airport.mp3' },
      { id: 'church', label: 'Church', file: 'places/church.mp3' },
      { id: 'temple', label: 'Temple', file: 'places/temple.mp3' },
      { id: 'construction-site', label: 'Construction Site', file: 'places/construction-site.mp3' },
      { id: 'underwater', label: 'Underwater', file: 'places/underwater.mp3' },
      { id: 'crowded-bar', label: 'Crowded Bar', file: 'places/crowded-bar.mp3' },
      { id: 'night-village', label: 'Night Village', file: 'places/night-village.mp3' },
      { id: 'subway-station', label: 'Subway Station', file: 'places/subway-station.mp3' },
      { id: 'office', label: 'Office', file: 'places/office.mp3' },
      { id: 'supermarket', label: 'Supermarket', file: 'places/supermarket.mp3' },
      { id: 'carousel', label: 'Carousel', file: 'places/carousel.mp3' },
      { id: 'laboratory', label: 'Laboratory', file: 'places/laboratory.mp3' },
      { id: 'laundry-room', label: 'Laundry Room', file: 'places/laundry-room.mp3' },
      { id: 'restaurant', label: 'Restaurant', file: 'places/restaurant.mp3' },
      { id: 'library', label: 'Library', file: 'places/library.mp3' },
    ],
  },
  {
    id: 'transport',
    title: 'Transport',
    icon: '1F686',
    sounds: [
      { id: 'train', label: 'Train', file: 'transport/train.mp3' },
      { id: 'inside-a-train', label: 'Inside a Train', file: 'transport/inside-a-train.mp3' },
      { id: 'airplane', label: 'Airplane', file: 'transport/airplane.mp3' },
      { id: 'submarine', label: 'Submarine', file: 'transport/submarine.mp3' },
      { id: 'sailboat', label: 'Sailboat', file: 'transport/sailboat.mp3' },
      { id: 'rowing-boat', label: 'Rowing Boat', file: 'transport/rowing-boat.mp3' },
    ],
  },
  {
    id: 'things',
    title: 'Things',
    icon: '1F4E6',
    sounds: [
      { id: 'keyboard', label: 'Keyboard', file: 'things/keyboard.mp3' },
      { id: 'typewriter', label: 'Typewriter', file: 'things/typewriter.mp3' },
      { id: 'paper', label: 'Paper', file: 'things/paper.mp3' },
      { id: 'clock', label: 'Clock', file: 'things/clock.mp3' },
      { id: 'wind-chimes', label: 'Wind Chimes', file: 'things/wind-chimes.mp3' },
      { id: 'singing-bowl', label: 'Singing Bowl', file: 'things/singing-bowl.mp3' },
      { id: 'ceiling-fan', label: 'Ceiling Fan', file: 'things/ceiling-fan.mp3' },
      { id: 'dryer', label: 'Dryer', file: 'things/dryer.mp3' },
      { id: 'slide-projector', label: 'Slide Projector', file: 'things/slide-projector.mp3' },
      { id: 'boiling-water', label: 'Boiling Water', file: 'things/boiling-water.mp3' },
      { id: 'bubbles', label: 'Bubbles', file: 'things/bubbles.mp3' },
      { id: 'tuning-radio', label: 'Tuning Radio', file: 'things/tuning-radio.mp3' },
      { id: 'morse-code', label: 'Morse Code', file: 'things/morse-code.mp3' },
      { id: 'washing-machine', label: 'Washing Machine', file: 'things/washing-machine.mp3' },
      { id: 'vinyl-effect', label: 'Vinyl Effect', file: 'things/vinyl-effect.mp3' },
      { id: 'windshield-wipers', label: 'Windshield Wipers', file: 'things/windshield-wipers.mp3' },
    ],
  },
  {
    id: 'noise',
    title: 'Noise',
    icon: '1F50A',
    sounds: [
      { id: 'white-noise', label: 'White Noise', file: 'noise/white-noise.wav' },
      { id: 'pink-noise', label: 'Pink Noise', file: 'noise/pink-noise.wav' },
      { id: 'brown-noise', label: 'Brown Noise', file: 'noise/brown-noise.wav' },
    ],
  },
  {
    id: 'binaural',
    title: 'Binaural Beats',
    icon: '1F9E0',
    sounds: [
      { id: 'binaural-delta', label: 'Delta', file: 'binaural/binaural-delta.wav' },
      { id: 'binaural-theta', label: 'Theta', file: 'binaural/binaural-theta.wav' },
      { id: 'binaural-alpha', label: 'Alpha', file: 'binaural/binaural-alpha.wav' },
      { id: 'binaural-beta', label: 'Beta', file: 'binaural/binaural-beta.wav' },
      { id: 'binaural-gamma', label: 'Gamma', file: 'binaural/binaural-gamma.wav' },
    ],
  },
  {
    id: 'utilities',
    title: 'Utilities',
    icon: '1F6A8',
    sounds: [
      { id: 'alarm', label: 'Alarm', file: 'alarm.mp3' },
      { id: 'silence', label: 'Silence', file: 'silence.wav' },
    ],
  },
]

export const categories: Category[] = RAW.map((category) => ({
  ...category,
  sounds: category.sounds.map((sound) => ({ ...sound, url: resolveUrl(sound.file) })),
}))

export const allSounds: SoundDef[] = categories.flatMap((category) => category.sounds)

const SOUND_INDEX = new Map(allSounds.map((sound) => [sound.id, sound]))

export function getSound(id: string): SoundDef | undefined {
  return SOUND_INDEX.get(id)
}
