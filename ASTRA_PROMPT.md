Improve Rocket Run, a tiny single-page Three.js browser game, so each run feels responsive, rewarding, and worth replaying. Implement the changes—not just a plan—in game.js and index.html only, using Three.js and native browser APIs. Keep the scope achievable in one afternoon.

Live reference: https://nuocmam.github.io/rocket-run/

Existing assets: game.js, index.html, rocket.glb

Preserve the working foundation

Rocket nose points into the scene.

Full 3D steering: arrows and WASD move left/right/up/down; Space boosts.

Coins spawn throughout a reachable 3D volume and use mesh AABB collision plus a magnet.

Asteroid crashes work.

Inspect the existing implementation before editing. Preserve these behaviors and build on existing systems rather than replacing them unnecessarily. Do not modify rocket.glb, introduce dependencies, add a backend, or require a build system.

Goal and success criteria

Deliver a polished arcade flight loop with clear controls, satisfying pickups, meaningful boost decisions, fair escalating difficulty, and instant replay.

The result must:

Preserve responsive movement on both X and Y axes and reliable coin collection.

Make every pickup, boost, near miss, and crash visibly understandable.

Start forgivingly and become progressively challenging without unavoidable obstacle walls.

Restart cleanly without refreshing the page or duplicating listeners, animation loops, or entities.

Run smoothly on a typical desktop browser with bounded effects and no console errors.

Implement in this order

Stabilize the foundation in game.js.

Locate movement, collision, spawning, scoring, and game-state logic. Consolidate tunable values into a small configuration section.

Use delta-time-based movement and timers; clamp large frame gaps and clear held keys on blur. Prevent arrow/Space scrolling during play.

Preserve the corrected model orientation. Update world matrices before deriving mesh bounds; exclude decorative effects from collision bounds.

Keep coins reachable across both flight axes. Preserve AABB pickup and magnet behavior, with one award per coin and immediate removal from collision processing. Guard against coins skipping through the rocket at boost speed using swept checks or bounded simulation substeps.

Add responsive flight feel.

Apply smooth acceleration/deceleration without sluggish steering, normalize diagonal input, and gently bank/pitch the rocket with movement.

Keep visual banking separate from stable gameplay collision bounds.

Add subtle camera follow and boost FOV easing while maintaining a readable view.

Make boost a tactical resource.

Add a clearly displayed boost meter that drains while boosting and recharges after a short release delay.

Empty boost returns safely to normal speed; require sufficient recharge before reactivation to prevent flickering.

Communicate boosting through brighter exhaust and restrained speed streaks built with lightweight Three.js geometry or particles.

Make coins and near misses rewarding.

Add a short pickup burst, floating score text, and a brief HUD pulse.

Add a timed coin combo with a capped multiplier and visible expiry indicator. Show the actual awarded points.

Award one near-miss bonus per asteroid only after a close, collision-free pass. Derive proximity from gameplay bounds so crashes never earn a near-miss reward.

Create fair difficulty progression.

Gradually increase speed and obstacle pressure using capped curves.

Mix scattered coins with short trails or gentle arcs spanning both X and Y.

Maintain traversable gaps and sufficient reaction time, especially during boost. Avoid placing coin trails inside asteroids.

Keep early seconds forgiving and show a simple difficulty or distance indicator.

Add restrained audiovisual feedback.

Add brief crash particles, a short impact shake, and a clear transition to game over.

Generate distinct pickup, boost, and crash sounds using Web Audio, initialized after user interaction.

Provide mute and reduced-motion controls; respect prefers-reduced-motion. Bound particle counts and reuse or dispose resources properly.

Finish the replay loop and UI in index.html and game.js.

Add a compact start overlay with controls and a readable HUD for score, combo, boost, and progress.

Add a game-over panel showing final score, best score, and a prominent restart button; support Enter to restart.

Persist best score and settings through guarded localStorage access.

Reset all transient gameplay state on restart, including input, timers, effects, combo, boost, camera, and spawn progression. Handle window resizing correctly.

QA checklist

Verify arrows/WASD on both axes, diagonal movement, boost depletion/recharge, and tab switching.

Collect coins head-on and at the edges of the magnet range, at normal and boost speeds, across the reachable flight volume; confirm exactly one award each.

Confirm crashes still register and near misses award once without rewarding collisions.

Play long enough to check difficulty caps, reachable coin patterns, and navigable obstacle gaps.

Restart repeatedly; verify clean state, stable entity counts, and no duplicated audio or animation.

Check resize behavior, mute, reduced motion, blocked storage, and browser console errors.

Deliver the working edits with a brief summary of changes and QA actually performed. Clearly identify any checks that remain unverified.