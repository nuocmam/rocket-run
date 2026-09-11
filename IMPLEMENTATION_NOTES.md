# Astra retention pass — implementation notes

Shipped in this pass (Must + Nice):

- **8 Score breakdown** — `scoreParts` + `awardScore()`; game-over `#result-*` totals match final score (survival uses fractional accumulator floored into the bucket).
- **10 Run history** — `rocketRun.stats.v1` with `completedRuns` + last 5 `recentScores`; best key unchanged; defensive parse.
- **1 Replay loop** — `bestBeforeRun`, `#best-delta` / `#final-best`, `requestRestart()` with 250ms guard, Enter + button, single rAF loop.
- **2 Distance / zones** — eased ramp over ~120s to `MAX_BASE_SPEED`, distance HUD, zones; boost applied once on top of base; distance not scored.
- **3 Coin trails** — `spawnCoinTrail()` with 5–8 sinusoidal coins; preferred over scatter; light asteroid corridor avoidance.
- **5 Combo feedback** — `#combo-time-fill` shrink + last-25% pulse (respects reduced motion); floaters `+N (×M)`; popup cap.
- **7 Missions** — survive 30s / 5 near-misses / combo×4 on `#run-missions`; no points.
- **9 Sectors** — zone-driven fog/background/light blend + spawn weights; sector name in zone HUD.
- **4 Magnet pickup** — torus/sphere pickup, ~6s, radius ×1.8, `#magnet-effect`, one world pickup, no score.
- **6 Touch** — pointer drag on canvas + `#touch-boost`; touch-action none; clear on blur/restart.

Deferred / not changed:

- Shield pickup (plan explicitly deferred).
- No new repo/clone; `rocket.glb` kept.
- No postprocessing stack; sector look uses existing scene lights/fog only.
- Plan astra markdown/png artifacts left untracked (not part of the game ship).

Smoke: `node --check game.js` passed. No browser playtest in this agent pass.
