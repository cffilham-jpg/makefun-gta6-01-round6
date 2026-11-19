// Tidewater Heat — pedestrians.js
// Twenty locals walking the sidewalks. They stroll between waypoints,
// flee from gunfire and speeding cars, and go down if hit.

import * as THREE from "three";
import { ROAD_LINES } from "./city.js";

const SHIRTS = [0xd8d8d8, 0xe8a34d, 0x4da8e8, 0xe84d6a, 0x6ad84d, 0xb06ad8, 0x4dd8c8, 0xe8e84d];
const PED_COUNT = 20;

function makePedMesh(shirtColor) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: [0xc68e5e, 0x8a5a3a, 0xe8b88a, 0x6b4423][Math.floor(Math.random() * 4)], roughness: 0.9 });
  const shirt = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x30343c, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.38), shirt);
  torso.position.y = 1.05;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), skin);
  head.position.y = 1.75;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.65, 0.34), pants);
  legL.position.set(-0.18, 0.33, 0);
  const legR = legL.clone();
  legR.position.x = 0.18;
  group.add(torso, head, legL, legR);
  group.userData.legL = legL;
  group.userData.legR = legR;
  return group;
}

function randomSidewalkSpot() {
  const road = ROAD_LINES[Math.floor(Math.random() * ROAD_LINES.length)];
  const along = -175 + Math.random() * 350;
  const side = Math.random() < 0.5 ? -1 : 1;
  const horizontal = Math.random() < 0.5;
  return {
    x: horizontal ? along : road + side * 7.6,
    z: horizontal ? road + side * 7.6 : along,
  };
}

export function spawnPed(G, spot) {
  const at = spot || randomSidewalkSpot();
  const mesh = makePedMesh(SHIRTS[Math.floor(Math.random() * SHIRTS.length)]);
  mesh.position.set(at.x, 0, at.z);
  G.scene.add(mesh);
  const target = randomSidewalkSpot();
  const ped = {
    mesh, target, speed: 1.4 + Math.random() * 0.7,
    fleeUntil: 0, fleeFrom: null, down: false, downTimer: 0, phase: Math.random() * 6,
  };
  G.peds.push(ped);
  return ped;
}

export function initPedestrians(G) {
  G.peds = [];
  for (let i = 0; i < PED_COUNT; i++) spawnPed(G);
}

export function knockPedDown(G, ped, byPlayer) {
  if (ped.down) return;
  ped.down = true;
  ped.downTimer = 8;
  ped.mesh.rotation.x = -Math.PI / 2;
  ped.mesh.position.y = 0.4;
  if (byPlayer) {
    G.addWanted(1);
    G.addMessage("Pedestrian down! (+1 star)");
  }
}

export function updatePedestrians(G, dt) {
  const playerPos = G.player.group.position;
  const playerCar = G.player.inCar;
  for (let i = G.peds.length - 1; i >= 0; i--) {
    const ped = G.peds[i];
    if (ped.down) {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        G.scene.remove(ped.mesh);
        G.peds.splice(i, 1);
        spawnPed(G);
      }
      continue;
    }
    const pos = ped.mesh.position;

    // Flee triggers: recent gunfire nearby, or a fast car closing in.
    if (G.lastShotPos && G.time - G.lastShotTime < 2.5) {
      if (pos.distanceTo(G.lastShotPos) < 28) {
        ped.fleeUntil = G.time + 3;
        ped.fleeFrom = G.lastShotPos.clone();
      }
    }
    if (playerCar && Math.abs(playerCar.speed) > 6) {
      const carPos = playerCar.group.position;
      if (pos.distanceTo(carPos) < 9) {
        ped.fleeUntil = G.time + 2.5;
        ped.fleeFrom = carPos.clone();
      }
    }

    let mx = 0, mz = 0, speed = ped.speed;
    if (G.time < ped.fleeUntil && ped.fleeFrom) {
      mx = pos.x - ped.fleeFrom.x;
      mz = pos.z - ped.fleeFrom.z;
      const len = Math.hypot(mx, mz) || 1;
      mx /= len; mz /= len;
      speed = 5.2;
    } else {
      mx = ped.target.x - pos.x;
      mz = ped.target.z - pos.z;
      const dist = Math.hypot(mx, mz);
      if (dist < 2) {
        ped.target = randomSidewalkSpot();
      } else {
        mx /= dist; mz /= dist;
      }
    }

    const nx = pos.x + mx * speed * dt;
    const nz = pos.z + mz * speed * dt;
    if (!G.hitsBuilding(nx, pos.z, 0.6)) pos.x = nx;
    if (!G.hitsBuilding(pos.x, nz, 0.6)) pos.z = nz;
    G.clampWorld(pos, 238);
    if (mx !== 0 || mz !== 0) {
      ped.mesh.rotation.y = Math.atan2(mx, mz);
    }
    ped.phase += dt * speed * 3.2;
    ped.mesh.userData.legL.rotation.x = Math.sin(ped.phase) * 0.6;
    ped.mesh.userData.legR.rotation.x = -Math.sin(ped.phase) * 0.6;

    // Run over by the player's car.
    if (playerCar && Math.abs(playerCar.speed) > 5) {
      if (pos.distanceTo(playerCar.group.position) < 2.1) {
        knockPedDown(G, ped, true);
      }
    }
  }
}
