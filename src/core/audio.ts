/**
 * Alarm audio. Browsers block audio until a user gesture, so the shell calls
 * `installAudioUnlock()` at boot; `playAlarm()` is a no-op until the context
 * has been unlocked by the first pointer interaction.
 */

let context: AudioContext | null = null
let unlocked = false
let beepTimer: number | null = null

export function installAudioUnlock(): void {
  if (unlocked) return
  const unlock = (): void => {
    try {
      context = context ?? new AudioContext()
      void context.resume().then(() => {
        unlocked = true
      })
    } catch {
      /* Web Audio unavailable */
    }
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
}

export function playAlarm(): void {
  if (!context || !unlocked) return
  stopAlarm()
  const beep = (): void => {
    if (!context) return
    const now = context.currentTime
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'square'
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.4)
  }
  beep()
  beepTimer = window.setInterval(beep, 800)
}

export function stopAlarm(): void {
  if (beepTimer !== null) {
    window.clearInterval(beepTimer)
    beepTimer = null
  }
}
