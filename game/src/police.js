// Tidewater Heat — police.js
// The wanted system: 0–5 stars, patrol cars that chase and ram, and foot
// officers who join the hunt at 3 stars and shoot on sight.

import * as THREE from "three";
import { ROAD_LINES } from "./city.js";
import { spawnCar } from "./vehicles.js";
import { startSiren, stopSiren } from "./audio.js";
import { damagePlayer } from "./player.js";

export function initPolice(G) {
  G.wanted = 0;
  G.lastCrimeTime = -999;
  G.lastDecayCheck = 0;
  G.policeCars = [];
  G.officers = [];
  G.addWanted = (n) => {
    if (n > 0) G.lastCrimeTime = G.time;
    const before = G.wanted;
    G.wanted = Math.max(0, Math.min(5, G.wanted + n));
    if (G.wanted > 0 && before === 0) startSiren();
    if (G.wanted === 0 && before > 0) stopSiren();
  };
  G.setWanted = (n) => {
    G.wanted = Math.max(0, Math.min(5, n));
    if (G.wanted > 0) { G.lastCrimeTime = G.time; startSiren(); }
    else stopSiren();
  };
}

function makeOfficerMesh() {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xc68e5e, roughness: 0.9 });
  const uniform = new THREE.MeshStandardMaterial({ color: 0x1c2f4a, roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x141c26, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.0, 0.45), uniform);
  torso.position.y = 1.15;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin);
  head.position.y = 1.95;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.18, 0.56),
    new THREE.MeshStandardMaterial({ color: 0x0e1a2a, roughness: 0.8 }));
  cap.position.y = 2.22;
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.04),
    new THREE.MeshStandardMaterial({ color: 0xffd34d, metalness: 0.8, roughness: 0.3 }));
  badge.position.set(-0.22, 1.3, 0.24);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.75, 0.4), pants);
  legL.position.set(-0.22, 0.38, 0);
  const legR = legL.clone();
  legR.position.x = 0.22;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.6 }));
  gun.position.set(0.5, 1.1, 0.35);
  group.add(torso, head, cap, badge, legL, legR, gun);
  group.userData.legL = legL;
  group.userData.legR = legR;
  return group;
}

function spawnOfficer(G, near) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 16 + Math.random() * 10;
  const x = near.x + Math.cos(angle) * dist;
  const z = near.z + Math.sin(angle) * dist;
  if (G.hitsBuilding(x, z, 1)) return null;
  const mesh = makeOfficerMesh();
  mesh.position.set(x, 0, z);
  G.scene.add(mesh);
  const cop = { mesh, health: 60, shootTimer: 1 + Math.random(), phase: 0, dead: false, deadTimer: 0 };
  G.officers.push(cop);
  return cop;
}

function spawnPoliceCar(G, near) {
  // Drop the cruiser on the nearest road, some distance away.
  const road = ROAD_LINES[Math.floor(Math.random() * ROAD_LINES.length)];
  const horizontal = Math.random() < 0.5;
  const along = THREE.MathUtils.clamp(horizontal ? near.x : near.z, -170, 170) + (Math.random() < 0.5 ? -55 : 55);
  const x = horizontal ? THREE.MathUtils.clamp(along, -180, 180) : road;
  const z = horizontal ? road : THREE.MathUtils.clamp(along, -180, 180);
  const car = spawnCar(G, "police", x, z, Math.random() * Math.PI * 2);
  G.policeCars.push(car);
  return car;
}

function removePoliceCar(G, car) {
  G.scene.remove(car.group);
  G.cars.splice(G.cars.indexOf(car), 1);
  G.policeCars.splice(G.policeCars.indexOf(car), 1);
}

function chasePlayer(G, car, dt) {
  const p = G.player;
  const target = p.inCar ? p.inCar.group.position : p.group.position;
  const pos = car.group.position;
  const dx = target.x - pos.x, dz = target.z - pos.z;
  const dist = Math.hypot(dx, dz);
  const wantHeading = Math.atan2(dx, dz);
  let diff = wantHeading - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.heading += THREE.MathUtils.clamp(diff, -2.2 * dt, 2.2 * dt);
  const cruise = dist > 60 ? car.spec.maxSpeed : car.spec.maxSpeed * 0.8;
  car.speed += (cruise - car.speed) * Math.min(1, 1.5 * dt);
  const nx = pos.x + Math.sin(car.heading) * car.speed * dt;
  const nz = pos.z + Math.cos(car.heading) * car.speed * dt;
  if (!G.hitsBuilding(nx, nz, 1.6)) {
    pos.x = nx;
    pos.z = nz;
  } else {
    // Bounced off a building: back up and swing around it.
    car.speed *= -0.3;
    car.heading += 0.9;
  }
  G.clampWorld(pos, 238);
  car.group.rotation.y = car.heading;
  const wheels = car.group.userData.wheels;
  if (wheels) for (const w of wheels) w.rotation.x += car.speed * dt * 2.2;

  // Ramming the player's car slows it and shakes the camera.
  if (p.inCar && dist < 4.2) {
    p.inCar.speed *= 0.94;
    if (Math.random() < 0.1) G.hudFlashDamage();
  }
}

export function updatePolice(G, dt) {
  if (G.state !== "playing") return;
  const p = G.player;
  const playerPos = p.inCar ? p.inCar.group.position : p.group.position;

  // Wanted decay: lay low for a while and the heat cools off.
  if (G.wanted > 0 && G.time - G.lastCrimeTime > 25) {
    G.lastDecayCheck += dt;
    const nearestCop = Math.min(
      ...G.policeCars.map((c) => c.group.position.distanceTo(playerPos)),
      ...G.officers.map((o) => o.mesh.position.distanceTo(playerPos)),
      999
    );
    if (G.lastDecayCheck > 12 && nearestCop > 35) {
      G.lastDecayCheck = 0;
      G.addWanted(-1);
      if (G.wanted === 0) G.addMessage("You lost the cops. Clean.");
      else G.addMessage(`Heat cooling… ${G.wanted} star${G.wanted > 1 ? "s" : ""} left.`);
    }
  } else {
    G.lastDecayCheck = 0;
  }

  // Patrol cars: one per star, up to five.
  const wantCars = G.wanted;
  while (G.policeCars.length < wantCars) spawnPoliceCar(G, playerPos);
  while (G.policeCars.length > wantCars) removePoliceCar(G, G.policeCars[G.policeCars.length - 1]);
  for (const car of G.policeCars) chasePlayer(G, car, dt);

  // Foot officers join at 3 stars: two per star above two.
  const wantCops = G.wanted >= 3 ? (G.wanted - 2) * 2 : 0;
  const aliveCops = G.officers.filter((o) => !o.dead).length;
  G._officerTimer = (G._officerTimer || 0) + dt;
  if (aliveCops < wantCops && G._officerTimer > 0.8) {
    G._officerTimer = 0;
    spawnOfficer(G, playerPos);
  }
  if (wantCops === 0) {
    for (const o of G.officers) { if (!o.dead) { o.dead = true; o.deadTimer = 0.5; } }
  }
  for (let i = G.officers.length - 1; i >= 0; i--) {
    const cop = G.officers[i];
    if (cop.dead) {
      cop.deadTimer -= dt;
      if (cop.deadTimer <= 0) {
        G.scene.remove(cop.mesh);
        G.officers.splice(i, 1);
      }
      continue;
    }
    const pos = cop.mesh.position;
    const toPlayer = playerPos.clone().sub(pos);
    const dist = toPlayer.length();
    cop.mesh.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
    if (dist > 14) {
      const step = 5.4 * dt;
      const nx = pos.x + (toPlayer.x / dist) * step;
      const nz = pos.z + (toPlayer.z / dist) * step;
      if (!G.hitsBuilding(nx, pos.z, 0.7)) pos.x = nx;
      if (!G.hitsBuilding(pos.x, nz, 0.7)) pos.z = nz;
      cop.phase += dt * 10;
      cop.mesh.userData.legL.rotation.x = Math.sin(cop.phase) * 0.7;
      cop.mesh.userData.legR.rotation.x = -Math.sin(cop.phase) * 0.7;
    }
    if (dist < 28 && !p.inCar) {
      cop.shootTimer -= dt;
      if (cop.shootTimer <= 0) {
        cop.shootTimer = 0.9 + Math.random() * 0.6;
        const from = pos.clone().add(new THREE.Vector3(0, 1.4, 0));
        const to = playerPos.clone().add(new THREE.Vector3(0, 1.2, 0));
        const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x88aaff, transparent: true, opacity: 0.9 }));
        G.scene.add(line);
        G.tracers.push({ line, life: 0.08 });
        if (Math.random() < Math.max(0.1, 0.45 - dist * 0.01)) {
          damagePlayer(G, 4 + Math.floor(Math.random() * 4));
        }
      }
    }
  }
}
