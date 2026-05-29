# PLAN — Snake Game

## Overview
A 20×20 Snake game with five modes (single, dual, free, speed survival, capture the flag) and difficulty settings, implemented in both standalone HTML and Vue 3 SFC. The game features smooth rAF-based interpolation for zero-latency input response, batch food respawning, dynamic difficulty scaling in free mode, and configurable speed (20–500ms) for single/dual/ctf modes.

## Architecture

### Files
| File | Purpose |
|------|---------|
| `snake.html` | Standalone HTML — imperative DOM, no build step |
| `src/App.vue` | Vue 3 SFC — reactive rendering with TypeScript |
| `index.html` | Vite entry point (mounts App.vue) |
| `vite.config.ts` | Vite configuration with Vue plugin |

### Rendering Models
- **snake.html**: Board cells are created as DOM elements with `dataset` attributes. Snake segments are absolutely-positioned `div`s inside a `.snake-container` overlay. `renderPlayer()` sets grid transforms on tick; `rafRender()` interpolates between ticks.
- **App.vue**: Board rendered via `v-for` over a computed `cells` array. Snake segments are `v-for` over `snakeSegments` computed. `segStyle()` reads `progress` ref for interpolation.

### Game Loop
```
requestAnimationFrame(rafRender/rafLoop)
  └─ calculates progress = (now - lastTick) / curInt
  └─ updates transforms with interpolation

setTimeout(tick, curInt)
  └─ moves snake by pl.dir
  └─ collision detection (walls, self, obstacles)
  └─ food eating / spawning
  └─ obstacle generation
  └─ renderAll() — sets grid positions
  └─ lastTick = now, schedule next tick
```

### New Architecture (Planned)
- `mode` selects core gameplay
- `modifiers[]` array toggles extra features (wall-wrap, portals, reverse, power-ups)
- Mode config objects replace flat `if (mode === 'single')` patterns
- Leaderboard: localStorage top 5

---

## Existing Modes

### Single Mode
- Difficulty selection: easy / normal / hard / hell
- Settings per difficulty:
  - easy: 1 food, no obstacles
  - normal: 2 food, no obstacles
  - hard: 3 food, no obstacles
  - hell: 3 food, obstacles enabled
- Obstacles (hell): 3–5 per batch, avoid 3×3 zone ahead of snake
- Food respawns only after ALL food eaten

### Dual Mode
- Two independent boards: P2 (WASD) left, P1 (arrows) right
- No obstacles
- 1 food per board at a time
- Each player has own score, snake, food

### Free Mode
- Dynamic scaling based on score:
  - Speed: 120ms − floor(score/20) × 5ms (min 40ms)
  - Food: 1 + floor(score/30)
  - Obstacles: start at 60pts, 1 + floor((score−60)/20)
- Obstacle avoidance zone same as hell mode

### Speed Survival ✅
- Start speed 150ms; ≥120ms: −3ms/food, <120ms: −5ms/food; min 20ms
- Obstacles appear at ≤110ms
- Leaderboard: localStorage top 5 (score, timestamp, duration, max speed)
- Game-over screen shows rank comparison
- Speed meter in UI sidebar

### Capture the Flag (Dual) ✅
| Item | Spec |
|------|------|
| Board | Shared 20×20 |
| Bases | Corner 3×3 (P1 bottom-left, P2 top-right) |
| Center flags | 3 flags, +1pt each, carry to own base |
| Base flags | 1 per base, steal enemy +3pt, recover own +1pt |
| Flag protection | Own base flag at own base cannot be picked up by owner |
| Respawn (scored) | Instant at base center (base flags) or random free pos (center flags) |
| Carrying | Flag follows head, can carry multiple |
| Death | All carried flags scatter randomly on map |
| Player respawn | 3s delay at own base |
| Collision | Head-head → both die; Head-body (any) → head dies; Encircle → +1pt (10-tick cooldown) |
| Score display | Floating +N popup (combined for multiple flags) |
| Win | Configurable target score (default 5); game pauses → Space resets → Space starts |

---

## New Modes (Planned)

### 1. AI Opponent
| Item | Spec |
|------|------|
| Board | Shared, bodies pass through |
| Collision | Head-to-head kills both; head-body = head dies; head-wall/obstacle = dies |
| AI difficulty | Simple: greedy toward food / Normal: avoid player + obstacles / Hard: predict + intercept |
| Power-up AI | With power-ups enabled, Hard AI also uses items and ambush tactics |
| Food | Shared pool + golden food (×2 score) |
| AI appearance | Different color from player |
| Optional toggles | Wall-wrap, black hole, reverse control (modifiers) |
| Win condition | Player chooses: target score / timed / both |

### 3. Ghost Snake
| Item | Spec |
|------|------|
| Source | Selectable from last 5 games (saved as direction turn-points) |
| Playback | Delayed start, loops after completion |
| Appearance | Semi-transparent, color varies per game |
| Count | 1 ghost at a time |
| Collision | −2 points + 0.5s stun (snake pauses in place) |

### 4. Gravity Mode
| Item | Spec |
|------|------|
| Food spawn | Board top (row 0-5), random horizontal position |
| Fall speed start | 2 ticks per cell |
| Acceleration | Every 10 points AND every 5 misses increase fall speed |
| Food count | 3 base; +1 at 12pts, +1 at 28pts... |
| Miss | Food hits bottom → disappears, miss counter +1 |
| Snake growth | NO growth (score only) |
| Game over | Wall/self collision OR too many misses |

### 5. Dynamic Black Hole
| Item | Spec |
|------|------|
| Movement | 1 cell/tick, random direction |
| Attraction range | 3×3; food pulled 1 cell/tick toward hole |
| Sizes | 1×1 (start) → eat 3 food → 2×2 → eat 3 food → 3×3 (max) |
| Explosion | At max size: explodes, destroys nearby snake segments, respawns 1×1 |
| Head collision | Snake head touches black hole → instant death |
| Body collision | Segment N touches → segments N+ severed and disappear, score lost = segments lost |
| Food interaction | Black hole consumes food in range (grows), no direct effect on snake |

### 6. Co-op Mode
| Item | Spec |
|------|------|
| Board | Shared |
| Player collision | Bodies pass through; head-head both die |
| Food | Fully shared pool |
| Scoring | Team total × length multiplier |
| Length multiplier | Every 3 segments +0.1× (starting at ×1.0) |
| Revive | 1 per player; instant respawn at random position as 1 segment |
| Obstacles | Increase over time |
| Disruptor AI | |
| — Length | Fixed 5 segments, does NOT grow |
| — Behavior | Eats food (food disappears, no AI score), competes with players |
| — Difficulty | Greedy / Avoid players / Predict+intercept |
| — Collision | Player head→AI = player dies (uses revive); AI head→player body/wall/obstacle = AI dies |
| — Respawn | 3s delay |

### 7. Split Mode (Puzzle)
| Item | Spec |
|------|------|
| Genre | Level-based puzzle (5 initial levels) |
| Objective | Activate switches → each snake reaches food point → both meet at common finish |
| Mechanics | Switches (hold open), buttons (permanent), timed mechanisms |
| Split | At designated points in level |
| Merge | At designated merge points |
| Single control | Tab to swap between snakes (uncontrolled snake stays still) |
| Dual control | P1: arrows, P2: WASD |
| Save | Level progress + speedrun time per level (localStorage) |

---

## Modifiers (Togglable across modes)

### A. Wall Wrap
| Item | Spec |
|------|------|
| Wrap type | Whole snake teleports to opposite side |
| Direction | Maintained after wrap |
| Secret | Collect specific item + wrap → enter hidden puzzle map |

### B. Portal
| Item | Spec |
|------|------|
| Pairs | 2 pairs (4 gates), color-coded (red↔blue, green↔yellow) |
| Respawn | Repositions each food batch |
| Teleport | Head only teleports; body follows through path |
| Exit direction | Maintain original direction; if fatal → adjust, ensure 2 clear cells ahead |
| Exit safety | Portals placed with ≥2 empty cells in all 4 directions |

### C. Reverse Control
| Item | Spec |
|------|------|
| Trigger | Every 10 seconds |
| Duration | 3 seconds |
| Inversion | Random axis each time (horizontal OR vertical, never both) |
| Warning | Red flash on screen edges, 0.5s before |

### D. Power-up System
| Item | Spec |
|------|------|
| Drop rate | 20% on eating food |
| Appearance | Symbol icons on grid (⚡🐢🧲⭐👻💣🛡️) |
| Instant (pickup→use) | Shield, Magnet, 2x Score, Invisible |
| Holdable (key to use) | Speed Up, Slow Down, Bomb |
| Hold limit | Max 1; new pickup discarded if already holding |
| Use key | P2 (WASD) = Left Shift; P1 (arrows) = Right Shift |

| Power-up | Type | Duration | Effect |
|----------|------|----------|--------|
| 🛡️ Shield | Instant | Single use | Pass through obstacles once |
| ⚡ Speed Up | Holdable | 5s | Speed ×2 |
| 🐢 Slow Down | Holdable | 5s | Speed ×0.5 |
| 🧲 Magnet | Instant | 5s | Attract food in 3×3 range, 1 cell/tick |
| ⭐ 2x Score | Instant | 8s | Score ×2 |
| 👻 Invisible | Instant | 4s | Snake becomes transparent |
| 💣 Bomb | Holdable | 3s delay | Place at tail, 3×3 blast scatters food randomly |

---

## Implementation Phases

| Phase | Contents | Est. Time |
|-------|----------|-----------|
| **1. Speed Survival** | Core mode with leaderboard | ✅ |
| **2. Capture the Flag** | Shared board, flags, bases, scoring | ✅ |
| **3. Items** | Power-up system (all items + magnet), Portals | 2-3 days |
| **4. AI** | AI Opponent, Ghost Snake | 2-3 days |
| **5. Advanced** | Gravity, Black Hole, Split Mode | 3-4 days |
| **6. Co-op** | Two-player co-op with disruptor AI | 2-3 days |

## Key Design Decisions

### Input Latency (rAF Interpolation)
- **Problem**: CSS transitions on snake segments locked visual target at tick time; direction changes only visible on next tick (~95ms delay)
- **Solution**: Removed CSS transitions. rAF loop continuously updates `transform: translate()` using `progress = (now - lastTick) / curInt`. Head interpolates in `pl.dir` direction immediately — `pl.dir` is set on keypress, not queued for next tick.
- **Trade-off**: Head takes diagonal shortcut mid-tick instead of perfect right-angle turn; visually imperceptible at game speed.

### Batch Food Respawn
- Food only spawns after ALL current food is eaten (one batch at a time)
- Prevents overflow from rapid eating

### Obstacle Avoidance Zone
- Obstacles are placed randomly but exclude a 3×3 area ahead of the snake head (1–3 cells forward × −1 to +1 lateral)
- Prevents impossible/unfair blockages

### Dual Mode Board Order
- P2 displayed left, P1 right
- snake.html: `boardEl` stored on each player object; DOM created in order [P2, P1]
- App.vue: template maps `cells` array, swaps segment index for P2 board

### Mixed Mode Design (New)
- Some features are standalone modes (Speed Survival, AI, Ghost, CTF, Gravity, Black Hole, Co-op, Split)
- Some are togglable modifiers (Wall Wrap, Portal, Reverse, Power-ups)
- `modifiers[]` array stored separately from `mode` string
- Modifiers can be enabled in any compatible mode

## Implementation History

1. **Initial creation**: Basic 20×20 single-player snake.html
2. **Vue SFC**: Converted game logic to App.vue with reactive rendering
3. **Difficulty system**: Four difficulty levels with varying food count and obstacles
4. **Dual mode**: Two-player independent boards with separate controls
5. **Board position swap**: P2 left, P1 right (inverted from initial implementation)
6. **Space-to-restart**: Consistent behavior across all states (start screen / running / game over)
7. **Snake appearance**: Continuous look using `box-shadow` grid with no cell borders
8. **Batch respawn**: Food respawns only when all food eaten
9. **Obstacle avoidance**: 3×3 zone exclusion for obstacle placement
10. **Free mode**: Dynamic speed, food, and obstacle scaling
11. **isOccupied fix**: Added obstacle check to food spawn position validation
12. **Smooth movement**: Switched from grid-cell rendering to positioned overlays with CSS transitions
13. **CSS transition → rAF interpolation**: Replaced CSS transitions with requestAnimationFrame loop for zero-latency input
14. **boardEl preservation fix**: Fixed reset() creating new players without boardEl reference (snake.html)
15. **Speed Survival mode**: New mode with dynamic speed, leaderboard, rank display
16. **Capture the Flag mode**: Shared board, flags, bases, scoring, respawn mechanics
17. **Flag respawn fix**: CTF flags use random free positions avoiding both snakes & obstacles
18. **Snake colors**: P1 green / P2 orange across all modes; eyes on all modes
19. **Own flag recovery**: Picking up scattered own base flag returns to base → +1pt
20. **CTF flag protection**: Own base flag at base cannot be picked up by owner
21. **Game pause on win**: CTF pauses at target score; Space → reset → wait → start
22. **Instant flag respawn**: All flags respawn instantly on score (no setTimeout delay)
23. **Mode dropdown**: Buttons replaced with `<select>` dropdown
24. **CTF score animation**: Floating +N popup, combined for multiple flags
25. **Custom CTF target**: Configurable target score (default 5)
26. **Configurable init speed**: 20–500ms slider for single/dual/ctf (default 120)
27. **Base territory exclusion**: Random flag spawns avoid base areas

## Known Issues & Edge Cases

- **Mid-tick direction change**: Head interpolates diagonally instead of right-angle turn; minor visual artifact, no functional impact
- **setTimeout drift**: Tick timing uses setTimeout which can drift slightly; rAF interpolation compensates by clamping progress to [0, 1]
- **Dual mode obstacle inconsistency**: Dual mode has no obstacles even in hell difficulty; intentional by design
- **Speed floor**: Free mode speed floors at 40ms; beyond that scaling stops
