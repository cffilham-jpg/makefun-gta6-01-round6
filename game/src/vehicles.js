// Tidewater Heat — vehicles.js
// Cars: five types, arcade handling, traffic that follows the road grid,
// parked cars to steal, and the enter/exit flow on the E key.

import * as THREE from "three";
import { ROAD_LINES } from "./city.js";
import { playCrash, setEngine } from "./audio.js";

export const CAR_TYPES = {
  sedan:  { color: 0x8a2f2f, w: 1.9, l: 4.4, maxSpeed: 27, accel: 15 },
  taxi:   { color: 0xe8c832, w: 1.9, l: 4.4, maxSpeed: 27, accel: 15 },
  truck:  { color: 0x3a6ea8, w: 2.2, l: 5.6, maxSpeed: 19, accel: 10 },
  sport:  { color: 0xd83a5e, w: 1.85, l: 4.2, maxSpeed: 39, accel: 22 },
  police: { color: 0x1c2733, w: 1.95, l: 4.5, maxSpeed: 33, accel: 18 },
};

function makeCarMesh(type) {
  const spec = CAR_TYPES[type];
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.35, metalness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x101c26, roughness: 0.15, metalness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.w, 0.75, spec.l), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.85, 0.6, spec.l * 0.5), glass);
  cabin.position.set(0, 1.2, -spec.l * 0.05);
  cabin.castShadow = true;
  group.add(body, cabin);

  if (type === "police") {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 1.4 }));
    red.position.x = -0.35;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 1.4 }));
    blue.position.x = 0.35;
    bar.add(red, blue);
    bar.position.y = 1.58;
    group.add(bar);
    group.userData.lightBar = bar;
    const doors = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 0.04, 0.5, spec.l * 0.55),
      new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4, metalness: 0.3 }));
    doors.position.y = 0.55;
    group.add(doors);
  }
  if (type === "taxi") {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xfff6a0, emissive: 0xccbb44, emissiveIntensity: 0.6 }));
    sign.position.y = 1.6;
    group.add(sign);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const wheels = [];
  for (const [wx, wz] of [[-spec.w / 2, spec.l / 3], [spec.w / 2, spec.l / 3], [-spec.w / 2, -spec.l / 3], [spec.w / 2, -spec.l / 3]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  // Headlights.
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff8cc, emissive: 0xfff2a0, emissiveIntensity: 0.9 });
  for (const hx of [-spec.w / 3, spec.w / 3]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.06), lightMat);
    hl.position.set(hx, 0.6, spec.l / 2 + 0.01);
    group.add(hl);
  }
  group.userData.wheels = wheels;
  return group;
}

export function spawnCar(G, type, x, z, heading, opts = {}) {
  const spec = CAR_TYPES[type];
  const group = makeCarMesh(type);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  G.scene.add(group);
  const car = {
    group, type, spec,
    heading, speed: 0,
    isTraffic: !!opts.traffic,
    isPolice: type === "police",
    isParked: !!opts.parked,
    axis: opts.axis || "x",
    dir: opts.dir || 1,
    lane: opts.lane || 0,
    cruise: opts.cruise || 9,
    aiTarget: null,
    stuck: 0,
  };
  G.cars.push(car);
  return car;
}

export function initVehicles(G) {
  G.cars = [];
  // Parked cars along the road edges, ready to steal.
  const types = ["sedan", "sedan", "taxi", "truck", "sport", "sedan", "taxi"];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 14; i++) {
    const road = ROAD_LINES[Math.floor(rnd() * ROAD_LINES.length)];
    const along = -170 + rnd() * 340;
    const side = rnd() < 0.5 ? -1 : 1;
    const horizontal = rnd() < 0.5;
    const x = horizontal ? along : road + side * 8.5;
    const z = horizontal ? road + side * 8.5 : along;
    if (G.hitsBuilding(x, z, 1.6)) continue;
    spawnCar(G, types[i % types.length], x, z, horizontal ? Math.PI / 2 : 0, { parked: true });
  }
  // Traffic: a dozen cars cruising the grid.
  for (let i = 0; i < 12; i++) {
    const road = ROAD_LINES[Math.floor(rnd() * ROAD_LINES.length)];
    const along = -180 + rnd() * 360;
    const horizontal = rnd() < 0.5;
    const dir = rnd() < 0.5 ? -1 : 1;
    const lane = dir > 0 ? 3 : -3;
    spawnCar(G, ["sedan", "taxi", "truck"][i % 3],
      horizontal ? along : road + lane,
      horizontal ? road + lane : along,
      horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
      { traffic: true, axis: horizontal ? "x" : "z", dir, lane, cruise: 8 + rnd() * 4 });
  }
}

export function nearestCar(G, pos, maxDist) {
  let best = null, bestD = maxDist;
  for (const car of G.cars) {
    if (car.isPolice) continue;
    const d = car.group.position.distanceTo(pos);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

function carCollides(G, car, nx, nz) {
  const r = Math.max(car.spec.w, 2.4) / 2 + 0.4;
  return G.hitsBuilding(nx, nz, r);
}

function pushCarsApart(G) {
  const cars = G.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i].group.position, b = cars[j].group.position;
      const dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = 3.4;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const nx = dx / d, nz = dz / d;
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
        cars[i].speed *= 0.6;
        cars[j].speed *= 0.6;
      }
    }
  }
}

function driveCar(G, car, dt) {
  const keys = G.keys;
  const spec = car.spec;
  const forward = keys.has("KeyW") || keys.has("ArrowUp");
  const back = keys.has("KeyS") || keys.has("ArrowDown");
  const left = keys.has("KeyA") || keys.has("ArrowLeft");
  const right = keys.has("KeyD") || keys.has("ArrowRight");
  const brake = keys.has("Space");

  if (forward) car.speed += spec.accel * dt;
  else if (back) car.speed -= (car.speed > 0.5 ? spec.accel * 1.4 : spec.accel * 0.5) * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 4 * dt);
  if (brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 22 * dt);
  car.speed = Math.max(-9, Math.min(spec.maxSpeed, car.speed));

  const steer = (left ? 1 : 0) - (right ? 1 : 0);
  const steerAuthority = Math.min(1, Math.abs(car.speed) / 6);
  car.heading += steer * 1.9 * steerAuthority * Math.sign(car.speed || 1) * dt;

  moveCarBody(G, car, dt, true);
}

function moveCarBody(G, car, dt, playerDriven) {
  const nx = car.group.position.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.group.position.z + Math.cos(car.heading) * car.speed * dt;
  if (carCollides(G, car, nx, nz)) {
    if (Math.abs(car.speed) > 8 && playerDriven) playCrash();
    car.speed *= -0.25;
    return;
  }
  car.group.position.x = nx;
  car.group.position.z = nz;
  G.clampWorld(car.group.position, 238);
  car.group.rotation.y = car.heading;
  const wheels = car.group.userData.wheels;
  if (wheels) for (const w of wheels) w.rotation.x += car.speed * dt * 2.2;
}

function driveTraffic(G, car, dt) {
  // Cruise along the assigned road; slow down for the car ahead.
  let target = car.cruise;
  for (const other of G.cars) {
    if (other === car) continue;
    const dx = other.group.position.x - car.group.position.x;
    const dz = other.group.position.z - car.group.position.z;
    const ahead = car.axis === "x" ? dx * car.dir : dz * car.dir;
    const lateral = car.axis === "x" ? Math.abs(dz) : Math.abs(dx);
    if (ahead > 0 && ahead < 10 && lateral < 3) { target = 0; break; }
  }
  car.speed += (target - car.speed) * Math.min(1, 2 * dt);
  const p = car.group.position;
  if (car.axis === "x") {
    p.x += car.dir * car.speed * dt;
    if (p.x > 185) p.x = -185;
    if (p.x < -185) p.x = 185;
  } else {
    p.z += car.dir * car.speed * dt;
    if (p.z > 185) p.z = -185;
    if (p.z < -185) p.z = 185;
  }
  car.group.rotation.y = car.heading;
  const wheels = car.group.userData.wheels;
  if (wheels) for (const w of wheels) w.rotation.x += car.speed * dt * 2.2;
}

function updateDriveCamera(G, dt) {
  const car = G.player.inCar;
  const pos = car.group.position;
  const back = 10.5 + Math.abs(car.speed) * 0.08;
  const cx = pos.x - Math.sin(car.heading) * back;
  const cz = pos.z - Math.cos(car.heading) * back;
  G.camera.position.lerp(new THREE.Vector3(cx, 4.6, cz), Math.min(1, 5 * dt));
  G.camera.lookAt(pos.x, pos.y + 1.4, pos.z);
  const targetFov = 60 + Math.abs(car.speed) * 0.35;
  if (Math.abs(G.camera.fov - targetFov) > 0.5) {
    G.camera.fov += (targetFov - G.camera.fov) * Math.min(1, 3 * dt);
    G.camera.updateProjectionMatrix();
  }
  G.camYaw = car.heading + Math.PI;
}

export function enterCar(G, car) {
  const p = G.player;
  p.inCar = car;
  car.isParked = false;
  car.isTraffic = false;
  p.group.visible = false;
  G.camera.fov = 60;
  G.camera.updateProjectionMatrix();
}

export function exitCar(G) {
  const p = G.player;
  const car = p.inCar;
  if (!car) return;
  const side = car.group.position.clone();
  side.x += Math.cos(car.heading) * 2.6;
  side.z -= Math.sin(car.heading) * 2.6;
  if (G.hitsBuilding(side.x, side.z, 0.8)) {
    side.x = car.group.position.x - Math.cos(car.heading) * 2.6;
    side.z = car.group.position.z + Math.sin(car.heading) * 2.6;
  }
  p.group.position.copy(side);
  p.group.position.y = 0;
  p.heading = car.heading;
  p.group.visible = true;
  p.inCar = null;
  car.speed *= 0.4;
  setEngine(false, 0);
}

export function updateVehicles(G, dt) {
  const p = G.player;

  // E: steal / enter the nearest car, or step out of the current one.
  if (G.consumeKey && G.consumeKey("KeyE") && G.state === "playing") {
    if (p.inCar) {
      exitCar(G);
      G.addMessage("You left the car.");
    } else {
      const car = nearestCar(G, p.group.position, 4.2);
      if (car) {
        enterCar(G, car);
        G.addWanted(1);
        G.addMessage("Car stolen! The cops noticed. (+1 star)");
      }
    }
  }

  for (const car of G.cars) {
    if (car === p.inCar) driveCar(G, car, dt);
    else if (car.isTraffic) driveTraffic(G, car, dt);
    else if (car.isPolice) { /* police.js steers patrol cars */ }
    else if (Math.abs(car.speed) > 0.05) {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 5 * dt);
      moveCarBody(G, car, dt, false);
    }
    if (car.isPolice && car.group.userData.lightBar) {
      car.group.userData.lightBar.rotation.y = G.time * 9;
    }
  }
  pushCarsApart(G);

  if (p.inCar) {
    updateDriveCamera(G, dt);
    setEngine(true, Math.abs(p.inCar.speed) / p.inCar.spec.maxSpeed);
  } else {
    setEngine(false, 0);
  }
  G.speedKmh = p.inCar ? Math.abs(p.inCar.speed) * 3.6 : 0;
}
