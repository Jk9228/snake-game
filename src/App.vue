<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const SIZE = 20

interface Pos { x: number; y: number }

const DIR = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
}

const opposites: Record<string, string> = {
  UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT'
}

const keyToPos: Record<string, Pos> = {
  UP: DIR.UP, DOWN: DIR.DOWN, LEFT: DIR.LEFT, RIGHT: DIR.RIGHT
}

function posToKey(p: Pos): string {
  if (p === DIR.UP) return 'UP'
  if (p === DIR.DOWN) return 'DOWN'
  if (p === DIR.LEFT) return 'LEFT'
  return 'RIGHT'
}

function getFreeSpeed(score: number) { return Math.max(120 - Math.floor(score / 20) * 5, 40) }
function getFreeFoodCount(score: number) { return 1 + Math.floor(score / 30) }
function getFreeObstacleCount(score: number) { return score >= 60 ? 1 + Math.floor((score - 60) / 20) : 0 }

function getSpeedSpeed(score: number) {
  return Math.max(150 - Math.min(score, 10) * 3 - Math.max(0, score - 10) * 5, 20)
}
function getSpeedObstacles(score: number) { return getSpeedSpeed(score) <= 110 }

interface CTFFlag { x: number; y: number; type: 'center' | 'base'; carriedBy: number | null; owner: number }

const CTF_BASES = [
  { x: 0, y: 17, w: 3, h: 3 },
  { x: 17, y: 0, w: 3, h: 3 },
]

function initCTFFlags(): CTFFlag[] {
  return [
    { x: 9, y: 9, type: 'center', carriedBy: null, owner: -1 },
    { x: 10, y: 9, type: 'center', carriedBy: null, owner: -1 },
    { x: 9, y: 10, type: 'center', carriedBy: null, owner: -1 },
    { x: 1, y: 18, type: 'base', carriedBy: null, owner: 0 },
    { x: 18, y: 1, type: 'base', carriedBy: null, owner: 1 },
  ]
}

function isInBase(px: number, py: number, baseIdx: number) {
  const b = CTF_BASES[baseIdx]!
  return px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h
}

interface LBEntry { score: number; timestamp: number; duration: number; speed: number }
function loadLeaderboard(): LBEntry[] {
  try { return JSON.parse(localStorage.getItem('snake_speed_lb') || '[]') }
  catch { return [] }
}
function saveLeaderboard(entry: LBEntry) {
  const lb = loadLeaderboard()
  lb.push(entry)
  lb.sort((a, b) => b.score - a.score)
  if (lb.length > 5) lb.length = 5
  localStorage.setItem('snake_speed_lb', JSON.stringify(lb))
}
function getRank(score: number): number {
  const lb = loadLeaderboard()
  for (let i = 0; i < lb.length; i++) { if (score > lb[i]!.score) return i + 1 }
  return lb.length + 1
}

function encircleCheck(snakeA: Pos[], snakeB: Pos[], headB: Pos): boolean {
  const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }]
  for (const d of dirs) {
    const nx = headB.x + d.x, ny = headB.y + d.y
    if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) continue
    if (snakeA.some(s => s.x === nx && s.y === ny)) continue
    return false
  }
  return true
}

const DIFFICULTIES: Record<string, { label: string; foodCount: number; hasObstacles: boolean }> = {
  easy: { label: '簡單', foodCount: 1, hasObstacles: false },
  normal: { label: '普通', foodCount: 2, hasObstacles: false },
  hard: { label: '困難', foodCount: 3, hasObstacles: false },
  hell: { label: '地獄', foodCount: 3, hasObstacles: true },
}

interface PowerUp { x: number; y: number; type: 'magnet' }

interface Player {
  snake: Pos[]
  foods: Pos[]
  smoothFoods: Pos[]
  dir: Pos
  dirKey: string
  inputQueue: string[]
  dirCooldown: number
  score: number
  gameOver: boolean
  magnetUntil: number
  prevSnake: Pos[]
}

const mode = ref<'single' | 'dual' | 'free' | 'speed' | 'ctf' | 'magnet'>('single')
const difficulty = ref<string>('easy')
const players = ref<Player[]>([])
const obstacles = ref<Pos[]>([])
const powerUps = ref<PowerUp[]>([])
const started = ref(false)
const initSpeed = ref(120)
const magnetPickups = ref(false)
function toggleMagnet() {
  if (mode.value === 'magnet') return
  magnetPickups.value = !magnetPickups.value
}
let visualProgress = 0
let lastTick = 0
let curInt = 120
let rafId = 0
let timer: ReturnType<typeof setTimeout> | null = null

let speedStartTime: number | null = null
let speedMaxSpeed = 150
let speedSaved = false

// CTF state
const ctfFlags = ref<CTFFlag[]>([])
const ctfTarget = ref(5)
const ctfWinner = ref<number | null>(null)
const ctfRespawnTimers = ref<number[]>([-1, -1])
const ctfEncircleCooldown = ref<number[]>([-1, -1])
const scoreAnims = ref<{id:number, text:string, x:number, y:number, pi:number}[]>([])
let animId = 0

function addScoreAnim(text: string, cellX: number, cellY: number, pi: number) {
  const id = ++animId
  scoreAnims.value.push({ id, text, x: cellX * 25, y: cellY * 25, pi })
  setTimeout(() => { scoreAnims.value = scoreAnims.value.filter(a => a.id !== id) }, 900)
}

const leaderboard = computed(() => loadLeaderboard())

const currentSpeed = computed(() => {
  if (mode.value !== 'speed' || !players.value[0]) return 0
  return started.value ? getSpeedSpeed(players.value[0].score) : 150
})

const gameOverRank = computed(() => {
  if (mode.value !== 'speed' || !players.value[0]) return null
  const rank = getRank(players.value[0].score)
  const total = leaderboard.value.length
  return { rank, total }
})

function makePlayer(startX: number, startY: number, dir: Pos): Player {
  const dirKey = posToKey(dir)
  return { snake: [{ x: startX, y: startY }], foods: [], smoothFoods: [], dir, dirKey, inputQueue: [], dirCooldown: 0, score: 0, gameOver: false, magnetUntil: 0, prevSnake: [{ x: startX, y: startY }] }
}

function isOccupied(pl: Player, includePowerUps = false) {
  return (x: number, y: number) => {
    if (pl.snake.some(s => s.x === x && s.y === y)) return true
    if (pl.foods.some(f => f.x === x && f.y === y)) return true
    if (obstacles.value.some(o => o.x === x && o.y === y)) return true
    if (includePowerUps && powerUps.value.some(p => p.x === x && p.y === y)) return true
    if (mode.value === 'ctf') {
      const opp = players.value[1 - players.value.indexOf(pl)]
      if (opp && opp.snake.some(s => s.x === x && s.y === y)) return true
      if (ctfFlags.value.some(f => f.x === x && f.y === y && f.carriedBy === null)) return true
      if (CTF_BASES.some(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h)) return true
    }
    return false
  }
}

function randomFreePos(pl: Player, includePowerUps = false): Pos {
  const occ = isOccupied(pl, includePowerUps)
  let pos: Pos
  do { pos = { x: Math.floor(Math.random() * SIZE), y: Math.floor(Math.random() * SIZE) } }
  while (occ(pos.x, pos.y))
  return pos
}

function spawnFoods(pl: Player) {
  let n: number
  if (mode.value === 'free') n = getFreeFoodCount(pl.score)
  else n = mode.value === 'single' ? DIFFICULTIES[difficulty.value]!.foodCount : 1
  while (pl.foods.length < n) pl.foods.push(randomFreePos(pl, true))
  if (mode.value === 'magnet') pl.smoothFoods = pl.foods.map(f => ({ x: f.x + 0.5, y: f.y + 0.5 }))
}

const powerUpTypes: PowerUp['type'][] = ['magnet']

function spawnPowerUp(pl: Player) {
  if (!magnetPickups.value && mode.value !== 'magnet') return
  if (mode.value === 'magnet') return
  if (Math.random() > 0.2) return
  if (powerUps.value.length >= 3) return
  const pos = randomFreePos(pl, true)
  const type = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)]!
  powerUps.value.push({ x: pos.x, y: pos.y, type })
}

function generateObstacles(pl: Player) {
  obstacles.value = []
  const hellMode = mode.value === 'single' && DIFFICULTIES[difficulty.value]!.hasObstacles
  const speedMode = mode.value === 'speed' && getSpeedObstacles(pl.score)
  if (!hellMode && mode.value !== 'free' && !speedMode) return
  const head = pl.snake[0]!
  const ahead = new Set<string>()
  const perpX = -pl.dir.y, perpY = pl.dir.x
  for (let fwd = 1; fwd <= 3; fwd++)
    for (let lat = -1; lat <= 1; lat++) {
      const ax = head.x + pl.dir.x * fwd + perpX * lat
      const ay = head.y + pl.dir.y * fwd + perpY * lat
      if (ax >= 0 && ax < SIZE && ay >= 0 && ay < SIZE) ahead.add(`${ax},${ay}`)
    }
  const count = mode.value === 'free' ? getFreeObstacleCount(pl.score) : speedMode ? 1 + Math.floor(Math.random() * 2) : 3 + Math.floor(Math.random() * 3)
  for (let i = 0; i < count; i++) {
    let pos: Pos
    do { pos = { x: Math.floor(Math.random() * SIZE), y: Math.floor(Math.random() * SIZE) } }
    while (isOccupied(pl)(pos.x, pos.y) || ahead.has(`${pos.x},${pos.y}`) || obstacles.value.some(o => o.x === pos.x && o.y === pos.y))
    obstacles.value.push(pos)
  }
}

const cells = computed(() => {
  return players.value.map(pl => {
    const result: { cls: string }[] = []
    const foodSet = new Set(pl.foods.map(f => `${f.x},${f.y}`))
    const obstacleSet = new Set(obstacles.value.map(o => `${o.x},${o.y}`))
    const powerUpSet = new Set(powerUps.value.map(p => `${p.x},${p.y}`))
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const key = `${x},${y}`
        let cls = ''
        if (mode.value !== 'magnet' && foodSet.has(key)) cls = 'food'
        else if (obstacleSet.has(key)) cls = 'obstacle'
        else if (powerUpSet.has(key)) cls = 'powerup'
        result.push({ cls })
      }
    }
    return result
  })
})

function eyeStyle(dirKey: string, which: number) {
  const map: Record<string, number[][]> = { RIGHT: [[16, 6], [16, 15]], LEFT: [[4, 6], [4, 15]], UP: [[6, 4], [15, 4]], DOWN: [[6, 16], [15, 16]] }
  const arr = map[dirKey]!
  const pos = arr[which]!
  return `left:${pos[0]! - 2.5}px;top:${pos[1]! - 2.5}px`
}

const ctfCells = computed(() => {
  const result: { cls: string }[] = []
  const flagMap = new Map<string, string>()
  ctfFlags.value.forEach(f => {
    if (f.carriedBy !== null) return
    flagMap.set(`${f.x},${f.y}`, f.type === 'center' ? 'flag' : f.owner === 0 ? 'flag-p0' : 'flag-p1')
  })
  const baseMap = new Map<string, string>()
  CTF_BASES.forEach((b, bi) => {
    for (let dy = 0; dy < b.h; dy++)
      for (let dx = 0; dx < b.w; dx++)
        baseMap.set(`${b.x + dx},${b.y + dy}`, bi === 0 ? 'base-p0' : 'base-p1')
  })
  const obstacleSet = new Set(obstacles.value.map(o => `${o.x},${o.y}`))
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const key = `${x},${y}`
      let cls = ''
      if (flagMap.has(key)) cls = flagMap.get(key)!
      else if (obstacleSet.has(key)) cls = 'obstacle'
      else if (baseMap.has(key)) cls = baseMap.get(key)!
      result.push({ cls })
    }
  }
  return result
})

const segmentStyles = computed(() => {
  return players.value.map(pl => {
    const magnet = pl.magnetUntil > performance.now()
    return pl.snake.map((seg, i) => {
      const src = pl.prevSnake?.[i]
      const style = src
        ? `transform:translate(${src.x * 25}px,${src.y * 25}px)`
        : `transform:translate(${seg.x * 25}px,${seg.y * 25}px)`
      return i === 0
        ? { head: true, style, dirKey: pl.dirKey, magnet }
        : { head: false, style }
    })
  })
})

function reset() {
  if (timer) clearTimeout(timer)
  started.value = false
  obstacles.value = []
  powerUps.value = []
  speedStartTime = null
  speedMaxSpeed = 150
  speedSaved = false
  ctfWinner.value = null
  ctfRespawnTimers.value = [-1, -1]
  ctfEncircleCooldown.value = [-1, -1]
  if (mode.value === 'single' || mode.value === 'free' || mode.value === 'speed' || mode.value === 'magnet') {
    players.value = [makePlayer(10, 10, DIR.RIGHT)]
  } else if (mode.value === 'ctf') {
    players.value = [
      makePlayer(1, 18, DIR.RIGHT),
      makePlayer(18, 1, DIR.LEFT),
    ]
    ctfFlags.value = initCTFFlags()
  } else {
    players.value = [makePlayer(14, 10, DIR.LEFT), makePlayer(5, 10, DIR.RIGHT)]
  }
  players.value.forEach(pl => { pl.gameOver = false; pl.score = 0; if (mode.value !== 'ctf') spawnFoods(pl) })
  if ((mode.value === 'single' && DIFFICULTIES[difficulty.value]!.hasObstacles) || mode.value === 'free') generateObstacles(players.value[0]!)
  if (mode.value === 'speed') generateObstacles(players.value[0]!)
}

function start() {
  started.value = true
  lastTick = performance.now()
  tick()
}

function tick() {
  if (players.value.every(p => p.gameOver)) { started.value = false; return }
  if (mode.value === 'ctf') { tickCTF(); return }
  players.value.forEach(pl => {
    if (pl.gameOver) return
    if (pl.inputQueue.length > 0 && pl.dirCooldown <= 0) {
      const nextKey = pl.inputQueue.shift()!
      pl.dir = keyToPos[nextKey]!
      pl.dirKey = nextKey
      pl.dirCooldown = 0
    } else {
      pl.dirCooldown--
    }
    const head = pl.snake[0]!
    const next: Pos = { x: head.x + pl.dir.x, y: head.y + pl.dir.y }

    if (next.x < 0 || next.x >= SIZE || next.y < 0 || next.y >= SIZE) { pl.gameOver = true; onGameOver(pl); return }
    if (pl.snake.some(s => s.x === next.x && s.y === next.y)) { pl.gameOver = true; onGameOver(pl); return }
    if (obstacles.value.some(o => o.x === next.x && o.y === next.y)) { pl.gameOver = true; onGameOver(pl); return }

    pl.prevSnake = pl.snake.map(s => ({ ...s }))
    pl.snake.unshift(next)
    let ate = false
    if (mode.value === 'magnet') {
      const hc = next.x + 0.5, vc = next.y + 0.5
      for (let fi = pl.smoothFoods.length - 1; fi >= 0; fi--) {
        const sf = pl.smoothFoods[fi]!
        const dx = hc - sf.x, dy = vc - sf.y
        if (Math.sqrt(dx * dx + dy * dy) < 0.6) {
          pl.score++
          pl.smoothFoods.splice(fi, 1)
          pl.foods.pop()
          ate = true
          break
        }
      }
    } else {
      const gi = pl.foods.findIndex(f => f.x === next.x && f.y === next.y)
      if (gi !== -1) {
        pl.score++
        pl.foods.splice(gi, 1)
        spawnPowerUp(pl)
        ate = true
      }
    }
    if (!ate) pl.snake.pop()
  })
  players.value.forEach(pl => {
    if (pl.gameOver) return
    const now = performance.now()
    if (mode.value !== 'magnet') {
      if (pl.magnetUntil > now) {
        const head = pl.snake[0]!
        pl.foods.forEach(f => {
          const dx = head.x - f.x, dy = head.y - f.y
          if (dx === 0 && dy === 0) return
          if (Math.abs(dx) <= 4 && Math.abs(dy) <= 4) {
            const steps = Math.max(Math.abs(dx), Math.abs(dy)) > 2 ? 2 : 1
            const sx = dx === 0 ? 0 : (dx > 0 ? 1 : -1) * Math.min(steps, Math.abs(dx))
            const sy = dy === 0 ? 0 : (dy > 0 ? 1 : -1) * Math.min(steps, Math.abs(dy))
            const nx = f.x + sx, ny = f.y + sy
            if (!pl.snake.some((s, si) => si > 0 && s.x === nx && s.y === ny) &&
                !obstacles.value.some(o => o.x === nx && o.y === ny) &&
                !pl.foods.some(other => other !== f && other.x === nx && other.y === ny)) {
              f.x = nx; f.y = ny
            }
          }
        })
        for (let fi = pl.foods.length - 1; fi >= 0; fi--) {
          if (pl.foods[fi]!.x === head.x && pl.foods[fi]!.y === head.y) {
            pl.score++
            pl.foods.splice(fi, 1)
          }
        }
      } else if (pl.magnetUntil > 0) {
        pl.magnetUntil = 0
      }
    }
    if (mode.value !== 'magnet') {
      const head = pl.snake[0]!
      const pi = powerUps.value.findIndex(p => p.x === head.x && p.y === head.y)
      if (pi !== -1) {
        const pu = powerUps.value[pi]!
        if (pu.type === 'magnet') pl.magnetUntil = now + 5000
        powerUps.value.splice(pi, 1)
      }
    }
  })
  players.value.forEach(pl => {
    if (pl.gameOver) return
    if (pl.foods.length > 0) return
    if ((mode.value === 'single' && DIFFICULTIES[difficulty.value]!.hasObstacles) || mode.value === 'free' || mode.value === 'speed') generateObstacles(pl)
    spawnFoods(pl)
  })
  lastTick = performance.now()
  if (mode.value === 'free') curInt = getFreeSpeed(players.value[0]!.score)
  else if (mode.value === 'speed') { curInt = getSpeedSpeed(players.value[0]!.score); speedMaxSpeed = Math.min(speedMaxSpeed, curInt) }
  else curInt = initSpeed.value
  timer = setTimeout(tick, curInt)
}

function ctfScatterFlags(pi: number) {
  ctfFlags.value.forEach(f => {
    if (f.carriedBy !== pi) return
    f.carriedBy = null
    const pos = randomFreePos(players.value[0]!)
    f.x = pos.x; f.y = pos.y
  })
}

function tickCTF() {
  // Process input queues for both players
  players.value.forEach(pl => {
    if (pl.gameOver) return
    if (pl.inputQueue.length > 0 && pl.dirCooldown <= 0) {
      const nextKey = pl.inputQueue.shift()!
      pl.dir = keyToPos[nextKey]!
      pl.dirKey = nextKey
      pl.dirCooldown = 0
    } else {
      pl.dirCooldown--
    }
  })

  const moves = players.value.map(pl => {
    if (pl.gameOver) return null
    const head = pl.snake[0]!
    return { x: head.x + pl.dir.x, y: head.y + pl.dir.y }
  })

  players.value.forEach((pl, i) => {
    if (pl.gameOver) return
    const next = moves[i]!
    if (next.x < 0 || next.x >= SIZE || next.y < 0 || next.y >= SIZE) { pl.gameOver = true; ctfScatterFlags(i); return }
    if (obstacles.value.some(o => o.x === next.x && o.y === next.y)) { pl.gameOver = true; ctfScatterFlags(i); return }
    if (pl.snake.some(s => s.x === next.x && s.y === next.y)) { pl.gameOver = true; ctfScatterFlags(i); return }
    const opp = players.value[1 - i]!
    if (!opp.gameOver && opp.snake.some(s => s.x === next.x && s.y === next.y)) { pl.gameOver = true; ctfScatterFlags(i); return }
  })

  if (!players.value[0]!.gameOver && !players.value[1]!.gameOver) {
    const n0 = moves[0]!, n1 = moves[1]!
    const h0 = players.value[0]!.snake[0]!, h1 = players.value[1]!.snake[0]!
    if ((n0.x === n1.x && n0.y === n1.y) || (n0.x === h1.x && n0.y === h1.y && n1.x === h0.x && n1.y === h0.y)) {
      players.value[0]!.gameOver = true; ctfScatterFlags(0)
      players.value[1]!.gameOver = true; ctfScatterFlags(1)
    }
  }

  players.value.forEach((pl, i) => {
    if (pl.gameOver) return
    const next = moves[i]!
    pl.prevSnake = pl.snake.map(s => ({ ...s }))
    pl.snake.unshift(next)

    ctfFlags.value.forEach(f => {
      if (f.carriedBy !== null) return
      if (f.x === next.x && f.y === next.y) {
        if (f.type === 'base' && f.owner === i && isInBase(f.x, f.y, f.owner)) return
        f.carriedBy = i
      }
    })

    if (isInBase(next.x, next.y, i)) {
      let total = 0
      ctfFlags.value.forEach(f => {
        if (f.carriedBy !== i) return
        if (f.type === 'center') { total++; f.carriedBy = null; const p = randomFreePos(players.value[0]!); f.x = p.x; f.y = p.y }
        else { total += f.owner !== i ? 3 : 1; f.carriedBy = null; const base = CTF_BASES[f.owner]!; f.x = base.x + 1; f.y = base.y + 1 }
      })
      if (total) { pl.score += total; addScoreAnim('+'+total, next.x, next.y, i) }
    }
    pl.snake.pop()
  })

  players.value.forEach((pl, i) => {
    if (pl.gameOver) return
    const opp = players.value[1 - i]!
    if (opp.gameOver) return
    if (ctfEncircleCooldown.value[i]! > 0) { ctfEncircleCooldown.value[i]!--; return }
    if (encircleCheck(pl.snake, opp.snake, opp.snake[0]!)) { pl.score++; ctfEncircleCooldown.value[i] = 10 }
  })

  players.value.forEach((pl, i) => {
    if (pl.gameOver && ctfRespawnTimers.value[i] === 0) {
      const base = CTF_BASES[i]!
      pl.snake = [{ x: base.x + 1, y: base.y + 1 }]
      pl.dir = i === 0 ? DIR.RIGHT : DIR.LEFT
      pl.dirKey = i === 0 ? 'LEFT' : 'RIGHT'
      pl.gameOver = false
      ctfRespawnTimers.value[i] = -1
    }
    if (pl.gameOver && ctfRespawnTimers.value[i] === -1) ctfRespawnTimers.value[i] = 3
    if (ctfRespawnTimers.value[i]! > 0) ctfRespawnTimers.value[i]!--
  })

  players.value.forEach((pl, i) => {
    if (ctfWinner.value !== null) return
    if (pl.score >= ctfTarget.value) {
      ctfWinner.value = i; started.value = false
    }
  })

  lastTick = performance.now(); curInt = initSpeed.value
  if (!started.value) return
  timer = setTimeout(tickCTF, curInt)
}

function onGameOver(pl: Player) {
  if (mode.value !== 'speed' || speedSaved) return
  speedSaved = true
  const duration = speedStartTime ? Math.floor((performance.now() - speedStartTime) / 1000) : 0
  saveLeaderboard({ score: pl.score, timestamp: Date.now(), duration, speed: speedMaxSpeed })
}

function switchMode(m: 'single' | 'dual' | 'free' | 'speed' | 'ctf' | 'magnet') {
  if (timer) clearTimeout(timer)
  mode.value = m
  if (m === 'single' || m === 'free' || m === 'speed' || m === 'magnet') {
    players.value = [makePlayer(10, 10, DIR.RIGHT)]
  } else if (m === 'ctf') {
    players.value = [
      makePlayer(1, 18, DIR.RIGHT),
      makePlayer(18, 1, DIR.LEFT),
    ]
  } else {
    players.value = [makePlayer(14, 10, DIR.LEFT), makePlayer(5, 10, DIR.RIGHT)]
  }
  reset()
}

function onKey(e: KeyboardEvent) {
  if (e.key === ' ') {
    e.preventDefault()
    if (started.value || players.value.some(p => p.gameOver) || ctfWinner.value !== null) { reset(); return }
    speedStartTime = performance.now()
    start()
    return
  }

  if (!started.value) return

  function queueDir(pl: Player, newDir: string) {
    if (pl.inputQueue.length >= 2) return
    const last = pl.inputQueue.length > 0 ? pl.inputQueue[pl.inputQueue.length - 1]! : pl.dirKey
    if (newDir === last || newDir === opposites[last]) return
    pl.inputQueue.push(newDir)
  }

  if (mode.value === 'single' || mode.value === 'free' || mode.value === 'speed' || mode.value === 'magnet') {
    if (e.key.startsWith('Arrow')) { e.preventDefault(); queueDir(players.value[0]!, e.key.slice(5).toUpperCase()) }
  } else {
    if (e.key.startsWith('Arrow')) { e.preventDefault(); if (!players.value[0]!.gameOver) queueDir(players.value[0]!, e.key.slice(5).toUpperCase()) }
    const wasd: Record<string, string> = { W: 'UP', A: 'LEFT', S: 'DOWN', D: 'RIGHT' }
    if (e.code.startsWith('Key')) { e.preventDefault(); const dir = wasd[e.code.slice(3)]; if (dir && players.value[1] && !players.value[1].gameOver) queueDir(players.value[1], dir) }
  }
}

function updateSegmentPositions() {
  const containers = document.querySelectorAll<HTMLElement>('.snake-container')
  players.value.forEach((pl, pi) => {
    if (pl.gameOver) return
    const container = containers[mode.value === 'dual' ? 1 - pi : pi]
    if (!container) return
    const segs = container.querySelectorAll<HTMLElement>('.snake-seg')
    pl.snake.forEach((seg, i) => {
      const prev = pl.prevSnake?.[i]
      const el = segs[i]
      if (el) {
        if (prev) {
          const px = Math.max(0, Math.min(SIZE - 1, prev.x + (seg.x - prev.x) * visualProgress))
          const py = Math.max(0, Math.min(SIZE - 1, prev.y + (seg.y - prev.y) * visualProgress))
          el.style.transform = `translate(${px * 25}px, ${py * 25}px)`
        } else {
          el.style.transform = `translate(${seg.x * 25}px, ${seg.y * 25}px)`
        }
      }
    })
    if (mode.value === 'magnet') {
      const foods = container.querySelectorAll<HTMLElement>('.magnet-food')
      pl.smoothFoods.forEach((f, i) => {
        const el = foods[i]
        if (el) el.style.transform = `translate(${f.x * 25 - 12.5}px, ${f.y * 25 - 12.5}px)`
      })
    }
  })
}

function rafLoop(time: number) {
  if (started.value && lastTick > 0) {
    visualProgress = Math.min((time - lastTick) / curInt, 1)
    if (mode.value === 'magnet') {
      players.value.forEach(pl => {
        if (pl.gameOver) return
        const head = pl.snake[0]!
        const hc = head.x + 0.5, vc = head.y + 0.5
        pl.smoothFoods.forEach(f => {
          const dx = hc - f.x, dy = vc - f.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist > 0.01) {
            const speed = Math.max(dist * 0.08, 0.2)
            const nx = f.x + (dx / dist) * speed
            const ny = f.y + (dy / dist) * speed
            f.x = Math.max(0, Math.min(SIZE, nx))
            f.y = Math.max(0, Math.min(SIZE, ny))
          }
        })
      })
    }
    updateSegmentPositions()
  }
  rafId = requestAnimationFrame(rafLoop)
}

onMounted(() => {
  reset()
  rafId = requestAnimationFrame(rafLoop)
  window.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  if (timer) clearTimeout(timer)
  cancelAnimationFrame(rafId)
})
</script>

<template>
  <div class="game-container">
    <div class="toggle-box" :class="{ active: magnetPickups || mode === 'magnet', disabled: mode === 'magnet' }" @click="toggleMagnet">
      <span class="toggle-text">🧲</span>
    </div>
    <div class="boards">
      <template v-if="mode === 'ctf'">
        <div class="board-wrapper">
          <div class="board">
            <div v-for="(cell, i) in ctfCells" :key="i" class="cell" :class="cell.cls" />
          </div>
          <div v-for="pi in [0,1]" :key="pi" class="snake-container" :style="{ zIndex: pi === 0 ? 2 : 1 }">
            <div
              v-for="(seg, i) in segmentStyles[pi]"
              :key="i"
              :class="['snake-seg', 'p'+pi, { head: seg.head, 'magnet-active': seg.magnet, 'flag-carried': ctfFlags.some(f => f.carriedBy === pi) && i === 0 }]"
              :style="seg.style"
            ><template v-if="seg.head"><div class="eye" :style="eyeStyle(seg.dirKey!, 0)" /><div class="eye" :style="eyeStyle(seg.dirKey!, 1)" /></template></div>
          </div>
          <div
            v-for="a in scoreAnims"
            :key="a.id"
            class="score-popup"
            :class="'p'+a.pi"
            :style="{ left: a.x + 'px', top: a.y + 'px' }"
          >{{ a.text }}</div>
        </div>
      </template>
      <template v-else v-for="(_, bi) in players" :key="bi">
        <div v-if="mode === 'dual'" class="player-panel">
          <div class="player-label">
            {{ bi === 0 ? 'P2' : 'P1' }}
            <kbd v-if="bi === 0">W A S D</kbd>
            <kbd v-else>&uarr;&darr;&larr;&rarr;</kbd>
          </div>
          <div class="board-wrapper">
            <div class="board">
              <div v-for="(cell, i) in cells[bi === 0 ? 1 : 0]" :key="i" class="cell" :class="cell.cls" />
            </div>
            <div class="snake-container">
              <div
                v-for="(seg, i) in segmentStyles[bi === 0 ? 1 : 0]"
                :key="i"
              :class="['snake-seg', 'p'+(bi === 0 ? 1 : 0), { head: seg.head, 'magnet-active': seg.magnet }]"
              :style="seg.style"
            ><template v-if="seg.head"><div class="eye" :style="eyeStyle(seg.dirKey!, 0)" /><div class="eye" :style="eyeStyle(seg.dirKey!, 1)" /></template></div>
          </div>
          </div>
        </div>
        <div v-else class="board-wrapper">
          <div class="board">
            <div v-for="(cell, i) in cells[bi]" :key="i" class="cell" :class="cell.cls" />
          </div>
          <div class="snake-container">
            <div
              v-for="(seg, i) in segmentStyles[bi]"
              :key="i"
              :class="['snake-seg', 'p'+bi, { head: seg.head, 'magnet-active': seg.magnet }]"
              :style="seg.style"
            ><template v-if="seg.head"><div class="eye" :style="eyeStyle(seg.dirKey!, 0)" /><div class="eye" :style="eyeStyle(seg.dirKey!, 1)" /></template></div>
            <div v-if="mode === 'magnet'" v-for="(f, i) in players[bi]?.smoothFoods ?? []" :key="'mf'+i" class="magnet-food" />
          </div>
        </div>
      </template>
    </div>
    <div class="sidebar">
      <h1>SNAKE</h1>
      <div class="mode-select">
        <p class="label">MODE</p>
        <select v-model="mode" @change="switchMode(mode)">
          <option value="single">單人</option>
          <option value="dual">雙人</option>
          <option value="free">自由</option>
          <option value="speed">速度遞增</option>
          <option value="ctf">奪旗戰</option>
          <option value="magnet">磁鐵</option>
        </select>
        <div class="ctf-target" v-if="mode === 'ctf'">
          <p class="label">目標分數</p>
          <input type="number" v-model.number="ctfTarget" min="1" />
        </div>
        <div class="speed-input" v-if="mode !== 'free' && mode !== 'speed'">
          <p class="label">初始速度 (ms)</p>
          <input type="number" v-model.number="initSpeed" min="20" max="500" />
        </div>
      </div>
      <div class="difficulty" v-if="mode === 'single'">
        <p class="label">DIFFICULTY</p>
        <div class="diff-btns">
          <button
            v-for="(cfg, key) in DIFFICULTIES"
            :key="key"
            class="diff-btn"
            :class="{ active: difficulty === key }"
            @click="difficulty = key; reset()"
          >{{ cfg.label }}</button>
        </div>
      </div>
      <div class="score-box">
        <template v-if="mode === 'single' || mode === 'free' || mode === 'magnet'">
          <p class="label">SCORE</p>
          <p class="value">{{ players[0]?.score ?? 0 }}</p>
        </template>
        <template v-else-if="mode === 'speed'">
          <div class="score-row">
            <div class="score-item">
              <p class="label">SCORE</p>
              <p class="value">{{ players[0]?.score ?? 0 }}</p>
            </div>
            <div class="score-item">
              <p class="label">SPEED</p>
              <p class="value" style="font-size:22px">{{ currentSpeed }}ms</p>
            </div>
          </div>
        </template>
        <template v-else-if="mode === 'ctf'">
          <div class="score-row">
            <div class="score-item">
              <p class="label">P2 🏴{{ ctfFlags.filter(f => f.carriedBy === 1).length }}</p>
              <p class="value">{{ players[1]?.score ?? 0 }}</p>
            </div>
            <div class="score-item">
              <p class="label">目標</p>
              <p class="value" style="font-size:22px">{{ ctfTarget }}</p>
            </div>
            <div class="score-item">
              <p class="label">P1 🏴{{ ctfFlags.filter(f => f.carriedBy === 0).length }}</p>
              <p class="value">{{ players[0]?.score ?? 0 }}</p>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="score-row">
            <div class="score-item">
              <p class="label">P2</p>
              <p class="value">{{ players[1]?.score ?? 0 }}</p>
            </div>
            <div class="score-item">
              <p class="label">P1</p>
              <p class="value">{{ players[0]?.score ?? 0 }}</p>
            </div>
          </div>
        </template>
      </div>
      <div class="info">
        <p v-if="!started && players.every(p => !p.gameOver)">Press <kbd>Space</kbd> to start</p>
        <template v-if="players.some(p => p.gameOver)">
          <p class="game-over" v-if="mode !== 'ctf'">GAME OVER</p>
          <p class="game-over" v-if="mode === 'ctf' && ctfWinner !== null" style="font-size:24px">P{{ ctfWinner + 1 }} 獲勝!</p>
          <p class="game-over" v-else-if="mode === 'ctf'">GAME OVER</p>
          <p v-if="mode === 'speed' && gameOverRank" style="font-size:13px;color:#e94560">
            得分 {{ players[0]?.score }} | 最快 {{ speedMaxSpeed }}ms | 排名 #{{ gameOverRank.rank }}/{{ gameOverRank.total }}
          </p>
          <p v-else-if="mode === 'ctf'" style="font-size:13px;color:#aabbcc">
            P1: {{ players[0]?.score }} | P2: {{ players[1]?.score }}
          </p>
          <p>Press <kbd>Space</kbd> to restart</p>
        </template>
      </div>
      <div class="controls">
        <p class="label">CONTROLS</p>
        <p class="arrow-keys" v-if="mode === 'single' || mode === 'free' || mode === 'speed' || mode === 'magnet'"><kbd>&uarr;&darr;&larr;&rarr;</kbd></p>
        <p class="arrow-keys" v-else><kbd>&uarr;&darr;&larr;&rarr;</kbd> <kbd>W A S D</kbd></p>
      </div>
      <div v-if="mode === 'speed'" class="leaderboard">
        <p class="label">LEADERBOARD</p>
        <div v-if="leaderboard.length === 0" class="lb-empty">尚無記錄</div>
        <div v-for="(e, i) in leaderboard" :key="i" class="lb-entry">
          <span class="lb-rank">#{{ i + 1 }}</span>
          <span class="lb-score">{{ e.score }} 分</span>
          <span style="font-size:10px;color:#667788">{{ e.speed }}ms</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
*{margin:0;padding:0;box-sizing:border-box}
body{display:flex;justify-content:center;align-items:center;min-height:100vh;background:#1a1a2e;font-family:'Segoe UI',system-ui,sans-serif}
#app{display:flex;justify-content:center;align-items:center;min-height:100vh}
.game-container{display:flex;align-items:flex-start;gap:36px;padding:24px;background:#16213e;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.4)}
.boards{display:flex;gap:24px}
.board-wrapper{position:relative;border:3px solid #0f3460;border-radius:8px;overflow:hidden;background:#0a0a23}
.board{display:grid;grid-template-columns:repeat(20,25px);grid-template-rows:repeat(20,25px)}
.cell{width:25px;height:25px;box-shadow:inset 0 0 0 1px #1a1a3e}
.cell.food{background:#f87171;box-shadow:none;border-radius:50%;animation:pulse .8s ease-in-out infinite alternate}
.magnet-food{position:absolute;width:25px;height:25px;border-radius:50%;background:#f87171;box-shadow:0 0 12px #f87171;z-index:5;animation:pulse .8s ease-in-out infinite alternate}
.cell.obstacle{background:#5b21b6;box-shadow:none;border-radius:2px}
.snake-container{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none}
.snake-seg{position:absolute;width:27px;height:27px;border-radius:50%}
.snake-seg.p0{background:#4ade80}
.snake-seg.p0.head{background:#22c55e;z-index:2}
.snake-seg.p1{background:#fb923c}
.snake-seg.p1.head{background:#f97316;z-index:2}
.snake-seg.head .eye{position:absolute;width:5px;height:5px;background:#fff;border-radius:50%}
.snake-seg.head .eye::after{content:'';position:absolute;width:2.5px;height:2.5px;background:#111;border-radius:50%;top:50%;left:50%;transform:translate(-50%,-50%)}
@keyframes pulse{from{transform:scale(.8)}to{transform:scale(1)}}
.player-panel{display:flex;flex-direction:column;align-items:center;gap:8px}
.player-label{font-size:13px;font-weight:700;color:#e94560;letter-spacing:2px}
.player-label kbd{font-size:11px;letter-spacing:0}
.sidebar{display:flex;flex-direction:column;gap:12px;min-width:160px}
h1{font-size:28px;font-weight:800;letter-spacing:6px;color:#e94560;text-align:center;text-shadow:0 0 20px rgba(233,69,96,.3)}
.score-box{background:#0f3460;border:2px solid #1a1a4e;border-radius:12px;padding:10px 20px;text-align:center}
.score-row{display:flex;gap:12px;justify-content:center}
.score-item{text-align:center;min-width:60px}
.score-item .label{font-size:10px}
.score-item .value{font-size:28px}
.label{font-size:11px;font-weight:600;letter-spacing:3px;color:#8899aa;margin-bottom:2px}
.value{font-size:36px;font-weight:700;color:#e94560;line-height:1}
.info{text-align:center;font-size:13px;color:#aabbcc;padding:10px;background:#0f3460;border-radius:12px;border:2px solid #1a1a4e}
.game-over{font-size:18px;font-weight:700;color:#f87171;margin-bottom:4px}
kbd{display:inline-block;padding:2px 7px;font-size:13px;font-family:inherit;background:#1a1a4e;border:1px solid #334466;border-radius:5px;color:#ccddee;margin:0 1px}
.controls{text-align:center;padding:10px;background:#0f3460;border-radius:12px;border:2px solid #1a1a4e}
.arrow-keys{font-size:18px;line-height:1.6;color:#ccddee}
.mode-select{text-align:center;padding:10px;background:#0f3460;border-radius:12px;border:2px solid #1a1a4e}
.mode-select select{width:100%;margin-top:6px;padding:6px 10px;font-size:14px;font-weight:600;font-family:inherit;background:#1a1a4e;border:2px solid #334466;border-radius:6px;color:#ccddee;cursor:pointer;outline:none}
.mode-select select:hover{border-color:#e94560}
.mode-select select:focus{border-color:#e94560}
.ctf-target{margin-top:8px}
.ctf-target input,.speed-input input{width:60px;padding:4px 8px;font-size:14px;font-weight:600;font-family:inherit;text-align:center;background:#1a1a4e;border:2px solid #334466;border-radius:6px;color:#e94560;outline:none}
.ctf-target input:focus,.speed-input input:focus{border-color:#e94560}
.speed-input{margin-top:8px}
.diff-btns{display:flex;gap:6px;justify-content:center;margin-top:6px}
.diff-btn{padding:5px 12px;font-size:12px;font-weight:600;font-family:inherit;background:#1a1a4e;border:2px solid #334466;border-radius:6px;color:#8899aa;cursor:pointer;transition:all .15s}
.diff-btn:hover{border-color:#e94560;color:#ccddee}
.diff-btn.active{border-color:#e94560;background:#e94560;color:#fff}
.difficulty{text-align:center;padding:10px;background:#0f3460;border-radius:12px;border:2px solid #1a1a4e}
.cell.powerup{background:#60a5fa;box-shadow:none;border-radius:3px;animation:pulse .6s ease-in-out infinite alternate}
.snake-seg.magnet-active{box-shadow:0 0 14px #60a5fa, inset 0 0 7px #60a5fa}
.toggle-box{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px 10px;background:#0f3460;border-radius:12px;border:2px solid #1a1a4e;cursor:pointer;transition:all .2s;user-select:none;writing-mode:vertical-lr}
.toggle-box:hover{border-color:#60a5fa}
.toggle-box.active{border-color:#60a5fa;background:#1e3a5f}
.toggle-box.disabled{opacity:.4;cursor:default;border-color:#1a1a4e}
.toggle-box.disabled:hover{border-color:#1a1a4e}
.toggle-text{font-size:20px;transition:color .2s}
.toggle-box.active .toggle-text{color:#60a5fa}
.cell.base-p0{background:#1a4a3e;box-shadow:none}
.cell.base-p1{background:#4a1a3e;box-shadow:none}
.cell.flag{background:#fbbf24;box-shadow:none;border-radius:4px}
.cell.flag-p0{background:#4ade80;box-shadow:none;border-radius:4px}
.cell.flag-p1{background:#f87171;box-shadow:none;border-radius:4px}
.snake-seg.flag-carried{box-shadow:0 0 10px #fbbf24, inset 0 0 6px #fbbf24}
.score-popup{position:absolute;font-size:28px;font-weight:800;pointer-events:none;z-index:20;animation:scoreFloat .9s ease-out forwards}
.score-popup.p0{color:#4ade80}
.score-popup.p1{color:#fb923c}
@keyframes scoreFloat{0%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-50px) scale(1.3)}}
.leaderboard{text-align:center;padding:10px;background:#0f3460;border-radius:12px;border:2px solid #1a1a4e;margin-top:12px}
.lb-entry{display:flex;justify-content:space-between;font-size:12px;color:#aabbcc;padding:4px 6px;border-bottom:1px solid #1a1a4e;align-items:center}
.lb-entry:last-child{border-bottom:none}
.lb-rank{color:#e94560;font-weight:700;min-width:24px;text-align:left}
.lb-score{font-weight:600}
.lb-empty{font-size:12px;color:#667788;padding:8px 0}
</style>
