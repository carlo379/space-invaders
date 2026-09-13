/**
 * Scary Invaders — Three.js 3D arcade
 * Axes: X right, Y up, Z into void (fleet −Z, player ≈0, camera +Z)
 * Super Laser = formation COLUMN wipe (same col index), never a row.
 */
import * as THREE from 'three';

const canvas = document.getElementById('game');
const scoreEl = document.getElementById('score');
const waveEl = document.getElementById('wave');
const livesEl = document.getElementById('lives');
const superAmmoEl = document.getElementById('super-ammo');
const overlay = document.getElementById('overlay');
const overlayMessage = document.getElementById('overlay-message');
const startButton = document.getElementById('start-button');

const PLAY_HALF_W = 12;
const PLAYER_Z = 0;
const BARRIER_Z = -2.35;
const FLEET_BACK_Z = -11.2;
const COL_STEP = 1.65;
const ROW_STEP = 1.125;
const EDGE = 11.2;

const alienColors = [0xd43c58, 0x9b56d4, 0x75d36e, 0xa83b82, 0xc5ba4f, 0xeb5268];
const alienRowIds = ['crown', 'spider', 'watcher', 'stalker', 'batwing', 'worm'];
const alienHex = ['#d43c58', '#9b56d4', '#75d36e', '#a83b82', '#c5ba4f', '#eb5268'];

const keys = new Set();
let state = 'title';
let score = 0;
let lives = 3;
let wave = 1;
let superAmmo = 3;
let lastTime = 0;
let animationId = 0;
let player = null;
let aliens = [];
let bullets = [];
let bombs = [];
let particles = [];
let barriers = [];
let fleet = null;
let bombTimer = 0;
let elapsed = 0;
let shake = 0;
let superBeam = null;

let audioContext = null;
let audioMaster = null;
let drone = null;

/* ---------- Three.js scene ---------- */
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x020207, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020207);
scene.fog = new THREE.FogExp2(0x020207, 0.038);

const camera = new THREE.PerspectiveCamera(52, 3 / 2, 0.1, 120);
camera.position.set(0, 5.4, 7.4);

const root = new THREE.Group();
scene.add(root);

const alienRoot = new THREE.Group();
const barrierRoot = new THREE.Group();
const bulletRoot = new THREE.Group();
const bombRoot = new THREE.Group();
const fxRoot = new THREE.Group();
root.add(alienRoot, barrierRoot, bulletRoot, bombRoot, fxRoot);

/* Lighting — cool cyan rim, void crushed */
const keyLight = new THREE.DirectionalLight(0x70eaff, 0.55);
keyLight.position.set(0, 8, 10);
scene.add(keyLight);
scene.add(new THREE.AmbientLight(0x1a1020, 0.35));
const playerRim = new THREE.PointLight(0x5cecff, 1.8, 14, 2);
playerRim.position.set(0, 1.6, 1.5);
scene.add(playerRim);

/* Ground contact strip */
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(26, 0.04),
  new THREE.MeshBasicMaterial({ color: 0x3c183b, transparent: true, opacity: 0.55 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(0, 0.01, PLAYER_Z + 0.35);
scene.add(ground);

/* Stars */
{
  const count = 900;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 60;
    positions[i * 3 + 1] = Math.random() * 28 - 2;
    positions[i * 3 + 2] = -8 - Math.random() * 70;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const stars = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: 0xb6a4ff,
      size: 0.06,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false
    })
  );
  scene.add(stars);
}

/* Void haze plane */
{
  const haze = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 24),
    new THREE.MeshBasicMaterial({
      color: 0x410c34,
      transparent: true,
      opacity: 0.12,
      depthWrite: false
    })
  );
  haze.position.set(0, 4, -18);
  scene.add(haze);
}

/* ---------- Textures (NearestFilter billboards) ---------- */
const loader = new THREE.TextureLoader();
function loadTex(path) {
  const t = loader.load(path);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

const textures = {
  bullet: loadTex('assets/bullet_player_00.png'),
  bomb: loadTex('assets/bomb_alien_00.png'),
  barrierFull: loadTex('assets/barrier_block_full.png'),
  barrierCrack: loadTex('assets/barrier_block_crack.png'),
  aliens: {
    crown: loadTex('assets/alien_crown_idle_00.png'),
    spider: loadTex('assets/alien_spider_idle_00.png'),
    watcher: loadTex('assets/alien_watcher_idle_00.png'),
    stalker: loadTex('assets/alien_stalker_idle_00.png'),
    batwing: loadTex('assets/alien_batwing_idle_00.png'),
    worm: loadTex('assets/alien_worm_idle_00.png')
  }
};

/* ---------- Mesh helpers ---------- */
function makePlayerMesh() {
  /* Low-poly human + oversized ice-cyan cannon; feet at Y=0, height 1.6u
   * AD definition v2 (PROVISIONAL preview): stronger contrast + cam-facing detail */
  const g = new THREE.Group();
  const legs = new THREE.MeshBasicMaterial({ color: 0x5c3a55 });
  const torsoMat = new THREE.MeshBasicMaterial({ color: 0xa85678 });
  const upper = new THREE.MeshBasicMaterial({ color: 0xc47898 });
  const rim = new THREE.MeshBasicMaterial({ color: 0xf0b8d0 });
  const hi = new THREE.MeshBasicMaterial({ color: 0xe8d0dc });
  const sole = new THREE.MeshBasicMaterial({ color: 0xff9eb8 });
  const cyan = new THREE.MeshBasicMaterial({ color: 0x70eaff });
  const ice = new THREE.MeshBasicMaterial({ color: 0xe5ffff });
  const beam = new THREE.MeshBasicMaterial({ color: 0x5cecff });
  const rearPlate = new THREE.MeshBasicMaterial({ color: 0xb8fbff });

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.52, 0.16), legs);
  legL.position.set(-0.11, 0.26, 0.02);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.52, 0.16), legs);
  legR.position.set(0.11, 0.26, 0.02);
  const soleL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.04), sole);
  soleL.position.set(-0.11, 0.03, 0.1);
  const soleR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.04), sole);
  soleR.position.set(0.11, 0.03, 0.1);

  const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.26, 0.34), legs);
  skirt.position.set(0, 0.55, 0.02);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.3), torsoMat);
  torso.position.set(0, 0.88, 0);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.04), hi);
  chest.position.set(0, 0.95, 0.16);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.06, 0.06), legs);
  belt.position.set(0, 0.7, 0.12);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.04), hi);
  buckle.position.set(0, 0.7, 0.17);

  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.16, 0.26), upper);
  shoulders.position.set(0, 1.14, 0);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 0.12), legs);
  pack.position.set(0, 1.05, 0.18);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.34), legs);
  hood.position.set(0, 1.38, 0.02);
  const hoodPeak = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.3), upper);
  hoodPeak.position.set(0, 1.55, -0.02);
  const hoodBrim = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.08), rim);
  hoodBrim.position.set(0, 1.48, 0.18);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.05), beam);
  visor.position.set(0, 1.36, -0.15);

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.42), torsoMat);
  armL.position.set(-0.2, 0.96, -0.22);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.42), torsoMat);
  armR.position.set(0.2, 0.96, -0.22);
  const gloveL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.04), hi);
  gloveL.position.set(-0.2, 0.96, 0.02);
  const gloveR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.04), hi);
  gloveR.position.set(0.2, 0.96, 0.02);

  const rimShoulderL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.04), rim);
  rimShoulderL.position.set(-0.2, 1.2, 0.15);
  const rimShoulderR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.04), rim);
  rimShoulderR.position.set(0.2, 1.2, 0.15);
  const rimHem = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.035, 0.04), rim);
  rimHem.position.set(0, 0.66, 0.19);

  const gunY = 0.98;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.22), cyan);
  stock.position.set(0, gunY, 0.02);
  const tube = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1.25), cyan);
  tube.position.set(0, gunY, -0.72);
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.55), ice);
  core.position.set(0, gunY, -0.55);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.28), ice);
  barrel.position.set(0, gunY, -1.42);
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.08), beam);
  muzzle.position.set(0, gunY, -1.58);
  const gunRear = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.36, 0.04), rearPlate);
  gunRear.position.set(0, gunY, 0.18);
  const finL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.32, 0.28), beam);
  finL.position.set(-0.3, gunY, 0.05);
  const finR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.32, 0.28), beam);
  finR.position.set(0.3, gunY, 0.05);
  const vent1 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.02), ice);
  vent1.position.set(0, gunY + 0.08, 0.205);
  const vent2 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.02), ice);
  vent2.position.set(0, gunY, 0.205);
  const vent3 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.02), ice);
  vent3.position.set(0, gunY - 0.08, 0.205);

  g.add(
    legL, legR, soleL, soleR, skirt, torso, chest, belt, buckle, shoulders, pack,
    hood, hoodPeak, hoodBrim, visor, armL, armR, gloveL, gloveR,
    rimShoulderL, rimShoulderR, rimHem,
    stock, tube, core, barrel, muzzle, gunRear, finL, finR, vent1, vent2, vent3
  );
  g.userData.kind = 'player';
  g.userData.muzzleLocal = { x: 0, y: gunY, z: -1.58 };
  return g;
}

function makeAlienBillboard(rowId, color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    map: textures.aliens[rowId],
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  /* Authoring ~0.95 × 0.75 footprint; plane sized for readable silhouette */
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.75), mat);
  plane.position.y = 0.375;
  plane.name = 'yBillboard';
  g.add(plane);
  /* Soft emissive eye glow blob */
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 6, 6),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 })
  );
  glow.position.set(0, 0.48, 0.05);
  g.add(glow);
  return g;
}

function makeBrick(hp) {
  const mat = new THREE.MeshBasicMaterial({
    map: hp === 1 ? textures.barrierCrack : textures.barrierFull,
    color: 0xb5ef68,
    transparent: true,
    opacity: hp === 1 ? 0.85 : 1
  });
  mat.map = hp === 1 ? textures.barrierCrack : textures.barrierFull;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), mat);
  return mesh;
}

function makeBulletMesh() {
  const mat = new THREE.MeshBasicMaterial({
    map: textures.bullet,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    color: 0xffffff
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.4), mat);
  m.name = 'yBillboard';
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.35),
    new THREE.MeshBasicMaterial({ color: 0xe5ffff })
  );
  const g = new THREE.Group();
  m.position.y = 0.05;
  core.position.y = 0.05;
  g.add(core, m);
  return g;
}

function makeBombMesh() {
  const mat = new THREE.MeshBasicMaterial({
    map: textures.bomb,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.4), mat);
  m.name = 'yBillboard';
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.28, 0.12),
    new THREE.MeshBasicMaterial({ color: 0xff416d })
  );
  const g = new THREE.Group();
  m.position.y = 0.15;
  core.position.y = 0.15;
  g.add(core, m);
  return g;
}

function makeSuperBeamMesh() {
  const g = new THREE.Group();
  const cylMat = new THREE.MeshBasicMaterial({
    color: 0x5cecff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 14, 16, 1, true), cylMat);
  outer.position.y = 7;
  const mid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 14, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x70eaff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  mid.position.y = 7;
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 14, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  core.position.y = 7;
  /* Thin wall planes along Z so the column reads through the fleet depth */
  const wallMat = new THREE.MeshBasicMaterial({
    color: 0x8ff7ff,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 14), wallMat);
  wall.position.y = 7;
  const wall2 = wall.clone();
  wall2.rotation.y = Math.PI / 2;
  g.add(outer, mid, core, wall, wall2);
  const light = new THREE.PointLight(0x70eaff, 4, 18, 2);
  light.position.set(0, 3, 0);
  g.add(light);
  g.userData.light = light;
  g.userData.mats = [cylMat, mid.material, core.material, wallMat, wall2.material];
  return g;
}

let playerMesh = null;
let beamMesh = null;

const _billboardWorld = new THREE.Vector3();
function faceCameraY(obj) {
  obj.traverse((child) => {
    if (child.name !== 'yBillboard') return;
    child.getWorldPosition(_billboardWorld);
    child.rotation.y = Math.atan2(
      camera.position.x - _billboardWorld.x,
      camera.position.z - _billboardWorld.z
    );
  });
}

/* ---------- HUD / util ---------- */
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
function pad(n, len = 6) {
  return String(n).padStart(len, '0');
}
function updateHud() {
  scoreEl.textContent = pad(score);
  waveEl.textContent = String(wave).padStart(2, '0');
  livesEl.textContent = '♥ '.repeat(Math.max(0, lives)).trim() || '—';
  superAmmoEl.textContent = String(superAmmo);
}

function clearGroup(group) {
  while (group.children.length) {
    const c = group.children[0];
    group.remove(c);
    c.traverse?.((o) => {
      if (o.geometry) o.geometry.dispose?.();
    });
  }
}

/* ---------- Entities ---------- */
function makePlayer() {
  if (playerMesh) {
    root.remove(playerMesh);
  }
  playerMesh = makePlayerMesh();
  root.add(playerMesh);
  return {
    x: 0,
    y: 0,
    z: PLAYER_Z,
    w: 0.6,
    h: 1.6,
    d: 0.7,
    speed: 9.75,
    cooldown: 0,
    invuln: 0
  };
}

function makeAliens() {
  clearGroup(alienRoot);
  aliens = [];
  const rows = Math.min(5 + Math.floor((wave - 1) / 3), 6);
  const cols = 10;
  const startX = -((cols - 1) * COL_STEP) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = alienRowIds[r % alienRowIds.length];
      const color = alienColors[r % alienColors.length];
      const mesh = makeAlienBillboard(id, color);
      alienRoot.add(mesh);
      const x = startX + c * COL_STEP;
      const z = FLEET_BACK_Z + r * ROW_STEP;
      mesh.position.set(x, 0, z);
      aliens.push({
        x,
        y: 0,
        z,
        w: 0.95,
        h: 0.75,
        d: 0.6,
        row: r,
        col: c,
        alive: true,
        color: alienHex[r % alienHex.length],
        colorNum: color,
        phase: (r * 7 + c * 3) % 17,
        mesh,
        id
      });
    }
  }
  fleet = { dir: 1, speed: 0.975 + wave * 0.2, step: 0, drop: 0, impact: 0 };
  bombTimer = 0;
}

function makeBarriers() {
  clearGroup(barrierRoot);
  barriers = [];
  const xs = [-7.9, -2.25, 3.4, 9.0];
  for (const bx of xs) {
    const blocks = [];
    for (let yy = 0; yy < 4; yy++) {
      for (let xx = 0; xx < 8; xx++) {
        if (yy === 0 && (xx < 2 || xx > 5)) continue;
        if (yy === 3 && (xx === 3 || xx === 4)) continue;
        const hp = 2;
        const mesh = makeBrick(hp);
        const x = bx - 0.7 + xx * 0.225;
        const y = 0.1 + yy * 0.22;
        const z = BARRIER_Z;
        mesh.position.set(x, y, z);
        barrierRoot.add(mesh);
        blocks.push({ x, y, z, w: 0.2, h: 0.2, d: 0.2, hp, mesh });
      }
    }
    barriers.push(blocks);
  }
}

function resetGame() {
  score = 0;
  lives = 3;
  wave = 1;
  superAmmo = 3;
  player = makePlayer();
  makeAliens();
  makeBarriers();
  clearGroup(bulletRoot);
  clearGroup(bombRoot);
  clearGroup(fxRoot);
  bullets = [];
  bombs = [];
  particles = [];
  elapsed = 0;
  shake = 0;
  if (beamMesh) {
    scene.remove(beamMesh);
    beamMesh = null;
  }
  superBeam = null;
  updateHud();
}

/* ---------- Audio ---------- */
function initAudio() {
  if (audioContext) {
    if (audioContext.state === 'suspended') audioContext.resume();
    return;
  }
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return;
  audioContext = new AudioCtor();
  audioMaster = audioContext.createGain();
  audioMaster.gain.value = 0.16;
  audioMaster.connect(audioContext.destination);
  drone = audioContext.createOscillator();
  const droneGain = audioContext.createGain();
  drone.type = 'sine';
  drone.frequency.value = 48;
  droneGain.gain.value = 0.035;
  drone.connect(droneGain).connect(audioMaster);
  drone.start();
}

function tone(freq, duration, type = 'square', volume = 0.12, slide = 0) {
  if (!audioContext || !audioMaster) return;
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), now + duration);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain).connect(audioMaster);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

/* ---------- Game flow ---------- */
function startGame() {
  initAudio();
  tone(110, 0.3, 'sawtooth', 0.11, 90);
  resetGame();
  state = 'playing';
  overlay.classList.remove('visible');
  lastTime = performance.now();
  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(loop);
}

function endGame(message) {
  state = 'gameover';
  tone(62, 0.7, 'sawtooth', 0.2, -38);
  overlayMessage.textContent = message;
  startButton.textContent = 'PRESS SPACE TO RESTART';
  overlay.classList.add('visible');
}

function nextWave() {
  wave++;
  if (wave % 3 === 0) superAmmo = Math.min(5, superAmmo + 1);
  makeAliens();
  makeBarriers();
  player.x = 0;
  updateHud();
  burst(0, 0.5, -4, '#b5ef68', 30);
  shake = 0.35;
  tone(70, 0.32, 'sawtooth', 0.13, 170);
}

function shoot() {
  if (state !== 'playing' || player.cooldown > 0) return;
  initAudio();
  const mesh = makeBulletMesh();
  bulletRoot.add(mesh);
  const muzzle = playerMesh?.userData?.muzzleLocal || { x: 0, y: 0.98, z: -1.58 };
  const b = {
    x: player.x + muzzle.x,
    y: muzzle.y,
    z: player.z + muzzle.z,
    w: 0.1,
    h: 0.1,
    d: 0.4,
    vz: -15,
    mesh
  };
  mesh.position.set(b.x, b.y, b.z);
  bullets.push(b);
  player.cooldown = 0.25;
  tone(520, 0.07, 'square', 0.055, 230);
}

function fireSuperLaser() {
  // Vertical COLUMN wipe (same formation col), never a horizontal row.
  if (state !== 'playing' || superAmmo <= 0 || superBeam) return;
  const live = aliens.filter((a) => a.alive);
  if (!live.length) return;
  const playerCenter = player.x;
  let anchor = live[0];
  let best = Math.abs(live[0].x - playerCenter);
  for (const a of live) {
    const d = Math.abs(a.x - playerCenter);
    if (d < best || (d === best && a.z > anchor.z)) {
      best = d;
      anchor = a;
    }
  }
  const targetCol = anchor.col;
  const targets = live.filter((a) => a.col === targetCol);
  superAmmo--;
  const beamX = player.x; /* weapon / player X; wipe still by a.col */
  const beamZ = (Math.min(...targets.map((t) => t.z)) + Math.max(...targets.map((t) => t.z))) / 2;
  superBeam = { col: targetCol, x: beamX, z: beamZ, life: 0.62, max: 0.62 };
  if (beamMesh) scene.remove(beamMesh);
  beamMesh = makeSuperBeamMesh();
  beamMesh.position.set(beamX, 0, beamZ);
  scene.add(beamMesh);
  initAudio();
  for (const a of targets) {
    a.alive = false;
    score += (5 - a.row) * 10 + 10;
    burst(a.x, 0.4, a.z, '#e7fbff', 18);
    a.mesh.visible = false;
  }
  shake = Math.max(shake, 0.42);
  tone(820, 0.4, 'sawtooth', 0.2, -690);
  tone(1550, 0.24, 'square', 0.1, -920);
  updateHud();
}

function aabbXZ(a, b) {
  return (
    a.x - a.w / 2 < b.x + b.w / 2 &&
    a.x + a.w / 2 > b.x - b.w / 2 &&
    a.z - a.d / 2 < b.z + b.d / 2 &&
    a.z + a.d / 2 > b.z - b.d / 2
  );
}

function burst(x, y, z, color, count = 10) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const elev = (Math.random() - 0.3) * Math.PI * 0.5;
    const s = 1.2 + Math.random() * 4;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.06),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
    );
    mesh.position.set(x, y, z);
    fxRoot.add(mesh);
    particles.push({
      x,
      y,
      z,
      vx: Math.cos(a) * Math.cos(elev) * s,
      vy: Math.sin(elev) * s + 1,
      vz: Math.sin(a) * Math.cos(elev) * s,
      life: 0.35 + Math.random() * 0.5,
      max: 0.85,
      color,
      mesh
    });
  }
}

function loseLife() {
  if (player.invuln > 0) return;
  lives--;
  updateHud();
  burst(player.x, 0.3, player.z, '#ff416d', 30);
  shake = 0.6;
  tone(90, 0.35, 'sawtooth', 0.18, -55);
  if (lives <= 0) {
    endGame('The last signal from Earth has gone quiet.');
    return;
  }
  player.x = 0;
  player.invuln = 2;
  for (const b of bullets) bulletRoot.remove(b.mesh);
  for (const b of bombs) bombRoot.remove(b.mesh);
  bullets = [];
  bombs = [];
}

function syncAlienMeshes() {
  for (const a of aliens) {
    if (!a.alive) {
      a.mesh.visible = false;
      continue;
    }
    a.mesh.visible = true;
    const twitch = Math.sin(elapsed * 13 + a.phase) * 0.03;
    const bob = Math.sin(elapsed * 2.8 + a.phase) * 0.05;
    a.mesh.position.set(a.x + twitch, bob, a.z);
    faceCameraY(a.mesh);
  }
}

function update(dt) {
  elapsed += dt;
  shake = Math.max(0, shake - dt * 1.6);
  player.cooldown = Math.max(0, player.cooldown - dt);
  player.invuln = Math.max(0, player.invuln - dt);

  if (superBeam) {
    superBeam.life -= dt;
    if (beamMesh) {
      const progress = 1 - superBeam.life / superBeam.max;
      const fade = Math.max(0, 1 - progress * 0.9);
      for (const m of beamMesh.userData.mats || []) {
        m.opacity = fade * (m === beamMesh.userData.mats[0] ? 0.55 : m === beamMesh.userData.mats[2] ? 1 : 0.7);
      }
      if (beamMesh.userData.light) beamMesh.userData.light.intensity = 4 * fade;
    }
    if (superBeam.life <= 0) {
      superBeam = null;
      if (beamMesh) {
        scene.remove(beamMesh);
        beamMesh = null;
      }
    }
  }

  if (keys.has('ArrowLeft') || keys.has('a')) player.x -= player.speed * dt;
  if (keys.has('ArrowRight') || keys.has('d')) player.x += player.speed * dt;
  player.x = clamp(player.x, -EDGE + player.w / 2, EDGE - player.w / 2);

  if (keys.has(' ') || keys.has('Spacebar')) shoot();

  for (const b of bullets) {
    b.z += b.vz * dt;
    b.mesh.position.set(b.x, b.y, b.z);
    faceCameraY(b.mesh);
  }
  bullets = bullets.filter((b) => {
    if (b.z < FLEET_BACK_Z - 2) {
      bulletRoot.remove(b.mesh);
      return false;
    }
    return true;
  });

  fleet.step += dt * fleet.speed;
  fleet.impact = Math.max(0, fleet.impact - dt * 2.5);
  const move = fleet.dir * dt * fleet.speed;
  for (const a of aliens) {
    if (a.alive) a.x += move;
  }

  const live = aliens.filter((a) => a.alive);
  if (!live.length) {
    nextWave();
    return;
  }

  const left = Math.min(...live.map((a) => a.x - a.w / 2));
  const right = Math.max(...live.map((a) => a.x + a.w / 2));
  if (right > EDGE || left < -EDGE) {
    fleet.dir *= -1;
    for (const a of aliens) {
      if (a.alive) a.z += 0.45;
    }
    fleet.impact = 1;
    shake = Math.max(shake, 0.14);
    tone(55 + wave * 4, 0.11, 'sawtooth', 0.045, 28);
  }

  const closest = Math.max(...live.map((a) => a.z + a.d / 2));
  if (closest > player.z - 0.15) {
    endGame('The invaders breached the last defense line.');
    return;
  }
  if (closest > player.z - 3.5) shake = Math.max(shake, 0.025);

  bombTimer -= dt;
  if (bombTimer <= 0) {
    const cols = [...new Set(live.map((a) => a.col))];
    const col = cols[Math.floor(Math.random() * cols.length)];
    const choices = live.filter((a) => a.col === col);
    const a = choices.reduce((best, cur) => (cur.z > best.z ? cur : best), choices[0]);
    const mesh = makeBombMesh();
    bombRoot.add(mesh);
    const bomb = {
      x: a.x,
      y: 0.35,
      z: a.z + 0.3,
      w: 0.15,
      h: 0.35,
      d: 0.15,
      vz: 3.625 + wave * 0.325,
      mesh
    };
    mesh.position.set(bomb.x, bomb.y, bomb.z);
    bombs.push(bomb);
    bombTimer = Math.max(0.28, 1.05 - wave * 0.055) + Math.random() * 0.75;
    tone(180 + Math.random() * 60, 0.09, 'triangle', 0.025, -70);
  }

  for (const b of bombs) {
    b.z += b.vz * dt;
    b.mesh.position.set(b.x, b.y, b.z);
    faceCameraY(b.mesh);
  }
  bombs = bombs.filter((b) => {
    if (b.z > PLAYER_Z + 2) {
      bombRoot.remove(b.mesh);
      return false;
    }
    return true;
  });

  for (const b of bullets) {
    let hit = false;
    for (const a of aliens) {
      if (a.alive && aabbXZ(b, a)) {
        a.alive = false;
        a.mesh.visible = false;
        hit = true;
        score += (5 - a.row) * 10 + 10;
        burst(a.x, 0.4, a.z, a.color, 15);
        shake = Math.max(shake, 0.12);
        tone(105 + Math.random() * 50, 0.16, 'sawtooth', 0.14, -75);
        break;
      }
    }
    if (hit) b.z = FLEET_BACK_Z - 99;
  }

  for (const b of bombs) {
    if (aabbXZ(b, player)) {
      b.z = PLAYER_Z + 99;
      loseLife();
    }
    for (const shield of barriers) {
      for (const block of shield) {
        if (block.hp > 0 && aabbXZ(b, block)) {
          block.hp--;
          updateBrick(block);
          b.z = PLAYER_Z + 99;
          break;
        }
      }
    }
  }

  for (const b of bullets) {
    for (const shield of barriers) {
      for (const block of shield) {
        if (block.hp > 0 && aabbXZ(b, block)) {
          block.hp--;
          updateBrick(block);
          b.z = FLEET_BACK_Z - 99;
          break;
        }
      }
    }
  }

  for (const a of aliens) {
    if (!a.alive) continue;
    for (const shield of barriers) {
      for (const block of shield) {
        if (block.hp > 0 && aabbXZ(a, block)) {
          block.hp = 0;
          updateBrick(block);
        }
      }
    }
  }

  barriers.forEach((s) => {
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i].hp <= 0) {
        barrierRoot.remove(s[i].mesh);
        s.splice(i, 1);
      }
    }
  });

  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.vy -= 4 * dt;
    p.life -= dt;
    p.mesh.position.set(p.x, p.y, p.z);
    p.mesh.material.opacity = Math.max(0, p.life / p.max);
  }
  particles = particles.filter((p) => {
    if (p.life <= 0) {
      fxRoot.remove(p.mesh);
      return false;
    }
    return true;
  });

  syncAlienMeshes();
  updateHud();
}

function updateBrick(block) {
  if (block.hp <= 0) return;
  block.mesh.material.map = block.hp === 1 ? textures.barrierCrack : textures.barrierFull;
  block.mesh.material.opacity = block.hp === 1 ? 0.85 : 1;
  block.mesh.material.needsUpdate = true;
}

function resize() {
  const frame = canvas.parentElement;
  const w = frame.clientWidth || 960;
  const h = frame.clientHeight || 640;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function updateCamera() {
  const targetX = player ? player.x : 0;
  const camX = targetX;
  const camY = 5.4;
  const camZ = 7.4;
  const sx = shake > 0 ? (Math.random() - 0.5) * shake * 0.45 : 0;
  const sy = shake > 0 ? (Math.random() - 0.5) * shake * 0.35 : 0;
  camera.position.set(camX + sx, camY + sy, camZ);
  /* Look toward fleet; eye target raised for human height */
  camera.lookAt(camX * 0.35, 1.6, -6.5);
  playerRim.position.set(targetX, 1.6, 1.5);
}

function render() {
  if (player && playerMesh) {
    const blink = player.invuln > 0 && Math.floor(player.invuln * 10) % 2 === 0;
    playerMesh.visible = !blink;
    playerMesh.position.set(player.x, 0, player.z);
    faceCameraY(playerMesh);
  }
  updateCamera();
  renderer.render(scene, camera);
}

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  if (state === 'playing') update(dt);
  else if (aliens.length) syncAlienMeshes();
  render();
  animationId = requestAnimationFrame(loop);
}

window.addEventListener('keydown', (e) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (['ArrowLeft', 'ArrowRight', ' ', 'a', 'd', 'r', 'f', 'Shift'].includes(k)) e.preventDefault();
  if (e.repeat) return;
  keys.add(k);
  if (k === 'r') startGame();
  if ((k === 'Shift' || k === 'f') && state === 'playing') fireSuperLaser();
  if ((k === ' ' || k === 'Spacebar') && state !== 'playing') startGame();
});
window.addEventListener('keyup', (e) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  keys.delete(k);
});
window.addEventListener('resize', resize);
startButton.addEventListener('click', startGame);

resize();
resetGame();
lastTime = performance.now();
animationId = requestAnimationFrame(loop);
