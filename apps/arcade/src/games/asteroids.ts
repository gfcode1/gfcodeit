import type { GameHooks, GameInstance } from '../engine/types'

const VW = 200
const VH = 200
const SHIP_R = 5
const MAX_LIVES = 3
const THRUST = 74
const ROTATION = 3.4
const BULLET_SPEED = 195

interface Rock {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  r: number
  verts: number[]
  spin: number
  angle: number
}

interface Bullet {
  x: number
  y: number
  vx: number
  vy: number
  life: number
}

const RADII = [0, 6, 10, 16]

function makeRock(x: number, y: number, size: number): Rock {
  const r = RADII[size] as number
  const speed = 20 + (4 - size) * 12 + Math.random() * 24
  const angle = Math.random() * Math.PI * 2
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    size,
    r,
    verts: Array.from({ length: 9 }, () => 0.75 + Math.random() * 0.5),
    spin: (Math.random() * 2 - 1) * 1.6,
    angle: Math.random() * Math.PI * 2,
  }
}

export function create(hooks: GameHooks): GameInstance {
  let ship = { x: VW / 2, y: VH / 2, vx: 0, vy: 0, angle: -Math.PI / 2 }
  let rocks: Rock[] = []
  let bullets: Bullet[] = []
  let lives = MAX_LIVES
  let score = 0
  let wave = 1
  let cooldown = 0
  let invulnerable = 1.5
  let dead = false
  let thrusting = false
  let left = false
  let right = false

  const stars = Array.from({ length: 46 }, () => ({
    x: Math.random() * VW,
    y: Math.random() * VH,
    a: 0.2 + Math.random() * 0.6,
  }))

  function spawnWave(): void {
    const count = 3 + wave
    for (let i = 0; i < count; i += 1) {
      let x = Math.random() * VW
      let y = Math.random() * VH
      if (Math.hypot(x - ship.x, y - ship.y) < 60) {
        x = (x + 90) % VW
        y = (y + 90) % VH
      }
      rocks.push(makeRock(x, y, 3))
    }
  }

  function wrap(entity: { x: number; y: number }, margin: number): void {
    if (entity.x < -margin) entity.x = VW + margin
    if (entity.x > VW + margin) entity.x = -margin
    if (entity.y < -margin) entity.y = VH + margin
    if (entity.y > VH + margin) entity.y = -margin
  }

  function fire(): void {
    if (cooldown > 0 || dead) return
    cooldown = 0.22
    bullets.push({
      x: ship.x + Math.cos(ship.angle) * SHIP_R,
      y: ship.y + Math.sin(ship.angle) * SHIP_R,
      vx: ship.vx + Math.cos(ship.angle) * BULLET_SPEED,
      vy: ship.vy + Math.sin(ship.angle) * BULLET_SPEED,
      life: 1.1,
    })
    hooks.audio.blip()
  }

  function hitShip(): void {
    if (invulnerable > 0 || dead) return
    lives -= 1
    hooks.audio.hit()
    ship = { x: VW / 2, y: VH / 2, vx: 0, vy: 0, angle: -Math.PI / 2 }
    invulnerable = 1.6
    bullets = []
    if (lives <= 0) {
      dead = true
      hooks.audio.gameOver()
      hooks.gameOver(score)
    }
  }

  spawnWave()

  return {
    update(dt) {
      if (dead) return
      if (cooldown > 0) cooldown -= dt
      if (invulnerable > 0) invulnerable -= dt

      if (left) ship.angle -= ROTATION * dt
      if (right) ship.angle += ROTATION * dt
      if (thrusting) {
        ship.vx += Math.cos(ship.angle) * THRUST * dt
        ship.vy += Math.sin(ship.angle) * THRUST * dt
      }
      const drag = 1 - 0.7 * dt
      ship.vx *= drag
      ship.vy *= drag
      const speed = Math.hypot(ship.vx, ship.vy)
      if (speed > 140) {
        ship.vx = (ship.vx / speed) * 140
        ship.vy = (ship.vy / speed) * 140
      }
      ship.x += ship.vx * dt
      ship.y += ship.vy * dt
      wrap(ship, SHIP_R)

      for (const bullet of bullets) {
        bullet.x += bullet.vx * dt
        bullet.y += bullet.vy * dt
        bullet.life -= dt
        wrap(bullet, 2)
      }
      bullets = bullets.filter((bullet) => bullet.life > 0)

      for (const rock of rocks) {
        rock.x += rock.vx * dt
        rock.y += rock.vy * dt
        rock.angle += rock.spin * dt
        wrap(rock, rock.r)
      }

      for (let b = bullets.length - 1; b >= 0; b -= 1) {
        const bullet = bullets[b] as Bullet
        let consumed = false
        for (let r = rocks.length - 1; r >= 0; r -= 1) {
          const rock = rocks[r] as Rock
          if (Math.hypot(rock.x - bullet.x, rock.y - bullet.y) < rock.r) {
            rocks.splice(r, 1)
            bullets.splice(b, 1)
            consumed = true
            score += rock.size === 3 ? 20 : rock.size === 2 ? 50 : 100
            hooks.setScore(score)
            hooks.audio.break_()
            if (rock.size > 1) {
              for (let i = 0; i < 2; i += 1) rocks.push(makeRock(rock.x, rock.y, rock.size - 1))
            }
            break
          }
        }
        if (consumed) continue
      }

      if (invulnerable <= 0) {
        for (const rock of rocks) {
          if (Math.hypot(rock.x - ship.x, rock.y - ship.y) < rock.r + SHIP_R) {
            hitShip()
            break
          }
        }
      }

      if (rocks.length === 0 && !dead) {
        wave += 1
        hooks.audio.powerUp()
        spawnWave()
      }
    },
    onKey(action, down) {
      if (action === 'left') left = down
      else if (action === 'right') right = down
      else if (action === 'up') thrusting = down
      else if ((action === 'a' || action === 'b') && down) fire()
    },
    render(ctx, width, height) {
      const scale = Math.min(width / VW, height / VH)
      ctx.save()
      ctx.translate((width - VW * scale) / 2, (height - VH * scale) / 2)
      ctx.scale(scale, scale)

      ctx.fillStyle = '#07080d'
      ctx.fillRect(0, 0, VW, VH)

      for (const star of stars) {
        ctx.fillStyle = `rgba(255,255,255,${star.a})`
        ctx.fillRect(star.x, star.y, 1, 1)
      }

      ctx.strokeStyle = '#ced4da'
      ctx.lineWidth = 1.2
      for (const rock of rocks) {
        ctx.save()
        ctx.translate(rock.x, rock.y)
        ctx.rotate(rock.angle)
        ctx.beginPath()
        rock.verts.forEach((factor, index) => {
          const a = (index / rock.verts.length) * Math.PI * 2
          const px = Math.cos(a) * rock.r * factor
          const py = Math.sin(a) * rock.r * factor
          if (index === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        })
        ctx.closePath()
        ctx.stroke()
        ctx.restore()
      }

      ctx.fillStyle = '#ffe066'
      for (const bullet of bullets) {
        ctx.beginPath()
        ctx.arc(bullet.x, bullet.y, 1.6, 0, Math.PI * 2)
        ctx.fill()
      }

      if (!dead && (invulnerable <= 0 || Math.floor(invulnerable * 12) % 2 === 0)) {
        ctx.save()
        ctx.translate(ship.x, ship.y)
        ctx.rotate(ship.angle)
        if (thrusting) {
          ctx.fillStyle = 'rgba(255,146,43,0.85)'
          ctx.beginPath()
          ctx.moveTo(-SHIP_R - 6, -2)
          ctx.lineTo(-SHIP_R, 0)
          ctx.lineTo(-SHIP_R - 6, 2)
          ctx.closePath()
          ctx.fill()
        }
        ctx.fillStyle = '#f1f3f5'
        ctx.beginPath()
        ctx.moveTo(SHIP_R + 3, 0)
        ctx.lineTo(-SHIP_R, -SHIP_R * 0.8)
        ctx.lineTo(-SHIP_R * 0.5, 0)
        ctx.lineTo(-SHIP_R, SHIP_R * 0.8)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }

      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.font = '10px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`WAVE ${wave}`, 8, 15)
      ctx.textAlign = 'right'
      ctx.fillText('❤'.repeat(Math.max(0, lives)), VW - 8, 15)
      ctx.restore()
    },
  }
}
