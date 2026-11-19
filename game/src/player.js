// Tidewater Heat — player.js
// Rico "Reef" Marlowe on foot: third-person movement, jumping, camera,
// health and damage. Driving lives in vehicles.js; this file owns the
// camera whenever Rico is on foot.

import * as THREE from "three";

const WALK_SPEED = 6;
const SPRINT_SPEED = 10.5;

export function buildPlayer(G) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xc68e5e, roughness: 0.8 });
  const jacket = new THREE.MeshStandardMaterial({ color: 0x1e6f8e, roughness: 0.8 });
  const jeans = new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.9 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x201510, roughness: 1 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.05, 0.45), jacket);
  torso.position.y = 1.15;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin);
  head.position.y = 1.95;
  head.castShadow = true;
  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.16, 0.54), hair);
  hairTop.position.y = 2.2;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.75, 0.4), jeans);
  legL.position.set(-0.22, 0.38, 0);
  const legR = legL.clone();
  legR.position.x = 0.22;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.85, 0.32), jacket);
  armL.position.set(-0.58, 1.2, 0);
  const armR = armL.clone();
  armR.position.x = 0.58;
  // The pistol in his right hand, always drawn.
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.16, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.6 })
  );
  gun.position.set(0.58, 0.85, 0.3);
  group.add(torso, head, hairTop, legL, legR, armL, armR, gun);
  group.position.set(0, 0, 20);
  G.scene.add(group);

  G.player = {
    group,
    legL,
    legR,
    armL,
    armR,
    heading: Math.PI,
    velY: 0,
    onGround: true,
    health: 100,
    maxHealth: 100,
    inCar: null,
    weapon: "pistol",
    ammo: { pistol: 12, smg: 30, shotgun: 6 },
    reserve: { pistol: 48, smg: 120, shotgun: 24 },
    lastHurt: -99,
    walkPhase: 0,
    moving: false,
  };
  G.camYaw = Math.PI;
  G.camPitch = 0.32;
  return G.player;
}

export function damagePlayer(G, amount) {
  const p = G.player;
  if (G.state !== "playing" || p.health <= 0) return;
  p.health = Math.max(0, p.health - amount);
  p.lastHurt = G.time;
  G.hudFlashDamage();
  if (p.health <= 0) G.onPlayerDeath();
}

export function healPlayer(G, amount) {
  const p = G.player;
  p.health = Math.min(p.maxHealth, p.health + amount);
}

function tryMove(G, dx, dz) {
  const p = G.player;
  const pos = p.group.position;
  const r = 0.7;
  if (!G.hitsBuilding(pos.x + dx, pos.z, r)) pos.x += dx;
  if (!G.hitsBuilding(pos.x, pos.z + dz, r)) pos.z += dz;
  G.clampWorld(pos, 238);
}

export function updatePlayer(G, dt) {
  const p = G.player;
  if (!p) return;

  // Slow health regen once the heat is off.
  if (G.state === "playing" && p.health > 0 && p.health < p.maxHealth &&
      G.time - p.lastHurt > 6 && G.wanted === 0) {
    p.health = Math.min(p.maxHealth, p.health + 3 * dt);
  }

  if (G.state !== "playing" || p.inCar) return;

  const keys = G.keys;
  let ix = 0, iz = 0;
  if (keys.has("KeyW")) iz -= 1;
  if (keys.has("KeyS")) iz += 1;
  if (keys.has("KeyA")) ix -= 1;
  if (keys.has("KeyD")) ix += 1;
  const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const speed = sprint ? SPRINT_SPEED : WALK_SPEED;

  p.moving = ix !== 0 || iz !== 0;
  if (p.moving) {
    // Movement is relative to the camera yaw.
    const sin = Math.sin(G.camYaw), cos = Math.cos(G.camYaw);
    const mx = (ix * cos - iz * sin);
    const mz = (ix * sin + iz * cos);
    const len = Math.hypot(mx, mz) || 1;
    const dx = (mx / len) * speed * dt;
    const dz = (mz / len) * speed * dt;
    tryMove(G, dx, dz);
    const targetHeading = Math.atan2(mx, mz);
    let diff = targetHeading - p.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    p.heading += diff * Math.min(1, 12 * dt);
    p.walkPhase += dt * (sprint ? 13 : 9);
    p.legL.rotation.x = Math.sin(p.walkPhase) * 0.7;
    p.legR.rotation.x = -Math.sin(p.walkPhase) * 0.7;
    p.armL.rotation.x = -Math.sin(p.walkPhase) * 0.4;
    p.armR.rotation.x = Math.sin(p.walkPhase) * 0.4;
  } else {
    p.legL.rotation.x *= 0.8;
    p.legR.rotation.x *= 0.8;
    p.armL.rotation.x *= 0.8;
    p.armR.rotation.x *= 0.8;
  }
  p.group.rotation.y = p.heading;

  // Jump + gravity.
  if (keys.has("Space") && p.onGround) {
    p.velY = 7;
    p.onGround = false;
  }
  if (!p.onGround) {
    p.velY -= 22 * dt;
    p.group.position.y += p.velY * dt;
    if (p.group.position.y <= 0) {
      p.group.position.y = 0;
      p.velY = 0;
      p.onGround = true;
    }
  }

  updateFootCamera(G, dt);
}

export function updateFootCamera(G, dt) {
  const p = G.player;
  const pos = p.group.position;
  // Without a captured mouse the camera drifts back behind Rico.
  if (!G.pointerLocked) {
    let diff = p.heading + Math.PI - G.camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    G.camYaw += diff * Math.min(1, 1.5 * dt);
  }
  const dist = 7.5;
  const cx = pos.x + Math.sin(G.camYaw) * Math.cos(G.camPitch) * dist;
  const cz = pos.z + Math.cos(G.camYaw) * Math.cos(G.camPitch) * dist;
  const cy = pos.y + 2 + Math.sin(G.camPitch) * dist;
  G.camera.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, 8 * dt));
  G.camera.lookAt(pos.x, pos.y + 1.6, pos.z);
}
