import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** @type {const} */
const CFG = {
  laneHalf: 4.2,
  laneHeight: 2.8,
  baseSpeed: 14,
  speedRamp: 0.42,
  speedCap: 34,
  boostExtra: 10,
  steerAccel: 18,
  steerMax: 9,
  coinValue: 25,
  nearMissValue: 40,
  nearMissDist: 1.35,
  comboWindow: 2.4,
  comboCap: 5,
  boostMax: 1,
  boostDrain: 0.55,
  boostRecharge: 0.28,
  boostCooldown: 0.35,
  magnetRange: 2.6,
  magnetZ: [-14, 5],
};

const canvas = document.getElementById('c');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const comboEl = document.getElementById('combo');
const endMsg = document.getElementById('endMsg');
const boostFill = document.getElementById('boostFill');
const boostMeter = document.getElementById('boostMeter');
const muteBtn = document.getElementById('muteBtn');
const floatScores = document.getElementById('floatScores');

const BEST_KEY = 'rocket-run-best';
const MUTE_KEY = 'rocket-run-mute';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function lsGet(k, d) {
  try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, v); } catch {}
}

bestEl.textContent = String(Number(lsGet(BEST_KEY, '0')));
let muted = lsGet(MUTE_KEY, '0') === '1';
muteBtn.textContent = muted ? 'Sound off' : 'Sound on';

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050814);
scene.fog = new THREE.Fog(0x050814, 18, 70);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
const camBase = { x: 0, y: 3.2, z: 9, fov: 60 };
camera.position.set(camBase.x, camBase.y, camBase.z);

scene.add(new THREE.HemisphereLight(0x9ecbff, 0x1a1020, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(4, 8, 5);
scene.add(key);
const rim = new THREE.DirectionalLight(0xff7a4d, 0.55);
rim.position.set(-6, 2, -4);
scene.add(rim);

{
  const count = 900;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 80;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 40;
    pos[i * 3 + 2] = -Math.random() * 120;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcfe3ff, size: 0.05, sizeAttenuation: true })));
}

const rocketGroup = new THREE.Group();
scene.add(rocketGroup);

let rocket = null;
let playing = false;
let score = 0;
let coinScore = 0;
let nearMissScore = 0;
let speed = CFG.baseSpeed;
let velX = 0;
let velY = 0;
let steer = 0;
let steerY = 0;
let boosting = false;
let boostFuel = CFG.boostMax;
let boostCooldown = 0;
let timeAlive = 0;
let combo = 1;
let comboTimer = 0;
let shake = 0;
const keys = new Set();
const obstacles = [];
const pickups = [];
const floaters = [];
const clock = new THREE.Clock();

// audio
let audioCtx = null;
function ensureAudio() {
  if (muted || audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}
function beep(freq, dur = 0.08, type = 'square', gain = 0.04) {
  if (muted) return;
  ensureAudio();
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t0); o.stop(t0 + dur);
}

muteBtn.addEventListener('click', () => {
  muted = !muted;
  lsSet(MUTE_KEY, muted ? '1' : '0');
  muteBtn.textContent = muted ? 'Sound off' : 'Sound on';
  if (!muted) ensureAudio();
});

function makeAsteroid() {
  const r = 0.55 + Math.random() * 0.55;
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(r, 0),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.05 + Math.random() * 0.08, 0.25, 0.35 + Math.random() * 0.2),
      roughness: 0.9, metalness: 0.1, flatShading: true,
    }),
  );
  mesh.userData.spin = new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
  mesh.userData.radius = r;
  mesh.userData.awardedNearMiss = false;
  mesh.userData.prevSide = 0;
  return mesh;
}

function makeCoin() {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.38, 0.1, 24),
    new THREE.MeshStandardMaterial({
      color: 0xffd24a, emissive: 0xff9a1a, emissiveIntensity: 0.85, metalness: 0.75, roughness: 0.25,
    }),
  );
  mesh.rotation.x = Math.PI / 2;
  mesh.userData.isCoin = true;
  return mesh;
}

function floatScore(pts, color = '#ffd24a') {
  if (reducedMotion) return;
  const el = document.createElement('div');
  el.className = 'floater';
  el.textContent = `+${pts}`;
  el.style.color = color;
  el.style.left = '50%';
  el.style.top = '42%';
  floatScores.appendChild(el);
  setTimeout(() => el.remove(), 750);
}

function updateHud() {
  scoreEl.textContent = String(score);
  comboEl.textContent = String(combo);
  boostFill.style.transform = `scaleX(${THREE.MathUtils.clamp(boostFuel, 0, 1)})`;
  boostMeter.classList.toggle('boosting', boosting);
}

function clearEntities() {
  for (const o of obstacles.splice(0)) scene.remove(o);
  for (const p of pickups.splice(0)) scene.remove(p);
}

function spawnObstacle(z = -70) {
  const a = makeAsteroid();
  // leave navigable gaps: bias away from packing center occasionally
  a.position.set(
    (Math.random() * 2 - 1) * CFG.laneHalf,
    (Math.random() * 2 - 1) * CFG.laneHeight * 0.7,
    z,
  );
  scene.add(a);
  obstacles.push(a);
}

function spawnPickup(z = -70, trail = false, i = 0) {
  const s = makeCoin();
  if (trail) {
    const t = i / 4;
    s.position.set(
      Math.sin(t * Math.PI * 2) * (CFG.laneHalf * 0.55),
      Math.cos(t * Math.PI) * (CFG.laneHeight * 0.35),
      z - i * 2.2,
    );
  } else {
    s.position.set(
      (Math.random() * 2 - 1) * (CFG.laneHalf - 0.6),
      (Math.random() * 2 - 1) * CFG.laneHeight * 0.55,
      z,
    );
  }
  scene.add(s);
  pickups.push(s);
}

function resetWorld() {
  clearEntities();
  score = 0; coinScore = 0; nearMissScore = 0;
  speed = CFG.baseSpeed;
  velX = 0; velY = 0; steer = 0; steerY = 0;
  boosting = false; boostFuel = CFG.boostMax; boostCooldown = 0;
  timeAlive = 0; combo = 1; comboTimer = 0; shake = 0;
  camera.fov = camBase.fov; camera.updateProjectionMatrix();
  camera.position.set(camBase.x, camBase.y, camBase.z);
  if (rocket) {
    if (rocket.userData.basePos) {
      rocket.position.copy(rocket.userData.basePos);
      rocket.position.x = 0;
    } else rocket.position.set(0, 0.4, 0);
    rocket.rotation.set(rocket.userData.basePitch ?? -Math.PI / 2, 0, 0);
  }
  for (let i = 0; i < 10; i++) spawnObstacle(-18 - i * 9);
  for (let i = 0; i < 5; i++) spawnPickup(-26 - i * 14);
  // one early coin trail
  for (let i = 0; i < 5; i++) spawnPickup(-55, true, i);
  updateHud();
}

const _rocketBox = new THREE.Box3();
const _tmp = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _prevRocket = new THREE.Vector3();

function rocketHits(other, pad = 0.25) {
  rocket.updateMatrixWorld(true);
  _rocketBox.setFromObject(rocket);
  _rocketBox.expandByScalar(pad);
  other.getWorldPosition(_tmp);
  // swept check along Z against previous rocket center to avoid boost tunneling
  const curr = _rocketBox.getCenter(new THREE.Vector3());
  const steps = 3;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const probe = _tmp.clone();
    // move probe relatively? instead expand box along motion
    const box = _rocketBox.clone();
    const mid = _prevRocket.clone().lerp(curr, t);
    const delta = mid.clone().sub(curr);
    box.min.add(delta); box.max.add(delta);
    box.clampPoint(_tmp, _closest);
    if (_closest.distanceTo(_tmp) < 0.001) return true;
  }
  return false;
}

function gameOver() {
  if (!playing) return;
  playing = false;
  shake = reducedMotion ? 0 : 0.45;
  beep(90, 0.25, 'sawtooth', 0.05);
  const best = Math.max(score, Number(lsGet(BEST_KEY, '0')));
  lsSet(BEST_KEY, String(best));
  bestEl.textContent = String(best);
  endMsg.textContent = `Crashed! Score ${score} · Best ${best} · Coins ${coinScore} · Near misses ${nearMissScore}`;
  overlay.classList.remove('hidden');
  startBtn.textContent = 'Fly again';
}

function startGame() {
  ensureAudio();
  resetWorld();
  if (rocket) rocket.getWorldPosition(_prevRocket);
  overlay.classList.add('hidden');
  playing = true;
  clock.start();
  beep(440, 0.06, 'triangle', 0.03);
}

startBtn.addEventListener('click', startGame);

addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  if (!playing && (e.code === 'Enter' || e.code === 'Space')) startGame();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

let pointerX = null, pointerY = null;
canvas.addEventListener('pointerdown', (e) => {
  pointerX = e.clientX; pointerY = e.clientY;
  if (!playing) startGame();
});
canvas.addEventListener('pointermove', (e) => {
  if (pointerX == null || !playing) return;
  steer = THREE.MathUtils.clamp(((e.clientX - pointerX) / innerWidth) * 8, -1, 1);
  steerY = THREE.MathUtils.clamp((-(e.clientY - pointerY) / innerHeight) * 8, -1, 1);
});
canvas.addEventListener('pointerup', () => { pointerX = pointerY = null; steer = steerY = 0; });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

new GLTFLoader().load('./rocket.glb', (gltf) => {
  rocket = gltf.scene;
  rocket.traverse((c) => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; } });
  rocket.rotation.set(-Math.PI / 2, 0, 0);
  rocket.scale.setScalar(0.55);
  rocket.position.set(0, 0, 0);
  rocket.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(rocket);
  const center = bb.getCenter(new THREE.Vector3());
  rocket.position.sub(center);
  rocket.position.y += 0.4;
  rocket.userData.basePos = rocket.position.clone();
  rocket.userData.basePitch = -Math.PI / 2;
  rocketGroup.add(rocket);
  rocket.getWorldPosition(_prevRocket);
}, undefined, () => { endMsg.textContent = 'Could not load rocket.glb'; });

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (playing && rocket) {
    timeAlive += dt;
    const difficulty = Math.min(1, timeAlive / 75);

    // input
    let inputX = steer;
    let inputY = steerY;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) inputX -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) inputX += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) inputY += 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) inputY -= 1;
    // normalize diagonal
    const mag = Math.hypot(inputX, inputY);
    if (mag > 1) { inputX /= mag; inputY /= mag; }

    // boost resource
    const wantBoost = keys.has('Space') && boostFuel > 0.05 && boostCooldown <= 0;
    if (wantBoost) {
      boosting = true;
      boostFuel = Math.max(0, boostFuel - CFG.boostDrain * dt);
      if (boostFuel <= 0) { boosting = false; boostCooldown = CFG.boostCooldown; }
    } else {
      if (boosting) boostCooldown = CFG.boostCooldown;
      boosting = false;
      boostCooldown = Math.max(0, boostCooldown - dt);
      if (boostCooldown <= 0) boostFuel = Math.min(CFG.boostMax, boostFuel + CFG.boostRecharge * dt);
    }

    const targetSpeed = Math.min(CFG.speedCap, CFG.baseSpeed + timeAlive * CFG.speedRamp + (boosting ? CFG.boostExtra : 0));
    speed = THREE.MathUtils.damp(speed, targetSpeed, 4, dt);

    // smooth steer accel
    velX = THREE.MathUtils.damp(velX, inputX * CFG.steerMax, CFG.steerAccel, dt);
    velY = THREE.MathUtils.damp(velY, inputY * CFG.steerMax, CFG.steerAccel, dt);
    const baseY = rocket.userData.basePos ? rocket.userData.basePos.y : 0.4;
    rocket.position.x = THREE.MathUtils.clamp(rocket.position.x + velX * dt, -CFG.laneHalf, CFG.laneHalf);
    rocket.position.y = THREE.MathUtils.clamp(rocket.position.y + velY * dt, baseY - CFG.laneHeight, baseY + CFG.laneHeight);

    const basePitch = rocket.userData.basePitch ?? -Math.PI / 2;
    rocket.rotation.z = THREE.MathUtils.damp(rocket.rotation.z, -inputX * 0.45, 8, dt);
    rocket.rotation.x = THREE.MathUtils.damp(rocket.rotation.x, basePitch - inputY * 0.35, 8, dt);

    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) { combo = 1; comboTimer = 0; }
    }

    const move = speed * dt;
    rocket.updateMatrixWorld(true);
    const rocketCenter = new THREE.Box3().setFromObject(rocket).getCenter(new THREE.Vector3());

    for (const a of obstacles) {
      a.position.z += move;
      a.rotation.x += a.userData.spin.x * dt;
      a.rotation.y += a.userData.spin.y * dt;
      if (a.position.z > 10) {
        a.position.z = -70 - Math.random() * 25 - difficulty * 10;
        a.position.x = (Math.random() * 2 - 1) * CFG.laneHalf;
        a.position.y = (Math.random() * 2 - 1) * CFG.laneHeight * 0.7;
        a.userData.awardedNearMiss = false;
        a.userData.wasAhead = false;
        a.userData.minDist = Infinity;
      }

      const dist = Math.hypot(a.position.x - rocketCenter.x, a.position.y - rocketCenter.y);
      if (a.position.z < rocketCenter.z) {
        a.userData.wasAhead = true;
        a.userData.minDist = Math.min(a.userData.minDist ?? Infinity, dist);
      }
      if (!a.userData.awardedNearMiss && a.userData.wasAhead && a.position.z > rocketCenter.z + 0.6) {
        if ((a.userData.minDist ?? Infinity) < CFG.nearMissDist + a.userData.radius) {
          a.userData.awardedNearMiss = true;
          const pts = CFG.nearMissValue;
          nearMissScore += pts;
          floatScore(pts, '#9ecbff');
          beep(660, 0.05, 'sine', 0.035);
        }
        a.userData.wasAhead = false;
        a.userData.minDist = Infinity;
      }

      if (rocketHits(a, 0.12)) gameOver();
    }

    for (let i = pickups.length - 1; i >= 0; i--) {
      const s = pickups[i];
      s.position.z += move;
      s.rotation.z += dt * 2.5;
      if (s.position.z > 10) {
        s.position.z = -80 - Math.random() * 40;
        s.position.x = (Math.random() * 2 - 1) * (CFG.laneHalf - 0.6);
        s.position.y = (Math.random() * 2 - 1) * CFG.laneHeight * 0.55;
      }

      rocket.getWorldPosition(_tmp);
      const dx = _tmp.x - s.position.x;
      const dy = _tmp.y - s.position.y;
      if (Math.hypot(dx, dy) < CFG.magnetRange && s.position.z > CFG.magnetZ[0] && s.position.z < CFG.magnetZ[1]) {
        s.position.x += Math.sign(dx || 1) * Math.min(Math.abs(dx), 12 * dt);
        s.position.y += Math.sign(dy || 1) * Math.min(Math.abs(dy), 12 * dt);
      }

      if (rocketHits(s, 0.7)) {
        comboTimer = CFG.comboWindow;
        combo = Math.min(CFG.comboCap, combo + 1);
        const pts = CFG.coinValue * combo;
        coinScore += pts;
        score += pts;
        floatScore(pts);
        beep(520 + combo * 40, 0.07, 'square', 0.035);
        s.position.z = -90 - Math.random() * 40;
        s.position.x = (Math.random() * 2 - 1) * (CFG.laneHalf - 0.6);
        s.position.y = (Math.random() * 2 - 1) * CFG.laneHeight * 0.55;
      }
    }

    // occasionally inject denser waves as difficulty rises
    if (Math.random() < 0.002 + difficulty * 0.004 && obstacles.length < 18) {
      spawnObstacle(-75 - Math.random() * 20);
    }

    score = Math.floor(timeAlive * 12) + coinScore + nearMissScore;
    updateHud();

    // camera + FOV
    const targetFov = camBase.fov + (boosting ? 8 : 0);
    camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 5, dt);
    camera.updateProjectionMatrix();
    camera.position.x = THREE.MathUtils.damp(camera.position.x, rocket.position.x * 0.35, 4, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, camBase.y + rocket.position.y * 0.25, 4, dt);
    if (shake > 0) {
      shake = Math.max(0, shake - dt);
      camera.position.x += (Math.random() - 0.5) * shake * 0.6;
      camera.position.y += (Math.random() - 0.5) * shake * 0.4;
    }
    camera.lookAt(rocket.position.x * 0.2, rocket.position.y + 0.6, -4);

    rocket.getWorldPosition(_prevRocket);
  } else if (rocket) {
    const basePitch = rocket.userData.basePitch ?? -Math.PI / 2;
    rocket.rotation.x = basePitch;
    rocket.rotation.z = Math.sin(performance.now() * 0.001) * 0.15;
  }

  renderer.render(scene, camera);
}

animate();
