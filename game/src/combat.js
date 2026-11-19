// Tidewater Heat — combat.js
// Three weapons, raycast shooting with tracers and muzzle flash, and the
// gang members who guard the pier and the warehouse.

import * as THREE from "three";
import { playShoot, playEnemyShoot, playReload } from "./audio.js";
import { damagePlayer } from "./player.js";
import { knockPedDown } from "./pedestrians.js";

export const WEAPONS = {
  pistol:  { name: "PISTOL",  damage: 34, interval: 0.28, mag: 12, spread: 0.012, pellets: 1, range: 90 },
  smg:     { name: "SMG",     damage: 14, interval: 0.09, mag: 30, spread: 0.03,  pellets: 1, range: 70 },
  shotgun: { name: "SHOTGUN", damage: 12, interval: 0.85, mag: 6,  spread: 0.07,  pellets: 6, range: 40 },
};

const raycaster = new THREE.Raycaster();

function makeEnemyMesh() {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.9 });
  const jacket = new THREE.MeshStandardMaterial({ color: 0x8e1e1e, roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.0, 0.45), jacket);
  torso.position.y = 1.15;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin);
  head.position.y = 1.95;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.16, 0.56),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1 }));
  cap.position.y = 2.2;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.75, 0.4), pants);
  legL.position.set(-0.22, 0.38, 0);
  const legR = legL.clone();
  legR.position.x = 0.22;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.55),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.6 }));
  gun.position.set(0.5, 1.1, 0.35);
  // Health bar floating above the head.
  const barBg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.14),
    new THREE.MeshBasicMaterial({ color: 0x220000, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  barBg.position.y = 2.6;
  const barFg = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.1),
    new THREE.MeshBasicMaterial({ color: 0xff3333, side: THREE.DoubleSide }));
  barFg.position.y = 2.6;
  barFg.position.z = 0.01;
  group.add(torso, head, cap, legL, legR, gun, barBg, barFg);
  group.userData.barFg = barFg;
  group.userData.legL = legL;
  group.userData.legR = legR;
  return group;
}

export function spawnEnemy(G, x, z) {
  const mesh = makeEnemyMesh();
  mesh.position.set(x, 0, z);
  G.scene.add(mesh);
  const enemy = { mesh, health: 100, maxHealth: 100, shootTimer: 1 + Math.random(), phase: Math.random() * 6, dead: false, deadTimer: 0 };
  G.enemies.push(enemy);
  return enemy;
}

export function spawnEnemiesAt(G, x, z, count, spread = 8) {
  const made = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    made.push(spawnEnemy(G, x + Math.cos(angle) * spread, z + Math.sin(angle) * spread));
  }
  return made;
}

export function enemiesAlive(G) {
  return G.enemies.filter((e) => !e.dead).length;
}

export function clearEnemies(G) {
  for (const e of G.enemies) G.scene.remove(e.mesh);
  G.enemies = [];
}

function spawnTracer(G, from, to, color = 0xffe08a) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  G.scene.add(line);
  G.tracers.push({ line, life: 0.08 });
}

function spawnHitPuff(G, pos, color = 0xff5544) {
  const puff = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 6, 5),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
  );
  puff.position.copy(pos);
  G.scene.add(puff);
  G.tracers.push({ line: puff, life: 0.25 });
}

function muzzleFlash(G) {
  const flash = new THREE.PointLight(0xffc860, 14, 9, 2);
  const p = G.player.group.position;
  flash.position.set(p.x, p.y + 1.4, p.z);
  G.scene.add(flash);
  G.tracers.push({ line: flash, life: 0.06 });
}

export function playerShoot(G) {
  const p = G.player;
  if (G.state !== "playing" || p.health <= 0) return;
  const weapon = WEAPONS[p.weapon];
  if (G.time < (p.nextShotAt || 0)) return;
  if (p.ammo[p.weapon] <= 0) {
    reloadWeapon(G);
    return;
  }
  p.nextShotAt = G.time + weapon.interval;
  p.ammo[p.weapon]--;
  playShoot(p.weapon);
  muzzleFlash(G);
  G.lastShotPos = p.group.position.clone();
  G.lastShotTime = G.time;
  G.addWanted(0); // Firing in the open draws attention over time, see police.js.
  G.shotsFired = (G.shotsFired || 0) + 1;

  const origin = G.camera.position.clone();
  for (let i = 0; i < weapon.pellets; i++) {
    const dir = new THREE.Vector3(
      (Math.random() - 0.5) * weapon.spread * 2,
      (Math.random() - 0.5) * weapon.spread * 2,
      -1
    ).normalize().applyQuaternion(G.camera.quaternion);
    raycaster.set(origin, dir);
    raycaster.far = weapon.range;
    const targets = [];
    for (const e of G.enemies) if (!e.dead) targets.push(e.mesh);
    for (const ped of G.peds) if (!ped.down) targets.push(ped.mesh);
    for (const car of G.cars) targets.push(car.group);
    for (const cop of G.officers || []) if (!cop.dead) targets.push(cop.mesh);
    const hits = raycaster.intersectObjects(targets, true);
    let end = origin.clone().add(dir.clone().multiplyScalar(weapon.range));
    if (hits.length > 0) {
      const hit = hits[0];
      end = hit.point.clone();
      let root = hit.object;
      while (root.parent && root.parent !== G.scene) root = root.parent;
      const enemy = G.enemies.find((e) => e.mesh === root);
      const ped = G.peds.find((q) => q.mesh === root);
      const cop = (G.officers || []).find((o) => o.mesh === root);
      if (enemy) damageEnemy(G, enemy, weapon.damage, hit.point);
      else if (ped) { knockPedDown(G, ped, true); spawnHitPuff(G, hit.point); }
      else if (cop) damageOfficer(G, cop, weapon.damage, hit.point);
      else spawnHitPuff(G, hit.point, 0xffcc66);
    }
    spawnTracer(G, p.group.position.clone().add(new THREE.Vector3(0, 1.4, 0)), end);
  }
  // Every shot in public risks a star once police are already watching.
  if (G.wanted > 0 && Math.random() < 0.05) G.addWanted(1);
}

export function reloadWeapon(G) {
  const p = G.player;
  const weapon = WEAPONS[p.weapon];
  const need = weapon.mag - p.ammo[p.weapon];
  const have = p.reserve[p.weapon];
  if (need <= 0 || have <= 0) return;
  const take = Math.min(need, have);
  p.ammo[p.weapon] += take;
  p.reserve[p.weapon] -= take;
  playReload();
  G.addMessage(`${weapon.name} reloaded.`);
}

export function switchWeapon(G, key) {
  const p = G.player;
  const next = key === "Digit1" ? "pistol" : key === "Digit2" ? "smg" : "shotgun";
  if (p.weapon !== next) {
    p.weapon = next;
    playReload();
  }
}

function damageEnemy(G, enemy, amount, point) {
  enemy.health -= amount;
  spawnHitPuff(G, point);
  if (enemy.health <= 0 && !enemy.dead) {
    enemy.dead = true;
    enemy.deadTimer = 4;
    enemy.mesh.rotation.x = -Math.PI / 2;
    enemy.mesh.position.y = 0.4;
    G.missionKills = (G.missionKills || 0) + 1;
    G.addMessage("Gang member down!");
  }
}

function damageOfficer(G, cop, amount, point) {
  cop.health -= amount;
  spawnHitPuff(G, point);
  if (cop.health <= 0 && !cop.dead) {
    cop.dead = true;
    cop.deadTimer = 4;
    cop.mesh.rotation.x = -Math.PI / 2;
    cop.mesh.position.y = 0.4;
    G.addWanted(1);
    G.addMessage("Officer down! (+1 star)");
  }
}

function enemyShootAt(G, enemy, targetPos) {
  const from = enemy.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0));
  const to = targetPos.clone().add(new THREE.Vector3(0, 1.2, 0));
  const dist = from.distanceTo(to);
  // Accuracy falls off with distance; point-blank shots usually land.
  const hitChance = Math.max(0.12, 0.55 - dist * 0.012);
  spawnTracer(G, from, to, 0xff8866);
  playEnemyShoot();
  if (Math.random() < hitChance) {
    damagePlayer(G, 5 + Math.floor(Math.random() * 5));
  }
}

export function updateCombat(G, dt) {
  // Fade out tracers, puffs and muzzle flashes.
  for (let i = G.tracers.length - 1; i >= 0; i--) {
    const t = G.tracers[i];
    t.life -= dt;
    if (t.life <= 0) {
      G.scene.remove(t.line);
      G.tracers.splice(i, 1);
    }
  }
  if (G.state !== "playing") return;

  const p = G.player;
  const playerPos = p.inCar ? p.inCar.group.position : p.group.position;

  // Hold mouse (or F) to keep firing.
  if (G.mouseDown || G.keys.has("KeyF")) playerShoot(G);
  if (G.consumeKey && G.consumeKey("KeyR")) reloadWeapon(G);
  for (const k of ["Digit1", "Digit2", "Digit3"]) {
    if (G.consumeKey && G.consumeKey(k)) switchWeapon(G, k);
  }

  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (e.dead) {
      e.deadTimer -= dt;
      if (e.deadTimer <= 0) {
        G.scene.remove(e.mesh);
        G.enemies.splice(i, 1);
      }
      continue;
    }
    const pos = e.mesh.position;
    const toPlayer = playerPos.clone().sub(pos);
    const dist = toPlayer.length();
    // Face the player and close in until within firing range.
    e.mesh.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
    if (dist > 22 && dist < 90) {
      const step = 4.2 * dt;
      const nx = pos.x + (toPlayer.x / dist) * step;
      const nz = pos.z + (toPlayer.z / dist) * step;
      if (!G.hitsBuilding(nx, pos.z, 0.7)) pos.x = nx;
      if (!G.hitsBuilding(pos.x, nz, 0.7)) pos.z = nz;
      e.phase += dt * 9;
      e.mesh.userData.legL.rotation.x = Math.sin(e.phase) * 0.6;
      e.mesh.userData.legR.rotation.x = -Math.sin(e.phase) * 0.6;
    }
    if (dist < 34) {
      e.shootTimer -= dt;
      if (e.shootTimer <= 0) {
        e.shootTimer = 0.7 + Math.random() * 0.7;
        enemyShootAt(G, e, playerPos);
      }
    }
    // Health bar follows the camera.
    e.mesh.userData.barFg.scale.x = Math.max(0.02, e.health / e.maxHealth);
    e.mesh.userData.barFg.position.x = -(1.06 * (1 - e.health / e.maxHealth)) / 2;
  }
}
