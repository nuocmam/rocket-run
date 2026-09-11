import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas = document.getElementById('c');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const endMsg = document.getElementById('endMsg');

const BEST_KEY = 'rocket-run-best';
bestEl.textContent = String(Number(localStorage.getItem(BEST_KEY) || 0));

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050814);
scene.fog = new THREE.Fog(0x050814, 18, 70);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 3.2, 9);

const hemi = new THREE.HemisphereLight(0x9ecbff, 0x1a1020, 1.1);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(4, 8, 5);
scene.add(key);
const rim = new THREE.DirectionalLight(0xff7a4d, 0.55);
rim.position.set(-6, 2, -4);
scene.add(rim);

// starfield
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
  const mat = new THREE.PointsMaterial({ color: 0xcfe3ff, size: 0.05, sizeAttenuation: true });
  scene.add(new THREE.Points(geo, mat));
}

const laneHalf = 4.2;
const laneHeight = 2.8;
const rocketGroup = new THREE.Group();
scene.add(rocketGroup);

let rocket = null;
let playing = false;
let score = 0;
let speed = 14;
let steer = 0;
let steerY = 0;
let boost = 0;
let timeAlive = 0;
const keys = new Set();

const obstacles = [];
const pickups = [];
const clock = new THREE.Clock();

function makeAsteroid() {
  const geo = new THREE.IcosahedronGeometry(0.55 + Math.random() * 0.55, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.05 + Math.random() * 0.08, 0.25, 0.35 + Math.random() * 0.2),
    roughness: 0.9,
    metalness: 0.1,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.spin = new THREE.Vector3(
    (Math.random() - 0.5) * 2,
    (Math.random() - 0.5) * 2,
    (Math.random() - 0.5) * 2,
  );
  return mesh;
}

function makeStar() {
  const geo = new THREE.CylinderGeometry(0.38, 0.38, 0.1, 24);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffd24a,
    emissive: 0xff9a1a,
    emissiveIntensity: 0.85,
    metalness: 0.75,
    roughness: 0.25,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = Math.PI / 2; // face the camera lane
  return mesh;
}

function resetWorld() {
  for (const o of obstacles.splice(0)) scene.remove(o);
  for (const p of pickups.splice(0)) scene.remove(p);
  score = 0;
  speed = 14;
  steer = 0;
  steerY = 0;
  boost = 0;
  timeAlive = 0;
  scoreEl.textContent = '0';
  if (rocket) {
    if (rocket.userData.basePos) {
      rocket.position.copy(rocket.userData.basePos);
      rocket.position.x = 0;
      rocket.position.y = rocket.userData.basePos.y;
    } else {
      rocket.position.set(0, 0.4, 0);
    }
    rocket.rotation.set(rocket.userData.basePitch ?? -Math.PI / 2, 0, 0);
    rocket.userData.starScore = 0;
  }
  for (let i = 0; i < 10; i++) spawnObstacle(-20 - i * 8);
  for (let i = 0; i < 5; i++) spawnPickup(-28 - i * 14);
}

function spawnObstacle(z = -70) {
  const a = makeAsteroid();
  a.position.set((Math.random() * 2 - 1) * laneHalf, (Math.random() - 0.2) * 2.2, z);
  scene.add(a);
  obstacles.push(a);
}

function spawnPickup(z = -70) {
  const s = makeStar();
  // Full 3D lane: left/right and up/down
  s.position.set(
    (Math.random() * 2 - 1) * (laneHalf - 0.6),
    (Math.random() * 2 - 1) * laneHeight * 0.55,
    z,
  );
  s.userData.isCoin = true;
  scene.add(s);
  pickups.push(s);
}

const _rocketBox = new THREE.Box3();
const _otherWorld = new THREE.Vector3();
const _closest = new THREE.Vector3();

function rocketHits(other, pad = 0.25) {
  // Use the real mesh bounds (root empty ≠ visual center after rotation).
  _rocketBox.setFromObject(rocket);
  _rocketBox.expandByScalar(pad);
  other.getWorldPosition(_otherWorld);
  _rocketBox.clampPoint(_otherWorld, _closest);
  return _closest.distanceTo(_otherWorld) < 0.001;
}

function gameOver() {
  playing = false;
  const best = Math.max(score, Number(localStorage.getItem(BEST_KEY) || 0));
  localStorage.setItem(BEST_KEY, String(best));
  bestEl.textContent = String(best);
  endMsg.textContent = `Crashed! Score ${score}. Best ${best}.`;
  overlay.classList.remove('hidden');
  startBtn.textContent = 'Fly again';
}

function startGame() {
  resetWorld();
  overlay.classList.add('hidden');
  playing = true;
  clock.start();
}

startBtn.addEventListener('click', startGame);

addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  if (!playing && (e.code === 'Space' || e.code === 'Enter')) startGame();
});
addEventListener('keyup', (e) => keys.delete(e.code));

let pointerX = null;
let pointerY = null;
canvas.addEventListener('pointerdown', (e) => {
  pointerX = e.clientX;
  pointerY = e.clientY;
  if (!playing) startGame();
});
canvas.addEventListener('pointermove', (e) => {
  if (pointerX == null || !playing) return;
  const dx = (e.clientX - pointerX) / innerWidth;
  const dy = (e.clientY - pointerY) / innerHeight;
  steer = THREE.MathUtils.clamp(dx * 8, -1, 1);
  steerY = THREE.MathUtils.clamp(-dy * 8, -1, 1); // drag up => fly up
});
canvas.addEventListener('pointerup', () => {
  pointerX = null;
  pointerY = null;
  steer = 0;
  steerY = 0;
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const loader = new GLTFLoader();
loader.load(
  './rocket.glb',
  (gltf) => {
    rocket = gltf.scene;
    rocket.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = false;
        c.receiveShadow = false;
      }
    });
    // Blender rocket is Z-up; after glTF Y-up the nose is +Y.
    // Tip -90° around X so the nose faces forward into the scene (-Z).
    rocket.rotation.set(-Math.PI / 2, 0, 0);
    rocket.scale.setScalar(0.55);
    rocket.position.set(0, 0, 0);
    rocket.updateMatrixWorld(true);
    {
      const bb = new THREE.Box3().setFromObject(rocket);
      const center = bb.getCenter(new THREE.Vector3());
      // Move whole asset so its bounds center sits on the pivot.
      rocket.position.sub(center);
      rocket.position.y += 0.4;
      rocket.userData.basePos = rocket.position.clone();
    }
    rocket.userData.basePitch = -Math.PI / 2;
    rocketGroup.add(rocket);
  },
  undefined,
  (err) => {
    console.error(err);
    endMsg.textContent = 'Could not load rocket.glb';
  },
);

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (playing && rocket) {
    timeAlive += dt;
    speed = 14 + timeAlive * 0.55 + boost * 8;
    if (rocket.userData.starScore == null) rocket.userData.starScore = 0;

    let inputX = steer;
    let inputY = steerY;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) inputX -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) inputX += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) inputY += 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) inputY -= 1;
    inputX = THREE.MathUtils.clamp(inputX, -1, 1);
    inputY = THREE.MathUtils.clamp(inputY, -1, 1);
    boost = keys.has('Space') ? 1 : 0;

    const baseY = rocket.userData.basePos ? rocket.userData.basePos.y : 0.4;
    rocket.position.x = THREE.MathUtils.clamp(rocket.position.x + inputX * 8 * dt, -laneHalf, laneHalf);
    rocket.position.y = THREE.MathUtils.clamp(rocket.position.y + inputY * 7 * dt, baseY - laneHeight, baseY + laneHeight);
    const basePitch = rocket.userData.basePitch ?? -Math.PI / 2;
    rocket.rotation.z = THREE.MathUtils.damp(rocket.rotation.z, -inputX * 0.45, 8, dt);
    rocket.rotation.x = THREE.MathUtils.damp(
      rocket.rotation.x,
      basePitch - inputY * 0.35 + Math.sin(timeAlive * 6) * 0.02 * boost,
      8,
      dt,
    );

    const move = speed * dt;
    for (const a of obstacles) {
      a.position.z += move;
      a.rotation.x += a.userData.spin.x * dt;
      a.rotation.y += a.userData.spin.y * dt;
      if (a.position.z > 8) {
        a.position.z = -70 - Math.random() * 20;
        a.position.x = (Math.random() * 2 - 1) * laneHalf;
        a.position.y = (Math.random() - 0.2) * 2.2;
      }
      if (rocketHits(a, 0.15)) {
        gameOver();
      }
    }
    for (const s of pickups) {
      s.position.z += move;
      s.rotation.y += dt * 2.5;
      if (s.position.z > 8) {
        s.position.z = -80 - Math.random() * 30;
        s.position.x = (Math.random() * 2 - 1) * (laneHalf - 0.6);
        s.position.y = (Math.random() * 2 - 1) * laneHeight * 0.55;
      }
      // Soft 3D magnet
      rocket.getWorldPosition(_otherWorld);
      const dx = _otherWorld.x - s.position.x;
      const dy = _otherWorld.y - s.position.y;
      if (Math.hypot(dx, dy) < 2.4 && s.position.z > -12 && s.position.z < 4) {
        s.position.x += Math.sign(dx || 1) * Math.min(Math.abs(dx), 10 * dt);
        s.position.y += Math.sign(dy || 1) * Math.min(Math.abs(dy), 10 * dt);
      }
      if (rocketHits(s, 0.65)) {
        rocket.userData.starScore += 25;
        scoreEl.parentElement.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }],
          { duration: 180 },
        );
        s.position.z = -80 - Math.random() * 40;
        s.position.x = (Math.random() * 2 - 1) * (laneHalf - 0.6);
        s.position.y = (Math.random() * 2 - 1) * laneHeight * 0.55;
      }
    }

    score = Math.floor(timeAlive * 12) + (rocket.userData.starScore || 0);
    scoreEl.textContent = String(score);

    camera.position.x = THREE.MathUtils.damp(camera.position.x, rocket.position.x * 0.35, 4, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, 3.0 + rocket.position.y * 0.25, 4, dt);
    camera.lookAt(rocket.position.x * 0.2, rocket.position.y + 0.6, -4);
  } else if (rocket) {
    const basePitch = rocket.userData.basePitch ?? -Math.PI / 2;
    rocket.rotation.x = basePitch;
    rocket.rotation.z = Math.sin(performance.now() * 0.001) * 0.15;
  }

  renderer.render(scene, camera);
}

animate();
