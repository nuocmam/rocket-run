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
const rocketGroup = new THREE.Group();
scene.add(rocketGroup);

let rocket = null;
let playing = false;
let score = 0;
let speed = 14;
let steer = 0;
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
  const geo = new THREE.OctahedronGeometry(0.28, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffd24a,
    emissive: 0xff9a1a,
    emissiveIntensity: 0.7,
    metalness: 0.3,
    roughness: 0.35,
  });
  return new THREE.Mesh(geo, mat);
}

function resetWorld() {
  for (const o of obstacles.splice(0)) scene.remove(o);
  for (const p of pickups.splice(0)) scene.remove(p);
  score = 0;
  speed = 14;
  steer = 0;
  boost = 0;
  timeAlive = 0;
  scoreEl.textContent = '0';
  if (rocket) {
    rocket.position.set(0, 0.2, 0);
    rocket.rotation.set(0, 0, 0);
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
  s.position.set((Math.random() * 2 - 1) * (laneHalf - 0.6), 0.4 + Math.random() * 1.5, z);
  scene.add(s);
  pickups.push(s);
}

function hitTest(a, b, ra, rb) {
  return a.distanceTo(b) < ra + rb;
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
canvas.addEventListener('pointerdown', (e) => {
  pointerX = e.clientX;
  if (!playing) startGame();
  else boost = 1;
});
canvas.addEventListener('pointermove', (e) => {
  if (pointerX == null || !playing) return;
  const dx = (e.clientX - pointerX) / innerWidth;
  steer = THREE.MathUtils.clamp(dx * 8, -1, 1);
});
canvas.addEventListener('pointerup', () => {
  pointerX = null;
  steer = 0;
  boost = 0;
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
    // Blender rocket was ~Z-up; orient nose forward (-Z) for the flyer
    rocket.rotation.x = Math.PI / 2;
    rocket.scale.setScalar(0.55);
    rocket.position.set(0, 0.2, 0);
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

    let input = steer;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) input -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) input += 1;
    input = THREE.MathUtils.clamp(input, -1, 1);
    boost = keys.has('Space') || keys.has('ArrowUp') || keys.has('KeyW') ? 1 : boost * 0.9;

    rocket.position.x = THREE.MathUtils.clamp(rocket.position.x + input * 7 * dt, -laneHalf, laneHalf);
    rocket.rotation.z = THREE.MathUtils.damp(rocket.rotation.z, -input * 0.45, 8, dt);
    rocket.rotation.x = Math.PI / 2 + Math.sin(timeAlive * 6) * 0.03 * boost;

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
      if (hitTest(rocket.position, a.position, 0.55, 0.7)) {
        gameOver();
      }
    }
    for (const s of pickups) {
      s.position.z += move;
      s.rotation.y += dt * 2.5;
      if (s.position.z > 8) {
        s.position.z = -80 - Math.random() * 30;
        s.position.x = (Math.random() * 2 - 1) * (laneHalf - 0.6);
      }
      if (hitTest(rocket.position, s.position, 0.55, 0.4)) {
        rocket.userData.starScore += 25;
        s.position.z = -80 - Math.random() * 40;
        s.position.x = (Math.random() * 2 - 1) * (laneHalf - 0.6);
      }
    }

    score = Math.floor(timeAlive * 12) + (rocket.userData.starScore || 0);
    scoreEl.textContent = String(score);

    camera.position.x = THREE.MathUtils.damp(camera.position.x, rocket.position.x * 0.35, 4, dt);
    camera.lookAt(rocket.position.x * 0.2, 1.2, -4);
  } else if (rocket) {
    rocket.rotation.y += dt * 0.4;
  }

  renderer.render(scene, camera);
}

animate();
