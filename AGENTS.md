# AGENTS — Snake Game

## Commands
| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check + production build |
| `npm run type-check` | Run `vue-tsc --build` |
| `npm run lint` | Run oxlint + eslint |
| `npm run format` | Prettier on src/ |
| `npm run test:unit` | Vitest unit tests |
| `npm run test:e2e` | Playwright E2E tests |

## Git Setup (new computer)
```powershell
# 1. Install Git (via winget, requires admin)
winget install --id Git.Git -e --source winget

# 2. Navigate to project folder
cd C:\path\to\snake-game-master

# 3. Configure git
git config user.email "your@email.com"
git config user.name "YourGitHubUsername"

# 4. Init + remote
git init
git remote add origin https://github.com/Jk9228/snake-game

# 5. Pull, then commit & push
git pull origin master --allow-unrelated-histories
# (resolve conflicts if any)
git add -A
git commit -m "your message"
git push -u origin master
```

## Project Files
- `snake.html` — Standalone HTML version (no toolchain needed)
- `src/App.vue` — Vue 3 SFC version (Vite + TypeScript)
- `index.html` — Vite entry point
- `vite.config.ts` — Vite configuration

## Key Conventions
- **Single food batch-respawn**: new food spawns only after ALL current food is eaten (one batch at a time)
- **Obstacle avoidance**: obstacles avoid a 3×3 zone ahead of the snake head
- **Direction applied immediately** on keypress (`pl.dir = nd`), not delayed to next tick
- **No CSS transitions** on `.snake-seg` — smooth movement via rAF interpolation
- **rAF interpolation loop**: `progress = (now - lastTick) / curInt` applied to `transform:translate()` for all segments
- **Dual mode**: P2 (WASD) on the left board, P1 (arrows) on the right; board DOM is ordered [P2, P1]
- **Space behavior**: running/game-over → reset to start screen; start screen → start
- **Free mode**: speed starts at 120ms (−5ms per 20pts), +1 food per 30pts, obstacles from 60pts (+1 per 20pts)

## New Modes (Planned)

### Architecture
- `mode` selects core gameplay; `modifiers[]` toggles extra features (wall-wrap, portals, reverse, power-ups)
- Leaderboard: localStorage top 5 (score, timestamp, duration, max speed)

### Speed Survival
- Start speed 150ms (optional 120ms); ≥120ms: -3ms/food, <120ms: -5ms/food; min 20ms
- Obstacles at ≤110ms; goal: survive longest + highest score
- Leaderboard in sidebar (toggleable) + game-over screen with rank comparison

### AI Opponent
- Shared board, bodies pass through, head-to-head kills both
- Player color vs AI color; food shared + golden food (×2 score)
- Difficulty: greedy / avoid-player / predict+intercept
- Optional toggles: wall-wrap, black hole, reverse control
- Win: choose target-score / timed / both

### Ghost Snake
- Records direction turn-points (last 5 games, player selects which to load)
- Ghost starts delayed then loops; semi-transparent; collision = -2pts + 0.5s stun

### Capture the Flag (Dual)
- Same board; P1 base bottom-left 3×3, P2 base top-right 3×3
- Collision: head-head both die, head-body head dies, encircle = +1pt
- 3 center flags (+1pt each), base flag stolen (+3pts, respawn 10s)
- Flags follow head; can carry multiple; death scatters flags randomly; respawn 3s
- Win: configurable target score

### Gravity Mode
- Food spawns top (row 0-5), falls 2 ticks/cell initially, accelerates (every 10pts + every 5 misses)
- 3 food base; +1 at 12pts, +1 at 28pts…; miss = counter (no score loss)
- Snake does NOT grow; game over = wall/self collision or too many misses

### Dynamic Black Hole
- Moves 1 cell/tick random; 3×3 attraction range; food pulled 1 cell/tick
- Size: 1×1 → 3 food → 2×2 → 3 food → 3×3 (max)
- At max: explodes (destroys nearby snake segments), respawns 1×1
- Head → death; body segment N+ → severed, score lost = segments lost

### Co-op Mode
- Same board; bodies pass through; head-head both die
- Shared food; team score × length multiplier (every 3 segs +0.1×)
- Each player: 1 revive, respawn as 1 segment
- Disruptor AI: 5 segs fixed, eats food (no grow), difficulty selectable
- AI collision: player head→AI = player dies; AI head→player body/wall/obstacle = AI dies; 3s respawn
- Obstacles increase over time

### Split Mode (Puzzle)
- Level-based puzzle: switches, buttons, timed mechanisms
- Split at designated points; merge at designated points
- Single: Tab to swap control (uncontrolled snake stays); Dual: WASD + arrows
- 5 initial levels; progress + speedrun time saved

## Modifiers

### Wall Wrap
- Snake wraps around board edges, direction maintained; whole snake teleports
- Secret: collect item + wrap → hidden puzzle map

### Portal
- 2 pairs (color-coded); respawn each food batch; head-only teleport
- Exit: maintain direction (or adjust if fatal), ensure 2 clear cells ahead

### Reverse Control
- Every 10s for 3s; random axis (H or V); red flash warning 0.5s before

### Power-up System
- 20% drop rate on food; symbols on grid; two categories:
  - Instant (pickup→use): Shield, Magnet, 2x Score, Invisible
  - Holdable (key to use, max 1): Speed Up, Slow Down, Bomb
- Use key: P2=Left Shift, P1=Right Shift; new pickup discarded if full
- Bomb: placed at tail, 3s delay, 3×3 blast scatters food randomly
- Magnet: 3×3 range, food pulled 1 cell/tick, 5s duration

## Key State Variables
- `mode` / `modifiers[]` — determines gameplay + active toggles
- `powerUp` / `powerUpTimer` — active held item and remaining duration
- `lastTick` / `curInt` — used by rAF loop for interpolation math
- `progress` (Vue ref) — 0→1 between ticks, drives segStyle()
- `started` — gates rAF interpolation and tick execution

## File-Specific Notes
### snake.html
- Uses imperative DOM: `boardEl`, `snake-container`, cell `dataset` attributes
- Each player has `pl.boardEl` — must be preserved when recreating players in `reset()`
- `rafRender()` is started once at boot (`requestAnimationFrame` loop)

### App.vue
- Vue reactive rendering: `cells` computed, `snakeSegments` computed, `segStyle()` function
- `rafLoop()` updates `progress.value`, template reads it via `segStyle()`
- No `boardEl` concept — rendering is template-driven
