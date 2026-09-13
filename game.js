/**
 * Scary Invaders — Three.js 3D arcade (FULL ART REDO: battleship + metal bunkers + 4 alien types)
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

/* Four distinct Scary Invader types (cycle by row) */
const ALIEN_TYPES = ['stalker', 'crab', 'tendril', 'skitterer'];
const alienColors = [0x9b56d4, 0x9b56d4, 0xa83b82, 0xc5ba4f];
const alienHex = ['#9b56d4', '#9b56d4', '#a83b82', '#c5ba4f'];

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
  bomb: loadTex('assets/bomb_alien_00.png')
};

/* ---------- Mesh helpers ---------- */
function makePlayerMesh() {
  /* Advanced battleship — void-navy hull, twin +Z thrusters, spinal cannon −Z
   * Visual footprint ~1.4 × 0.6 × 2.0 (style-guide hitbox) */
  const g = new THREE.Group();
  const hull = new THREE.MeshBasicMaterial({ color: 0x7a9aa8 });
  const recess = new THREE.MeshBasicMaterial({ color: 0x1a1218 });
  const highlight = new THREE.MeshBasicMaterial({ color: 0xe5ffff });
  const cyan = new THREE.MeshBasicMaterial({ color: 0x70eaff });
  const ice = new THREE.MeshBasicMaterial({ color: 0x5cecff });
  const bloom = new THREE.MeshBasicMaterial({ color: 0xb8fbff });
  const panel = new THREE.MeshBasicMaterial({ color: 0x5a7a88 });

  const y0 = 0.32;

  /* Main hull */
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.28, 1.55), hull);
  body.position.set(0, y0, 0.05);
  const keel = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 1.7), recess);
  keel.position.set(0, y0 - 0.16, 0);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.55), panel);
  bridge.position.set(0, y0 + 0.2, 0.15);
  const bridgeTop = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.32), highlight);
  bridgeTop.position.set(0, y0 + 0.3, 0.12);

  /* Side sponsons */
  const sponL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.85), hull);
  sponL.position.set(-0.58, y0 - 0.02, 0.1);
  const sponR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.85), hull);
  sponR.position.set(0.58, y0 - 0.02, 0.1);
  const finL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.55), panel);
  finL.position.set(-0.72, y0 + 0.04, 0.25);
  const finR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.55), panel);
  finR.position.set(0.72, y0 + 0.04, 0.25);

  /* Panel lines / greebles (cam-facing +Z detail) */
  const seam1 = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.02, 0.02), recess);
  seam1.position.set(0, y0 + 0.12, 0.82);
  const seam2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 1.2), recess);
  seam2.position.set(0, y0, 0.05);
  const ventL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.08), recess);
  ventL.position.set(-0.28, y0 + 0.15, 0.78);
  const ventR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.08), recess);
  ventR.position.set(0.28, y0 + 0.15, 0.78);
  const rivetGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
  const rivets = [];
  for (const [rx, rz] of [[-0.4, 0.7], [0.4, 0.7], [-0.4, 0.4], [0.4, 0.4], [-0.4, 0.1], [0.4, 0.1]]) {
    const rv = new THREE.Mesh(rivetGeo, highlight);
    rv.position.set(rx, y0 + 0.15, rz);
    rivets.push(rv);
  }

  /* Twin rear thrusters facing +Z (camera) */
  const thrusterHousing = (x) => {
    const h = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.22, 10), recess);
    shell.rotation.x = Math.PI / 2;
    shell.position.set(0, 0, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 6, 12), cyan);
    ring.position.set(0, 0, 0.12);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.12, 8), bloom);
    core.rotation.x = Math.PI / 2;
    core.position.set(0, 0, 0.06);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), ice);
    glow.position.set(0, 0, 0.18);
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 8), cyan);
    plume.rotation.x = -Math.PI / 2;
    plume.position.set(0, 0, 0.38);
    h.add(shell, ring, core, glow, plume);
    h.position.set(x, y0, 0.95);
    return h;
  };
  const thrusterL = thrusterHousing(-0.32);
  const thrusterR = thrusterHousing(0.32);
  const thrusterLight = new THREE.PointLight(0x70eaff, 2.2, 6, 2);
  thrusterLight.position.set(0, y0, 1.15);

  /* Spinal cannon along −Z */
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.35), panel);
  stock.position.set(0, y0 + 0.02, -0.55);
  const tube = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.95), cyan);
  tube.position.set(0, y0 + 0.02, -1.05);
  const coreGun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.7), bloom);
  coreGun.position.set(0, y0 + 0.02, -1.0);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.22), ice);
  barrel.position.set(0, y0 + 0.02, -1.55);
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.08), bloom);
  muzzle.position.set(0, y0 + 0.02, -1.68);
  const gunRailsL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.8), recess);
  gunRailsL.position.set(-0.12, y0 + 0.08, -1.05);
  const gunRailsR = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.8), recess);
  gunRailsR.position.set(0.12, y0 + 0.08, -1.05);

  g.add(
    body, keel, bridge, bridgeTop, sponL, sponR, finL, finR,
    seam1, seam2, ventL, ventR, ...rivets,
    thrusterL, thrusterR, thrusterLight,
    stock, tube, coreGun, barrel, muzzle, gunRailsL, gunRailsR
  );
  g.userData.kind = 'battleship';
  g.userData.muzzleLocal = { x: 0, y: y0 + 0.02, z: -1.68 };
  g.userData.thrusterLight = thrusterLight;
  return g;
}

function mat(color, opts = {}) {
  return new THREE.MeshBasicMaterial({ color, ...opts });
}

function makeAlienMesh(typeId, color) {
  const g = new THREE.Group();
  const flesh = mat(0x3a1830);
  const armor = mat(0x2a1428);
  const violet = mat(color);
  const toxic = mat(0x75d36e);
  const eyeGlow = mat(0xffeb7a);
  const tooth = mat(0xe5ffff);

  if (typeId === 'stalker') {
    /* Tall thin toothed skeletal — purple eye */
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.55, 0.22), flesh);
    torso.position.set(0, 0.45, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.28), armor);
    head.position.set(0, 0.82, -0.02);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.22), flesh);
    jaw.position.set(0, 0.68, -0.12);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), violet);
    eye.position.set(0, 0.86, -0.14);
    const eyeCore = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 5), eyeGlow);
    eyeCore.position.set(0, 0.86, -0.18);
    for (const tx of [-0.08, 0, 0.08]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.04), tooth);
      t.position.set(tx, 0.64, -0.22);
      g.add(t);
    }
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.08), flesh);
    armL.position.set(-0.22, 0.4, 0);
    armL.rotation.z = 0.35;
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.08), flesh);
    armR.position.set(0.22, 0.4, 0);
    armR.rotation.z = -0.35;
    const clawL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), armor);
    clawL.position.set(-0.28, 0.12, -0.05);
    const clawR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), armor);
    clawR.position.set(0.28, 0.12, -0.05);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.35, 0.07), flesh);
    legL.position.set(-0.1, 0.12, 0.02);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.35, 0.07), flesh);
    legR.position.set(0.1, 0.12, 0.02);
    g.add(torso, head, jaw, eye, eyeCore, armL, armR, clawL, clawR, legL, legR);
  } else if (typeId === 'crab') {
    /* Wide armored shell — multi glow eyes */
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.28, 0.55), armor);
    shell.position.set(0, 0.42, 0);
    const dome = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.4), flesh);
    dome.position.set(0, 0.58, 0);
    const under = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.35), flesh);
    under.position.set(0, 0.22, 0);
    for (const [ex, ey] of [[-0.18, 0.48], [0, 0.52], [0.18, 0.48], [-0.1, 0.4], [0.1, 0.4]]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 5, 5), violet);
      e.position.set(ex, ey, -0.28);
      g.add(e);
    }
    const pincerL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.35), armor);
    pincerL.position.set(-0.48, 0.28, -0.15);
    pincerL.rotation.y = 0.4;
    const pincerR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.35), armor);
    pincerR.position.set(0.48, 0.28, -0.15);
    pincerR.rotation.y = -0.4;
    for (const sx of [-0.3, -0.1, 0.1, 0.3]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.28), flesh);
      leg.position.set(sx, 0.12, 0.1);
      leg.rotation.x = 0.5;
      g.add(leg);
    }
    g.add(shell, dome, under, pincerL, pincerR);
  } else if (typeId === 'tendril') {
    /* Floating sphere + tentacles — wrong purple eyes */
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), flesh);
    core.position.set(0, 0.45, 0);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), armor);
    shell.position.set(0, 0.45, 0);
    shell.scale.set(1, 0.85, 1);
    for (const [ex, ey, ez] of [[0, 0.55, -0.28], [-0.16, 0.42, -0.22], [0.16, 0.42, -0.22], [0, 0.35, -0.26]]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 5), violet);
      e.position.set(ex, ey, ez);
      g.add(e);
      const ec = new THREE.Mesh(new THREE.SphereGeometry(0.02, 4, 4), eyeGlow);
      ec.position.set(ex, ey, ez - 0.04);
      g.add(ec);
    }
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const tend = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.015, 0.55, 5), flesh);
      tend.position.set(Math.cos(ang) * 0.18, 0.12, Math.sin(ang) * 0.12);
      tend.rotation.z = Math.cos(ang) * 0.5;
      tend.rotation.x = 0.4 + Math.sin(ang) * 0.3;
      g.add(tend);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), violet);
      tip.position.set(Math.cos(ang) * 0.22, -0.12, Math.sin(ang) * 0.15);
      g.add(tip);
    }
    g.add(core, shell);
  } else {
    /* Winged skitterer — bat/insect wings, purple eye */
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.35, 0.28), flesh);
    body.position.set(0, 0.4, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.2), armor);
    head.position.set(0, 0.62, -0.05);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), violet);
    eye.position.set(0, 0.64, -0.14);
    const eyeCore = new THREE.Mesh(new THREE.SphereGeometry(0.028, 4, 4), eyeGlow);
    eyeCore.position.set(0, 0.64, -0.18);
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.35), armor);
    wingL.position.set(-0.4, 0.5, 0.05);
    wingL.rotation.z = 0.35;
    wingL.rotation.y = 0.25;
    const wingR = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.35), armor);
    wingR.position.set(0.4, 0.5, 0.05);
    wingR.rotation.z = -0.35;
    wingR.rotation.y = -0.25;
    const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.15), violet);
    wingTipL.position.set(-0.68, 0.55, 0.08);
    const wingTipR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.15), violet);
    wingTipR.position.set(0.68, 0.55, 0.08);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.05), flesh);
    legL.position.set(-0.08, 0.15, 0);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.05), flesh);
    legR.position.set(0.08, 0.15, 0);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 4), armor);
    spike.position.set(0, 0.78, 0);
    g.add(body, head, eye, eyeCore, wingL, wingR, wingTipL, wingTipR, legL, legR, spike);
  }

  g.userData.kind = 'alien';
  g.userData.typeId = typeId;
  return g;
}

function makeBarrierBlock(hp) {
  /* Metal bunker plate with lime energy fissures — not flat green cube / not rock */
  const g = new THREE.Group();
  const metal = mat(0x4a5560);
  const dark = mat(0x1a1218);
  const rim = mat(0x7a9aa8);
  const fissure = mat(0xb5ef68);

  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.18), metal);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.04), dark);
  back.position.z = 0.1;
  const boltTL = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.04), rim);
  boltTL.position.set(-0.07, 0.07, -0.08);
  const boltTR = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.04), rim);
  boltTR.position.set(0.07, 0.07, -0.08);
  const boltBL = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.04), rim);
  boltBL.position.set(-0.07, -0.07, -0.08);
  const boltBR = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.04), rim);
  boltBR.position.set(0.07, -0.07, -0.08);

  /* Jagged lime crack strips on front (−Z toward fleet / cam sees + face) */
  const crackA = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.03), fissure);
  crackA.position.set(-0.02, 0, -0.1);
  crackA.rotation.z = 0.25;
  const crackB = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.03), fissure);
  crackB.position.set(0.02, 0.04, -0.1);
  crackB.rotation.z = -0.4;
  const crackC = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.03), fissure);
  crackC.position.set(0.01, -0.05, -0.1);
  crackC.rotation.z = 0.55;

  g.add(plate, back, boltTL, boltTR, boltBL, boltBR, crackA, crackB, crackC);
  g.userData.fissures = [crackA, crackB, crackC];
  g.userData.plate = plate;
  applyBarrierHpLook(g, hp);
  return g;
}

function applyBarrierHpLook(mesh, hp) {
  const fissures = mesh.userData.fissures || [];
  const plate = mesh.userData.plate;
  if (hp >= 2) {
    for (const f of fissures) {
      f.visible = true;
      f.material.color.setHex(0xb5ef68);
      f.scale.set(1, 1, 1);
    }
    if (plate) plate.material.color.setHex(0x4a5560);
  } else if (hp === 1) {
    for (const f of fissures) {
      f.visible = true;
      f.material.color.setHex(0xffeb7a);
      f.scale.set(1.35, 1.35, 1.2);
    }
    if (plate) plate.material.color.setHex(0x3a3038);
  }
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
    w: 1.4,
    h: 0.6,
    d: 2.0,
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
      /* Cycle 4 distinct types by row so silhouettes vary across the fleet */
      const id = ALIEN_TYPES[r % ALIEN_TYPES.length];
      const color = alienColors[r % alienColors.length];
      const mesh = makeAlienMesh(id, color);
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
        const mesh = makeBarrierBlock(hp);
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
  const muzzle = playerMesh?.userData?.muzzleLocal || { x: 0, y: 0.34, z: -1.68 };
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
  applyBarrierHpLook(block.mesh, block.hp);
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
  /* Look toward fleet over battleship spine */
  camera.lookAt(camX * 0.35, 1.1, -6.5);
  playerRim.position.set(targetX, 0.9, 1.5);
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
