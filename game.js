import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** @type {const} */
const CFG = {
  laneHalf: 4.2,
  laneHeight: 2.8,
  BASE_SPEED: 14,
  MAX_BASE_SPEED: 34,
  RAMP_SECONDS: 120,
  ZONE_DISTANCE: 1500,
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
  HISTORY_LIMIT: 5,
  RESTART_GUARD_MS: 250,
  TRAIL_COUNT_MIN: 5,
  TRAIL_COUNT_MAX: 8,
  TRAIL_GAP_Z: 2.4,
  TRAIL_ARC_X: 1.6,
  TRAIL_ARC_Y: 0.9,
  TRAIL_INTERVAL: 9,
  TRAIL_EDGE_MARGIN: 0.75,
  COMBO_WARN_FRACTION: 0.25,
  SCORE_POPUP_MS: 650,
  MAX_SCORE_POPUPS: 12,
  MISSIONS: [
    { id: 'survive', target: 30, label: 'Survive 30s' },
    { id: 'nearMiss', target: 5, label: '5 near-misses' },
    { id: 'combo', target: 4, label: 'Combo ×4' },
  ],
  SECTOR_BLEND_SECONDS: 2,
  SECTORS: [
    {
      name: 'Blue Nebula',
      bg: 0x050814,
      fog: 0x050814,
      keyIntensity: 1.4,
      rimColor: 0xff7a4d,
      coinWeight: 0.55,
      asteroidWeight: 0.45,
    },
    {
      name: 'Amber Drift',
      bg: 0x12080a,
      fog: 0x1a0c0e,
      keyIntensity: 1.25,
      rimColor: 0xffaa55,
      coinWeight: 0.45,
      asteroidWeight: 0.55,
    },
    {
      name: 'Violet Reach',
      bg: 0x0a0618,
      fog: 0x140a28,
      keyIntensity: 1.15,
      rimColor: 0xb48cff,
      coinWeight: 0.6,
      asteroidWeight: 0.4,
    },
    {
      name: 'Emerald Belt',
      bg: 0x041210,
      fog: 0x062018,
      keyIntensity: 1.3,
      rimColor: 0x4dffb0,
      coinWeight: 0.5,
      asteroidWeight: 0.5,
    },
  ],
  MAGNET_PICKUP_INTERVAL: 25,
  MAGNET_DURATION: 6,
  MAGNET_RADIUS_MULTIPLIER: 1.8,
  TOUCH_DEADZONE_PX: 8,
  TOUCH_DRAG_RANGE_PX: 90,
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
const scorePopups = document.getElementById('score-popups') || floatScores;
const comboTimeFill = document.getElementById('combo-time-fill');
const comboMeter = document.getElementById('comboMeter');
const distanceValueEl = document.getElementById('distance-value');
const zoneValueEl = document.getElementById('zone-value');
const magnetEffectEl = document.getElementById('magnet-effect');
const magnetSecsEl = document.getElementById('magnet-secs');
const endPanel = document.getElementById('end-panel');
const resultSurvival = document.getElementById('result-survival');
const resultCoins = document.getElementById('result-coins');
const resultNearMisses = document.getElementById('result-near-misses');
const resultTotal = document.getElementById('result-total');
const bestDeltaEl = document.getElementById('best-delta');
const finalBestEl = document.getElementById('final-best');
const completedRunsEl = document.getElementById('completed-runs');
const recentScoresEl = document.getElementById('recent-scores');
const introCopy = document.getElementById('introCopy');
const touchBoostBtn = document.getElementById('touch-boost');
const missionEls = {
  survive: document.getElementById('mission-survive'),
  nearMiss: document.getElementById('mission-nearMiss'),
  combo: document.getElementById('mission-combo'),
};

const BEST_KEY = 'rocket-run-best';
const MUTE_KEY = 'rocket-run-mute';
const STATS_KEY = 'rocketRun.stats.v1';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = matchMedia('(pointer: coarse)').matches;

function lsGet(k, d) {
  try {
    const v = localStorage.getItem(k);
    return v == null ? d : v;
  } catch {
    return d;
  }
}
function lsSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch {}
}

function loadStats() {
  const fallback = { version: 1, completedRuns: 0, recentScores: [] };
  try {
    const raw = lsGet(STATS_KEY, '');
    if (!raw) return { ...fallback, recentScores: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...fallback, recentScores: [] };
    const completedRuns = Math.max(0, Number(parsed.completedRuns) || 0);
    const recentScores = Array.isArray(parsed.recentScores)
      ? parsed.recentScores.map((n) => Math.max(0, Math.floor(Number(n) || 0))).slice(0, CFG.HISTORY_LIMIT)
      : [];
    return { version: 1, completedRuns, recentScores };
  } catch {
    return { ...fallback, recentScores: [] };
  }
}

function saveStats(stats) {
  lsSet(
    STATS_KEY,
    JSON.stringify({
      version: 1,
      completedRuns: stats.completedRuns,
      recentScores: stats.recentScores.slice(0, CFG.HISTORY_LIMIT),
    }),
  );
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

/** @type {THREE.Object3D | null} */
let rocket = null;

const state = {
  phase: 'ready', // ready | playing | gameover
  runId: 0,
  elapsed: 0,
  distance: 0,
  zone: 1,
  baseSpeed: CFG.BASE_SPEED,
  effectiveSpeed: CFG.BASE_SPEED,
  scoreParts: { survival: 0, coins: 0, nearMisses: 0 },
  survivalAcc: 0,
  combo: 1,
  comboTimer: 0,
  boosting: false,
  boostFuel: CFG.boostMax,
  boostCooldown: 0,
  magnetBoostRemaining: 0,
  nearMissCount: 0,
  maxCombo: 1,
  bestBeforeRun: 0,
  ended: false,
  sectorIndex: 0,
  sectorBlend: 1,
  trailCorridor: null, // { cx, cy, halfX, halfY, zMin, zMax } or null
  trailSpawnTimer: 0,
  magnetPickupTimer: 0,
  missions: {
    survive: { progress: 0, done: false },
    nearMiss: { progress: 0, done: false },
    combo: { progress: 0, done: false },
  },
  stats: loadStats(),
};

let velX = 0;
let velY = 0;
let steer = 0;
let steerY = 0;
let shake = 0;
const keys = new Set();
const obstacles = [];
const pickups = []; // coins + magnet pickups
const clock = new THREE.Clock();
let animStarted = false;
let lastRestartAt = 0;
let touchBoostHeld = false;

// pointer steering
const pointerSteer = {
  id: null,
  originX: 0,
  originY: 0,
  nx: 0,
  ny: 0,
};

const bgColor = scene.background;
const fogColor = scene.fog.color;
const sectorFrom = { bg: new THREE.Color(0x050814), fog: new THREE.Color(0x050814), key: 1.4, rim: new THREE.Color(0xff7a4d) };
const sectorTo = { bg: new THREE.Color(0x050814), fog: new THREE.Color(0x050814), key: 1.4, rim: new THREE.Color(0xff7a4d) };

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
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start(t0);
  o.stop(t0 + dur);
}

muteBtn.addEventListener('click', () => {
  muted = !muted;
  lsSet(MUTE_KEY, muted ? '1' : '0');
  muteBtn.textContent = muted ? 'Sound off' : 'Sound on';
  if (!muted) ensureAudio();
});

function totalScore() {
  return (
    Math.floor(state.scoreParts.survival) +
    Math.floor(state.scoreParts.coins) +
    Math.floor(state.scoreParts.nearMisses)
  );
}

function awardScore(source, amount, opts = {}) {
  const n = Math.max(0, Number(amount) || 0);
  if (n <= 0) return 0;
  if (source === 'survival') {
    state.scoreParts.survival += n;
  } else if (source === 'coins') {
    state.scoreParts.coins += n;
  } else if (source === 'nearMisses') {
    state.scoreParts.nearMisses += n;
  } else {
    return 0;
  }
  const shown = Math.floor(n);
  if (shown > 0 && source !== 'survival') {
    const mult = opts.multiplier && opts.multiplier > 1 ? opts.multiplier : 0;
    floatScore(shown, opts.color || (source === 'nearMisses' ? '#9ecbff' : '#ffd24a'), mult);
  }
  return n;
}

function floatScore(pts, color = '#ffd24a', multiplier = 0) {
  if (reducedMotion) return;
  const host = scorePopups || floatScores;
  while (host.childElementCount >= CFG.MAX_SCORE_POPUPS) {
    host.firstElementChild?.remove();
  }
  const el = document.createElement('div');
  el.className = 'floater';
  el.textContent = multiplier > 1 ? `+${pts} (×${multiplier})` : `+${pts}`;
  el.style.color = color;
  el.style.left = `${48 + Math.random() * 4}%`;
  el.style.top = `${40 + Math.random() * 6}%`;
  host.appendChild(el);
  setTimeout(() => el.remove(), CFG.SCORE_POPUP_MS);
}

function clearFloaters() {
  floatScores.replaceChildren();
  if (scorePopups && scorePopups !== floatScores) scorePopups.replaceChildren();
}

function makeAsteroid() {
  const r = 0.55 + Math.random() * 0.55;
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(r, 0),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.05 + Math.random() * 0.08, 0.25, 0.35 + Math.random() * 0.2),
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true,
    }),
  );
  mesh.userData.spin = new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
  mesh.userData.radius = r;
  mesh.userData.awardedNearMiss = false;
  mesh.userData.prevSide = 0;
  mesh.userData.isAsteroid = true;
  return mesh;
}

function makeCoin() {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.38, 0.1, 24),
    new THREE.MeshStandardMaterial({
      color: 0xffd24a,
      emissive: 0xff9a1a,
      emissiveIntensity: 0.85,
      metalness: 0.75,
      roughness: 0.25,
    }),
  );
  mesh.rotation.x = Math.PI / 2;
  mesh.userData.isCoin = true;
  mesh.userData.collected = false;
  return mesh;
}

function makeMagnetPickup() {
  const group = new THREE.Group();
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.12, 10, 24),
    new THREE.MeshStandardMaterial({
      color: 0x4fd1ff,
      emissive: 0x1a6cff,
      emissiveIntensity: 0.9,
      metalness: 0.6,
      roughness: 0.3,
    }),
  );
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 12, 12),
    new THREE.MeshStandardMaterial({
      color: 0xb8ecff,
      emissive: 0x4fd1ff,
      emissiveIntensity: 1.1,
      metalness: 0.4,
      roughness: 0.2,
    }),
  );
  group.add(torus);
  group.add(core);
  group.userData.isMagnetPickup = true;
  group.userData.collected = false;
  group.userData.radius = 0.55;
  return group;
}

function currentSector() {
  return CFG.SECTORS[(state.zone - 1) % CFG.SECTORS.length];
}

function beginSectorBlend(nextIndex) {
  sectorFrom.bg.copy(bgColor);
  sectorFrom.fog.copy(fogColor);
  sectorFrom.key = key.intensity;
  sectorFrom.rim.copy(rim.color);
  const s = CFG.SECTORS[nextIndex % CFG.SECTORS.length];
  sectorTo.bg.setHex(s.bg);
  sectorTo.fog.setHex(s.fog);
  sectorTo.key = s.keyIntensity;
  sectorTo.rim.setHex(s.rimColor);
  state.sectorIndex = nextIndex % CFG.SECTORS.length;
  state.sectorBlend = 0;
}

function updateSectorVisuals(dt) {
  if (state.sectorBlend < 1) {
    state.sectorBlend = Math.min(1, state.sectorBlend + dt / CFG.SECTOR_BLEND_SECONDS);
    const t = state.sectorBlend;
    const smooth = t * t * (3 - 2 * t);
    bgColor.copy(sectorFrom.bg).lerp(sectorTo.bg, smooth);
    fogColor.copy(sectorFrom.fog).lerp(sectorTo.fog, smooth);
    key.intensity = THREE.MathUtils.lerp(sectorFrom.key, sectorTo.key, smooth);
    rim.color.copy(sectorFrom.rim).lerp(sectorTo.rim, smooth);
  }
}

function effectiveMagnetRange() {
  return state.magnetBoostRemaining > 0
    ? CFG.magnetRange * CFG.MAGNET_RADIUS_MULTIPLIER
    : CFG.magnetRange;
}

function updateHud() {
  scoreEl.textContent = String(totalScore());
  comboEl.textContent = String(state.combo);
  boostFill.style.transform = `scaleX(${THREE.MathUtils.clamp(state.boostFuel, 0, 1)})`;
  boostMeter.classList.toggle('boosting', state.boosting);

  const comboFrac = state.combo > 1 && state.comboTimer > 0
    ? THREE.MathUtils.clamp(state.comboTimer / CFG.comboWindow, 0, 1)
    : 0;
  if (comboTimeFill) comboTimeFill.style.transform = `scaleX(${comboFrac})`;
  if (comboMeter) {
    const warn = comboFrac > 0 && comboFrac <= CFG.COMBO_WARN_FRACTION;
    comboMeter.classList.toggle('warn', warn && !reducedMotion);
  }

  if (distanceValueEl) distanceValueEl.textContent = String(Math.floor(state.distance));
  const sector = currentSector();
  if (zoneValueEl) zoneValueEl.textContent = `${state.zone} · ${sector.name}`;

  if (magnetEffectEl) {
    const active = state.magnetBoostRemaining > 0;
    magnetEffectEl.classList.toggle('active', active);
    if (magnetSecsEl) magnetSecsEl.textContent = String(Math.ceil(state.magnetBoostRemaining));
  }

  updateMissionHud();
}

function updateMissionHud() {
  for (const m of CFG.MISSIONS) {
    const el = missionEls[m.id];
    const st = state.missions[m.id];
    if (!el || !st) continue;
    el.classList.toggle('done', st.done);
    if (m.id === 'survive') {
      el.textContent = st.done ? 'Survive 30s' : `Survive ${Math.min(m.target, Math.floor(st.progress))}s / ${m.target}s`;
    } else if (m.id === 'nearMiss') {
      el.textContent = st.done ? '5 near-misses' : `Near-miss ${Math.min(m.target, st.progress)} / ${m.target}`;
    } else if (m.id === 'combo') {
      el.textContent = st.done ? 'Combo ×4' : `Combo ×${Math.min(m.target, st.progress)} / ×${m.target}`;
    }
  }
}

function latchMissions() {
  const survive = state.missions.survive;
  survive.progress = state.elapsed;
  if (!survive.done && survive.progress >= 30) survive.done = true;

  const nm = state.missions.nearMiss;
  nm.progress = state.nearMissCount;
  if (!nm.done && nm.progress >= 5) nm.done = true;

  const cb = state.missions.combo;
  cb.progress = state.maxCombo;
  if (!cb.done && cb.progress >= 4) cb.done = true;
}

function clearEntities() {
  for (const o of obstacles.splice(0)) scene.remove(o);
  for (const p of pickups.splice(0)) scene.remove(p);
  state.trailCorridor = null;
}

function positionAvoidsTrail(x, y, z, margin = 1.1) {
  const c = state.trailCorridor;
  if (!c) return true;
  if (z < c.zMin - 2 || z > c.zMax + 2) return true;
  const dx = Math.abs(x - c.cx);
  const dy = Math.abs(y - c.cy);
  return dx > c.halfX + margin || dy > c.halfY + margin;
}

function spawnObstacle(z = -70) {
  const a = makeAsteroid();
  let x = (Math.random() * 2 - 1) * CFG.laneHalf;
  let y = (Math.random() * 2 - 1) * CFG.laneHeight * 0.7;
  // lightly avoid trail corridor
  for (let attempt = 0; attempt < 6; attempt++) {
    if (positionAvoidsTrail(x, y, z, 0.9)) break;
    x = (Math.random() * 2 - 1) * CFG.laneHalf;
    y = (Math.random() * 2 - 1) * CFG.laneHeight * 0.7;
  }
  a.position.set(x, y, z);
  scene.add(a);
  obstacles.push(a);
}

function spawnCoinAt(x, y, z) {
  const s = makeCoin();
  s.position.set(x, y, z);
  scene.add(s);
  pickups.push(s);
  return s;
}

function spawnCoinScatter(z = -70) {
  const x = (Math.random() * 2 - 1) * (CFG.laneHalf - CFG.TRAIL_EDGE_MARGIN);
  const y = (Math.random() * 2 - 1) * CFG.laneHeight * 0.55;
  spawnCoinAt(x, y, z);
}

function spawnCoinTrail(zStart = -70) {
  const count = CFG.TRAIL_COUNT_MIN + Math.floor(Math.random() * (CFG.TRAIL_COUNT_MAX - CFG.TRAIL_COUNT_MIN + 1));
  const margin = CFG.TRAIL_EDGE_MARGIN;
  const maxX = CFG.laneHalf - margin - CFG.TRAIL_ARC_X;
  const maxY = CFG.laneHeight * 0.55 - CFG.TRAIL_ARC_Y;
  const cx = (Math.random() * 2 - 1) * Math.max(0.2, maxX);
  const cy = (Math.random() * 2 - 1) * Math.max(0.2, maxY);
  const phase = Math.random() * Math.PI * 2;
  const dir = Math.random() < 0.5 ? 1 : -1;
  const gap = CFG.TRAIL_GAP_Z;

  // constrain lateral step at max boosted speed
  const maxBoostSpeed = CFG.MAX_BASE_SPEED + CFG.boostExtra;
  const travelTime = gap / maxBoostSpeed;
  const maxLateral = CFG.steerMax * travelTime * 0.95;
  const arcX = Math.min(CFG.TRAIL_ARC_X, maxLateral);
  const arcY = Math.min(CFG.TRAIL_ARC_Y, maxLateral);

  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const x = cx + Math.sin(phase + t * Math.PI * 2 * dir) * arcX;
    const y = cy + Math.cos(phase + t * Math.PI * dir) * arcY;
    const z = zStart - i * gap;
    const clampedX = THREE.MathUtils.clamp(x, -(CFG.laneHalf - margin), CFG.laneHalf - margin);
    const clampedY = THREE.MathUtils.clamp(y, -CFG.laneHeight * 0.7, CFG.laneHeight * 0.7);
    spawnCoinAt(clampedX, clampedY, z);
    zMin = Math.min(zMin, z);
    zMax = Math.max(zMax, z);
  }

  state.trailCorridor = {
    cx,
    cy,
    halfX: arcX + 0.5,
    halfY: arcY + 0.45,
    zMin,
    zMax,
  };
}

function countWorldMagnetPickups() {
  let n = 0;
  for (const p of pickups) if (p.userData.isMagnetPickup && !p.userData.collected) n++;
  return n;
}

function spawnMagnetPickup(z = -75) {
  if (countWorldMagnetPickups() >= 1) return;
  const m = makeMagnetPickup();
  let x = (Math.random() * 2 - 1) * (CFG.laneHalf - 1);
  let y = (Math.random() * 2 - 1) * CFG.laneHeight * 0.5;
  for (let attempt = 0; attempt < 8; attempt++) {
    if (positionAvoidsTrail(x, y, z, 1.2)) break;
    x = (Math.random() * 2 - 1) * (CFG.laneHalf - 1);
    y = (Math.random() * 2 - 1) * CFG.laneHeight * 0.5;
  }
  m.position.set(x, y, z);
  scene.add(m);
  pickups.push(m);
}

function resetMissions() {
  state.missions = {
    survive: { progress: 0, done: false },
    nearMiss: { progress: 0, done: false },
    combo: { progress: 0, done: false },
  };
}

function resetWorld() {
  clearEntities();
  clearFloaters();
  state.elapsed = 0;
  state.distance = 0;
  state.zone = 1;
  state.baseSpeed = CFG.BASE_SPEED;
  state.effectiveSpeed = CFG.BASE_SPEED;
  state.scoreParts = { survival: 0, coins: 0, nearMisses: 0 };
  state.survivalAcc = 0;
  state.combo = 1;
  state.comboTimer = 0;
  state.boosting = false;
  state.boostFuel = CFG.boostMax;
  state.boostCooldown = 0;
  state.magnetBoostRemaining = 0;
  state.nearMissCount = 0;
  state.maxCombo = 1;
  state.ended = false;
  state.trailSpawnTimer = 0;
  state.magnetPickupTimer = CFG.MAGNET_PICKUP_INTERVAL * 0.4;
  resetMissions();
  velX = 0;
  velY = 0;
  steer = 0;
  steerY = 0;
  shake = 0;
  pointerSteer.id = null;
  pointerSteer.nx = 0;
  pointerSteer.ny = 0;
  touchBoostHeld = false;
  if (touchBoostBtn) touchBoostBtn.classList.remove('active');

  beginSectorBlend(0);
  state.sectorBlend = 1;
  bgColor.setHex(CFG.SECTORS[0].bg);
  fogColor.setHex(CFG.SECTORS[0].fog);
  key.intensity = CFG.SECTORS[0].keyIntensity;
  rim.color.setHex(CFG.SECTORS[0].rimColor);

  camera.fov = camBase.fov;
  camera.updateProjectionMatrix();
  camera.position.set(camBase.x, camBase.y, camBase.z);
  if (rocket) {
    if (rocket.userData.basePos) {
      rocket.position.copy(rocket.userData.basePos);
      rocket.position.x = 0;
    } else rocket.position.set(0, 0.4, 0);
    rocket.rotation.set(rocket.userData.basePitch ?? -Math.PI / 2, 0, 0);
  }
  for (let i = 0; i < 10; i++) spawnObstacle(-18 - i * 9);
  for (let i = 0; i < 3; i++) spawnCoinScatter(-26 - i * 14);
  spawnCoinTrail(-55);
  updateHud();
}

const _rocketBox = new THREE.Box3();
const _tmp = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _prevRocket = new THREE.Vector3();

function rocketHits(other, pad = 0.25) {
  if (!rocket) return false;
  rocket.updateMatrixWorld(true);
  _rocketBox.setFromObject(rocket);
  _rocketBox.expandByScalar(pad);
  other.getWorldPosition(_tmp);
  const curr = _rocketBox.getCenter(new THREE.Vector3());
  const steps = 3;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const box = _rocketBox.clone();
    const mid = _prevRocket.clone().lerp(curr, t);
    const delta = mid.clone().sub(curr);
    box.min.add(delta);
    box.max.add(delta);
    box.clampPoint(_tmp, _closest);
    if (_closest.distanceTo(_tmp) < 0.001) return true;
  }
  return false;
}

function persistRun(final) {
  state.stats.completedRuns += 1;
  state.stats.recentScores = [final, ...state.stats.recentScores].slice(0, CFG.HISTORY_LIMIT);
  saveStats(state.stats);
}

function finishRun() {
  if (state.phase !== 'playing' || state.ended) return;
  state.ended = true;
  state.phase = 'gameover';
  shake = reducedMotion ? 0 : 0.45;
  beep(90, 0.25, 'sawtooth', 0.05);

  // finalize survival bucket so categories equal total
  const survivalFloor = Math.floor(state.survivalAcc);
  const survivalDelta = survivalFloor - Math.floor(state.scoreParts.survival);
  if (survivalDelta > 0) state.scoreParts.survival += survivalDelta;
  // keep fractional part aligned
  state.scoreParts.survival = survivalFloor;

  const final = totalScore();
  const prevBest = state.bestBeforeRun;
  const storedBest = Math.max(final, Number(lsGet(BEST_KEY, '0')));
  lsSet(BEST_KEY, String(storedBest));
  bestEl.textContent = String(storedBest);

  persistRun(final);

  if (resultSurvival) resultSurvival.textContent = String(Math.floor(state.scoreParts.survival));
  if (resultCoins) resultCoins.textContent = String(Math.floor(state.scoreParts.coins));
  if (resultNearMisses) resultNearMisses.textContent = String(Math.floor(state.scoreParts.nearMisses));
  if (resultTotal) resultTotal.textContent = String(final);

  if (bestDeltaEl) {
    if (final > prevBest) bestDeltaEl.textContent = `New best! +${final - prevBest}.`;
    else if (final === prevBest) bestDeltaEl.textContent = 'Matched your best.';
    else bestDeltaEl.textContent = `${prevBest - final} short of best.`;
  }
  if (finalBestEl) finalBestEl.textContent = `Best: ${storedBest}`;
  if (completedRunsEl) completedRunsEl.textContent = String(state.stats.completedRuns);
  if (recentScoresEl) {
    recentScoresEl.replaceChildren();
    for (const s of state.stats.recentScores) {
      const li = document.createElement('li');
      li.textContent = String(s);
      recentScoresEl.appendChild(li);
    }
  }

  if (endPanel) endPanel.classList.add('visible');
  if (introCopy) introCopy.style.display = 'none';
  endMsg.textContent = `Crashed! Score ${final}`;
  overlay.classList.remove('hidden');
  startBtn.textContent = 'Fly again';
  clearPointerSteer();
  touchBoostHeld = false;
}

function startRun() {
  ensureAudio();
  state.runId += 1;
  state.bestBeforeRun = Number(lsGet(BEST_KEY, '0')) || 0;
  resetWorld();
  if (rocket) rocket.getWorldPosition(_prevRocket);
  if (endPanel) endPanel.classList.remove('visible');
  if (introCopy) introCopy.style.display = '';
  endMsg.textContent = '';
  overlay.classList.add('hidden');
  state.phase = 'playing';
  state.ended = false;
  clock.start();
  beep(440, 0.06, 'triangle', 0.03);
  updateHud();
}

function requestRestart() {
  if (state.phase !== 'gameover' && state.phase !== 'ready') return;
  const now = performance.now();
  if (now - lastRestartAt < CFG.RESTART_GUARD_MS) return;
  lastRestartAt = now;
  startRun();
}

startBtn.addEventListener('click', (e) => {
  e.preventDefault();
  requestRestart();
});

addEventListener('keydown', (e) => {
  if (e.repeat) {
    // still track held keys for steering, but ignore restart repeats
    keys.add(e.code);
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    return;
  }
  keys.add(e.code);
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  if ((state.phase === 'gameover' || state.phase === 'ready') && (e.code === 'Enter' || e.code === 'Space')) {
    e.preventDefault();
    requestRestart();
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));

function clearPointerSteer() {
  pointerSteer.id = null;
  pointerSteer.nx = 0;
  pointerSteer.ny = 0;
  steer = 0;
  steerY = 0;
}

function clearInputs() {
  keys.clear();
  clearPointerSteer();
  touchBoostHeld = false;
  if (touchBoostBtn) touchBoostBtn.classList.remove('active');
}

addEventListener('blur', () => clearInputs());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearInputs();
});

function updateTouchBoostVisibility() {
  if (!touchBoostBtn) return;
  if (coarsePointer || matchMedia('(pointer: coarse)').matches) {
    touchBoostBtn.classList.add('visible');
  } else {
    // keep a small always-available control on fine pointers too (plan: hidden unless coarse OR always visible small)
    touchBoostBtn.classList.add('visible');
    touchBoostBtn.style.width = '56px';
    touchBoostBtn.style.height = '56px';
    touchBoostBtn.style.fontSize = '0.85rem';
    touchBoostBtn.style.opacity = '0.85';
  }
}
updateTouchBoostVisibility();

if (touchBoostBtn) {
  const setBoost = (on) => {
    touchBoostHeld = on;
    touchBoostBtn.classList.toggle('active', on);
  };
  touchBoostBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    touchBoostBtn.setPointerCapture(e.pointerId);
    setBoost(true);
    if (state.phase !== 'playing') requestRestart();
  });
  const endBoost = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setBoost(false);
  };
  touchBoostBtn.addEventListener('pointerup', endBoost);
  touchBoostBtn.addEventListener('pointercancel', endBoost);
  touchBoostBtn.addEventListener('lostpointercapture', () => setBoost(false));
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.target === touchBoostBtn) return;
  if (state.phase !== 'playing') {
    requestRestart();
    return;
  }
  if (pointerSteer.id != null) return;
  pointerSteer.id = e.pointerId;
  pointerSteer.originX = e.clientX;
  pointerSteer.originY = e.clientY;
  pointerSteer.nx = 0;
  pointerSteer.ny = 0;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {}
});

canvas.addEventListener('pointermove', (e) => {
  if (pointerSteer.id !== e.pointerId) return;
  const dx = e.clientX - pointerSteer.originX;
  const dy = e.clientY - pointerSteer.originY;
  const range = CFG.TOUCH_DRAG_RANGE_PX;
  const dead = CFG.TOUCH_DEADZONE_PX;
  const ax = Math.abs(dx) < dead ? 0 : dx;
  const ay = Math.abs(dy) < dead ? 0 : dy;
  pointerSteer.nx = THREE.MathUtils.clamp(ax / range, -1, 1);
  pointerSteer.ny = THREE.MathUtils.clamp(-ay / range, -1, 1);
  steer = pointerSteer.nx;
  steerY = pointerSteer.ny;
});

function endPointer(e) {
  if (pointerSteer.id !== e.pointerId) return;
  clearPointerSteer();
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('lostpointercapture', () => clearPointerSteer());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

new GLTFLoader().load(
  './rocket.glb',
  (gltf) => {
    rocket = gltf.scene;
    rocket.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = false;
        c.receiveShadow = false;
      }
    });
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
  },
  undefined,
  () => {
    endMsg.textContent = 'Could not load rocket.glb';
  },
);

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state.phase === 'playing' && rocket) {
    if (document.hidden) {
      // pause elapsed while tab hidden; inputs already cleared on blur
      renderer.render(scene, camera);
      return;
    }

    state.elapsed += dt;

    // eased speed ramp
    const t = Math.min(state.elapsed / CFG.RAMP_SECONDS, 1);
    const eased = t * t * (3 - 2 * t);
    state.baseSpeed = CFG.BASE_SPEED + (CFG.MAX_BASE_SPEED - CFG.BASE_SPEED) * eased;

    // input
    let inputX = pointerSteer.id != null ? pointerSteer.nx : steer;
    let inputY = pointerSteer.id != null ? pointerSteer.ny : steerY;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) inputX -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) inputX += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) inputY += 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) inputY -= 1;
    const mag = Math.hypot(inputX, inputY);
    if (mag > 1) {
      inputX /= mag;
      inputY /= mag;
    }

    // boost resource
    const wantBoost =
      (keys.has('Space') || touchBoostHeld) && state.boostFuel > 0.05 && state.boostCooldown <= 0;
    if (wantBoost) {
      state.boosting = true;
      state.boostFuel = Math.max(0, state.boostFuel - CFG.boostDrain * dt);
      if (state.boostFuel <= 0) {
        state.boosting = false;
        state.boostCooldown = CFG.boostCooldown;
      }
    } else {
      if (state.boosting) state.boostCooldown = CFG.boostCooldown;
      state.boosting = false;
      state.boostCooldown = Math.max(0, state.boostCooldown - dt);
      if (state.boostCooldown <= 0) {
        state.boostFuel = Math.min(CFG.boostMax, state.boostFuel + CFG.boostRecharge * dt);
      }
    }

    state.effectiveSpeed = state.baseSpeed + (state.boosting ? CFG.boostExtra : 0);
    state.distance += state.effectiveSpeed * dt;
    const nextZone = 1 + Math.floor(state.distance / CFG.ZONE_DISTANCE);
    if (nextZone !== state.zone) {
      state.zone = nextZone;
      beginSectorBlend((state.zone - 1) % CFG.SECTORS.length);
    }
    updateSectorVisuals(dt);

    // survival score (fractional accumulator; display uses floors that sum to total)
    state.survivalAcc += 12 * dt;
    const survivalFloor = Math.floor(state.survivalAcc);
    const already = Math.floor(state.scoreParts.survival);
    if (survivalFloor > already) {
      awardScore('survival', survivalFloor - already);
      state.scoreParts.survival = survivalFloor; // keep exact floor in bucket
    }

    if (state.magnetBoostRemaining > 0) {
      state.magnetBoostRemaining = Math.max(0, state.magnetBoostRemaining - dt);
    }

    velX = THREE.MathUtils.damp(velX, inputX * CFG.steerMax, CFG.steerAccel, dt);
    velY = THREE.MathUtils.damp(velY, inputY * CFG.steerMax, CFG.steerAccel, dt);
    const baseY = rocket.userData.basePos ? rocket.userData.basePos.y : 0.4;
    rocket.position.x = THREE.MathUtils.clamp(rocket.position.x + velX * dt, -CFG.laneHalf, CFG.laneHalf);
    rocket.position.y = THREE.MathUtils.clamp(rocket.position.y + velY * dt, baseY - CFG.laneHeight, baseY + CFG.laneHeight);

    const basePitch = rocket.userData.basePitch ?? -Math.PI / 2;
    rocket.rotation.z = THREE.MathUtils.damp(rocket.rotation.z, -inputX * 0.45, 8, dt);
    rocket.rotation.x = THREE.MathUtils.damp(rocket.rotation.x, basePitch - inputY * 0.35, 8, dt);

    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) {
        state.combo = 1;
        state.comboTimer = 0;
      }
    }

    const move = state.effectiveSpeed * dt;
    rocket.updateMatrixWorld(true);
    const rocketCenter = new THREE.Box3().setFromObject(rocket).getCenter(new THREE.Vector3());

    const sector = currentSector();
    const difficulty = Math.min(1, state.elapsed / 75);

    for (const a of obstacles) {
      a.position.z += move;
      a.rotation.x += a.userData.spin.x * dt;
      a.rotation.y += a.userData.spin.y * dt;
      if (a.position.z > 10) {
        a.position.z = -70 - Math.random() * 25 - difficulty * 10;
        let x = (Math.random() * 2 - 1) * CFG.laneHalf;
        let y = (Math.random() * 2 - 1) * CFG.laneHeight * 0.7;
        for (let attempt = 0; attempt < 6; attempt++) {
          if (positionAvoidsTrail(x, y, a.position.z, 0.9)) break;
          x = (Math.random() * 2 - 1) * CFG.laneHalf;
          y = (Math.random() * 2 - 1) * CFG.laneHeight * 0.7;
        }
        a.position.x = x;
        a.position.y = y;
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
          state.nearMissCount += 1;
          awardScore('nearMisses', CFG.nearMissValue, { color: '#9ecbff' });
          beep(660, 0.05, 'sine', 0.035);
        }
        a.userData.wasAhead = false;
        a.userData.minDist = Infinity;
      }

      if (rocketHits(a, 0.12)) finishRun();
    }
    if (state.phase !== 'playing') {
      renderer.render(scene, camera);
      return;
    }

    const magRange = effectiveMagnetRange();
    for (let i = pickups.length - 1; i >= 0; i--) {
      const s = pickups[i];
      if (s.userData.collected) continue;
      s.position.z += move;
      if (s.userData.isCoin) s.rotation.z += dt * 2.5;
      if (s.userData.isMagnetPickup) {
        s.rotation.y += dt * 2.2;
        s.rotation.x = Math.sin(state.elapsed * 3) * 0.25;
      }

      if (s.position.z > 10) {
        if (s.userData.isMagnetPickup) {
          s.userData.collected = true;
          scene.remove(s);
          pickups.splice(i, 1);
          continue;
        }
        // recycle loose coins as scatter or leave for trail respawn scheduler
        s.position.z = -80 - Math.random() * 40;
        s.position.x = (Math.random() * 2 - 1) * (CFG.laneHalf - 0.6);
        s.position.y = (Math.random() * 2 - 1) * CFG.laneHeight * 0.55;
        s.userData.collected = false;
      }

      if (s.userData.isCoin) {
        rocket.getWorldPosition(_tmp);
        const dx = _tmp.x - s.position.x;
        const dy = _tmp.y - s.position.y;
        if (Math.hypot(dx, dy) < magRange && s.position.z > CFG.magnetZ[0] && s.position.z < CFG.magnetZ[1]) {
          const pull = state.magnetBoostRemaining > 0 ? 18 : 12;
          s.position.x += Math.sign(dx || 1) * Math.min(Math.abs(dx), pull * dt);
          s.position.y += Math.sign(dy || 1) * Math.min(Math.abs(dy), pull * dt);
        }

        if (rocketHits(s, 0.7)) {
          s.userData.collected = true;
          state.comboTimer = CFG.comboWindow;
          state.combo = Math.min(CFG.comboCap, state.combo + 1);
          state.maxCombo = Math.max(state.maxCombo, state.combo);
          const mult = state.combo;
          const pts = CFG.coinValue * mult;
          awardScore('coins', pts, { multiplier: mult });
          beep(520 + state.combo * 40, 0.07, 'square', 0.035);
          // respawn coin further ahead
          s.userData.collected = false;
          s.position.z = -90 - Math.random() * 40;
          s.position.x = (Math.random() * 2 - 1) * (CFG.laneHalf - 0.6);
          s.position.y = (Math.random() * 2 - 1) * CFG.laneHeight * 0.55;
        }
      } else if (s.userData.isMagnetPickup) {
        if (rocketHits(s, 0.55)) {
          s.userData.collected = true;
          state.magnetBoostRemaining = CFG.MAGNET_DURATION; // refresh, no stack
          beep(880, 0.1, 'triangle', 0.04);
          scene.remove(s);
          pickups.splice(i, 1);
        }
      }
    }

    // spawn scheduler
    state.trailSpawnTimer += dt;
    state.magnetPickupTimer += dt;
    const coinBias = sector.coinWeight;
    if (state.trailSpawnTimer >= CFG.TRAIL_INTERVAL) {
      state.trailSpawnTimer = 0;
      if (Math.random() < coinBias + 0.2) spawnCoinTrail(-75 - Math.random() * 15);
      else spawnCoinScatter(-75 - Math.random() * 20);
    }
    if (state.magnetPickupTimer >= CFG.MAGNET_PICKUP_INTERVAL) {
      state.magnetPickupTimer = 0;
      spawnMagnetPickup(-78 - Math.random() * 10);
    }
    if (Math.random() < (0.002 + difficulty * 0.004) * (0.7 + sector.asteroidWeight) && obstacles.length < 18) {
      spawnObstacle(-75 - Math.random() * 20);
    }

    // advance / expire trail corridor with world scroll
    if (state.trailCorridor) {
      state.trailCorridor.zMin += move;
      state.trailCorridor.zMax += move;
      if (state.trailCorridor.zMin > 8) state.trailCorridor = null;
    }

    latchMissions();
    updateHud();

    const targetFov = camBase.fov + (state.boosting ? 8 : 0);
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
    updateSectorVisuals(dt);
    const basePitch = rocket.userData.basePitch ?? -Math.PI / 2;
    rocket.rotation.x = basePitch;
    rocket.rotation.z = Math.sin(performance.now() * 0.001) * 0.15;
  }

  renderer.render(scene, camera);
}

if (!animStarted) {
  animStarted = true;
  // seed HUD stats on load
  if (completedRunsEl) completedRunsEl.textContent = String(state.stats.completedRuns);
  animate();
}
