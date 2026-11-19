// Tidewater Heat — city.js
// Procedural coastal city: a road grid, towers with lit windows, a beach,
// a pier, a harbor and street props. The layout is seeded, so every run
// builds the same Tidewater Bay.

import * as THREE from "three";

// Deterministic RNG so the city never changes between sessions.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ROAD_LINES = [-160, -120, -80, -40, 0, 40, 80, 120, 160];
export const ROAD_WIDTH = 12;
export const WORLD_BOUND = 240;
export const BEACH_X = 180;
export const PIER = { x: 205, z: 0 };
export const SAFEHOUSE = { x: -60, z: -60 };
export const WAREHOUSE = { x: -120, z: 120 };
export const TOWER = { x: 0, z: -160 };

const PALETTE = [0x8a7f74, 0x9aa3a8, 0x7d8ba0, 0xb0a08a, 0x6f7d8c, 0xa89a80, 0x8c9a90, 0x9b8a7a];

// Canvas texture: a wall of windows, some lit, some dark.
function makeWindowTexture(rng, base) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 12) {
    for (let x = 6; x < 58; x += 11) {
      const lit = rng() < 0.4;
      g.fillStyle = lit ? "#ffd98a" : "#2c3e50";
      g.fillRect(x, y, 7, 8);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function box(w, h, d, color, x, y, z, opts = {}) {
  const mat = opts.map
    ? new THREE.MeshStandardMaterial({ map: opts.map, roughness: 0.9 })
    : new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0.05 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = opts.shadow !== false;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildCity(G) {
  const rng = mulberry32(20261119);
  const scene = G.scene;
  G.colliders = [];
  G.water = null;

  scene.background = new THREE.Color(0x87c5e8);
  scene.fog = new THREE.Fog(0x9fd0e8, 220, 620);

  // Sun + sky light.
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
  sun.position.set(120, 180, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 600;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x4a7c59, 0.9));

  // Ground: grass outskirts, concrete city slab.
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshStandardMaterial({ color: 0x4d8a4f, roughness: 1 })
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);

  const slab = new THREE.Mesh(
    new THREE.PlaneGeometry(380, 380),
    new THREE.MeshStandardMaterial({ color: 0x9aa0a3, roughness: 1 })
  );
  slab.rotation.x = -Math.PI / 2;
  slab.position.set(0, 0.01, 0);
  slab.receiveShadow = true;
  scene.add(slab);

  // Roads: asphalt strips along every grid line, plus pale center dashes.
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2f3336, roughness: 1 });
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xd8d8c8, roughness: 1 });
  for (const c of ROAD_LINES) {
    const rx = new THREE.Mesh(new THREE.PlaneGeometry(380, ROAD_WIDTH), roadMat);
    rx.rotation.x = -Math.PI / 2;
    rx.position.set(0, 0.03, c);
    rx.receiveShadow = true;
    scene.add(rx);
    const rz = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, 380), roadMat);
    rz.rotation.x = -Math.PI / 2;
    rz.position.set(c, 0.03, 0);
    rz.receiveShadow = true;
    scene.add(rz);
    for (let d = -180; d <= 180; d += 16) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.7), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(d, 0.05, c);
      scene.add(dash);
    }
  }

  // Beach sand and the bay water to the east.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 500),
    new THREE.MeshStandardMaterial({ color: 0xe8d49a, roughness: 1 })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(225, 0.02, 0);
  sand.receiveShadow = true;
  scene.add(sand);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 700),
    new THREE.MeshStandardMaterial({ color: 0x1e7fa8, roughness: 0.25, metalness: 0.35, transparent: true, opacity: 0.92 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(390, 0.05, 0);
  scene.add(water);
  G.water = water;

  // Buildings: one to three towers per block, skipping parks and lots.
  const textures = [0x8a7f74, 0x7d8ba0, 0xb0a08a, 0x6f7d8c].map((c) =>
    makeWindowTexture(rng, "#" + c.toString(16).padStart(6, "0"))
  );
  for (let bi = 0; bi < ROAD_LINES.length - 1; bi++) {
    for (let bj = 0; bj < ROAD_LINES.length - 1; bj++) {
      const x0 = ROAD_LINES[bi] + ROAD_WIDTH / 2 + 2;
      const z0 = ROAD_LINES[bj] + ROAD_WIDTH / 2 + 2;
      const x1 = ROAD_LINES[bi + 1] - ROAD_WIDTH / 2 - 2;
      const z1 = ROAD_LINES[bj + 1] - ROAD_WIDTH / 2 - 2;
      const roll = rng();
      if (roll < 0.14) {
        // Park: trees and benches instead of a tower.
        for (let t = 0; t < 5; t++) {
          const px = x0 + rng() * (x1 - x0);
          const pz = z0 + rng() * (z1 - z0);
          scene.add(makeTree(px, pz, rng));
        }
        continue;
      }
      if (roll < 0.24) continue; // Empty lot / parking.
      const count = 1 + Math.floor(rng() * 2);
      for (let k = 0; k < count; k++) {
        const w = 10 + rng() * 10;
        const d = 10 + rng() * 10;
        const cx = x0 + w / 2 + rng() * Math.max(0, x1 - x0 - w);
        const cz = z0 + d / 2 + rng() * Math.max(0, z1 - z0 - d);
        const downtown = Math.abs(cx) < 80 && Math.abs(cz) < 80;
        const h = downtown ? 22 + rng() * 30 : 8 + rng() * 16;
        const tex = textures[Math.floor(rng() * textures.length)].clone();
        tex.needsUpdate = true;
        tex.repeat.set(Math.max(1, Math.round(w / 9)), Math.max(1, Math.round(h / 12)));
        const b = box(w, h, d, 0xffffff, cx, h / 2, cz, { map: tex });
        scene.add(b);
        if (rng() < 0.5) {
          scene.add(box(w * 0.3, 2.5, d * 0.3, 0x666666, cx + w * 0.2, h + 1.25, cz, { shadow: false }));
        }
        G.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
      }
    }
  }

  // The pier: wooden deck reaching into the bay, with posts and crates.
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x8a5f3c, roughness: 1 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(70, 1.2, 14), pierMat);
  deck.position.set(PIER.x, 0.8, PIER.z);
  deck.castShadow = true; deck.receiveShadow = true;
  scene.add(deck);
  for (let px = 175; px <= 235; px += 10) {
    for (const pz of [-6, 6]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3, 6), pierMat);
      post.position.set(px, 0, pz);
      scene.add(post);
    }
  }
  for (let i = 0; i < 6; i++) {
    scene.add(box(2.2, 2.2, 2.2, 0xa8763e, 195 + rng() * 35, 2.6, -4 + rng() * 8));
  }

  // Warehouse block (mission 5) and the safehouse (mission 4).
  const wh = box(26, 10, 18, 0x7a8894, WAREHOUSE.x, 5, WAREHOUSE.z);
  scene.add(wh);
  G.colliders.push({ minX: WAREHOUSE.x - 13, maxX: WAREHOUSE.x + 13, minZ: WAREHOUSE.z - 9, maxZ: WAREHOUSE.z + 9 });
  const sh = box(12, 7, 10, 0xc8b08a, SAFEHOUSE.x, 3.5, SAFEHOUSE.z);
  scene.add(sh);
  G.colliders.push({ minX: SAFEHOUSE.x - 6, maxX: SAFEHOUSE.x + 6, minZ: SAFEHOUSE.z - 5, maxZ: SAFEHOUSE.z + 5 });

  // Palms along the beach and lamps along the roads.
  for (let z = -180; z <= 180; z += 24) {
    scene.add(makePalm(186 + rng() * 6, z + rng() * 8));
    scene.add(makeLamp(-168, z));
    scene.add(makeLamp(168, z));
  }
  for (let x = -160; x <= 160; x += 40) {
    scene.add(makeLamp(x, -168));
    scene.add(makeLamp(x, 168));
  }

  // Collision helper: true when a circle at (x, z) with radius r hits a
  // building or leaves the world.
  G.hitsBuilding = (x, z, r) => {
    if (Math.abs(x) > WORLD_BOUND || Math.abs(z) > WORLD_BOUND) return true;
    for (const c of G.colliders) {
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
    }
    return false;
  };
  G.clampWorld = (v, m = WORLD_BOUND) => {
    v.x = Math.max(-m, Math.min(m, v.x));
    v.z = Math.max(-m, Math.min(m, v.z));
    return v;
  };
}

function makeTree(x, z, rng) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.45, 3, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 })
  );
  trunk.position.y = 1.5;
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(2.2 + rng(), 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x2f7a3d, roughness: 1 })
  );
  crown.position.y = 4.2;
  crown.castShadow = true;
  group.add(trunk, crown);
  group.position.set(x, 0, z);
  return group;
}

function makePalm(x, z) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.4, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 1 })
  );
  trunk.position.y = 3;
  trunk.rotation.z = 0.12;
  group.add(trunk);
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x2f8a4d, roughness: 1 });
  for (let i = 0; i < 6; i++) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.5, 4.5, 4), frondMat);
    frond.position.y = 6.2;
    frond.rotation.z = Math.PI / 2.4;
    frond.rotation.y = (i / 6) * Math.PI * 2;
    frond.translateY(1.6);
    frond.castShadow = true;
    group.add(frond);
  }
  group.position.set(x, 0, z);
  return group;
}

function makeLamp(x, z) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.16, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0x33383c, roughness: 0.6, metalness: 0.5 })
  );
  pole.position.y = 3;
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffee88, emissiveIntensity: 0.7 })
  );
  bulb.position.y = 6.2;
  group.add(pole, bulb);
  group.position.set(x, 0, z);
  return group;
}

export function updateCity(G, dt) {
  if (G.water) {
    G.water.position.y = 0.05 + Math.sin(G.time * 0.6) * 0.08;
  }
}
