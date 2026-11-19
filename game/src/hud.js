// Tidewater Heat — hud.js
// The HUD: health, cash, wanted stars, speed, weapon and ammo, objective
// text, message feed, and a live circular minimap drawn on a 2D canvas.

import { ROAD_LINES } from "./city.js";
import { WEAPONS } from "./combat.js";

let el = {};
let ctx2d = null;

export function initHud(G) {
  const ids = ["hud", "health-fill", "health-text", "cash", "stars", "speed",
    "weapon", "ammo", "objective", "messages", "minimap", "briefing",
    "briefing-title", "briefing-text", "damage-flash", "start-screen",
    "pause-screen", "dead-screen", "dead-text", "save-info", "btn-continue"];
  for (const id of ids) el[id] = document.getElementById(id);
  ctx2d = el["minimap"].getContext("2d");

  G.addMessage = (text) => {
    const div = document.createElement("div");
    div.textContent = text;
    el["messages"].appendChild(div);
    while (el["messages"].children.length > 5) el["messages"].removeChild(el["messages"].firstChild);
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 5000);
  };
  G.showBriefing = (title, text) => {
    el["briefing-title"].textContent = title;
    el["briefing-text"].textContent = text;
    el["briefing"].classList.remove("hidden");
    clearTimeout(G._briefingTimer);
    G._briefingTimer = setTimeout(() => el["briefing"].classList.add("hidden"), 7000);
  };
  G.hudFlashDamage = () => {
    el["damage-flash"].style.opacity = "1";
    setTimeout(() => { el["damage-flash"].style.opacity = "0"; }, 180);
  };
  G.showScreen = (which) => {
    el["start-screen"].classList.toggle("hidden", which !== "start");
    el["pause-screen"].classList.toggle("hidden", which !== "pause");
    el["dead-screen"].classList.toggle("hidden", which !== "dead");
    el["hud"].classList.toggle("hidden", which === "start");
  };
  G.updateSaveInfo = () => {
    const save = G.loadSaveData();
    if (save) {
      el["btn-continue"].classList.remove("hidden");
      el["save-info"].textContent = `Save found — $${save.cash} cash, mission ${Math.min(save.missionIndex + 1, 5)} of 5.`;
    } else {
      el["btn-continue"].classList.add("hidden");
      el["save-info"].textContent = "";
    }
  };
  G.setDeadText = (text) => { el["dead-text"].textContent = text; };
}

function drawMinimap(G) {
  const c = ctx2d;
  const S = 170, C = S / 2;
  const scale = S / 520; // world ±260 maps onto the disc
  const toMap = (x, z) => [C + x * scale, C + z * scale];
  c.clearRect(0, 0, S, S);

  // Ground, water and beach.
  c.fillStyle = "#2e4a33";
  c.fillRect(0, 0, S, S);
  c.fillStyle = "#1e7fa8";
  c.fillRect(C + 180 * scale, 0, S, S);
  c.fillStyle = "#e8d49a";
  c.fillRect(C + 170 * scale, 0, 10 * scale, S);

  // City blocks.
  c.fillStyle = "#5a5f63";
  for (const b of G.colliders) {
    const [x0, z0] = toMap(b.minX, b.minZ);
    const [x1, z1] = toMap(b.maxX, b.maxZ);
    c.fillRect(x0, z0, Math.max(1, x1 - x0), Math.max(1, z1 - z0));
  }
  // Roads.
  c.strokeStyle = "#d8d8d0";
  c.lineWidth = 2;
  for (const r of ROAD_LINES) {
    const [x] = toMap(r, 0);
    const [, z] = toMap(0, r);
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x, S); c.stroke();
    c.beginPath(); c.moveTo(0, z); c.lineTo(S, z); c.stroke();
  }

  const dot = (x, z, color, r) => {
    const [mx, mz] = toMap(x, z);
    c.fillStyle = color;
    c.beginPath(); c.arc(mx, mz, r, 0, Math.PI * 2); c.fill();
  };

  // Mission beacon: pulsing yellow diamond.
  if (G.mission.target) {
    const [mx, mz] = toMap(G.mission.target.x, G.mission.target.z);
    const pulse = 5 + Math.sin(G.time * 4) * 1.5;
    c.fillStyle = "#ffd34d";
    c.beginPath();
    c.moveTo(mx, mz - pulse); c.lineTo(mx + pulse, mz); c.lineTo(mx, mz + pulse); c.lineTo(mx - pulse, mz);
    c.closePath(); c.fill();
  }
  for (const car of G.cars) {
    const pos = car.group.position;
    dot(pos.x, pos.z, car.isPolice ? (Math.floor(G.time * 4) % 2 ? "#ff3333" : "#3388ff") : "#ffffff", car.isPolice ? 3 : 2);
  }
  for (const ped of G.peds) {
    if (!ped.down) dot(ped.mesh.position.x, ped.mesh.position.z, "#bbbbbb", 1.5);
  }
  for (const e of G.enemies) {
    if (!e.dead) dot(e.mesh.position.x, e.mesh.position.z, "#ff3333", 3);
  }
  for (const o of G.officers || []) {
    if (!o.dead) dot(o.mesh.position.x, o.mesh.position.z, "#3388ff", 2.5);
  }

  // Player arrow, rotated by heading.
  const p = G.player;
  const pos = p.inCar ? p.inCar.group.position : p.group.position;
  const heading = p.inCar ? p.inCar.heading : p.heading;
  const [px, pz] = toMap(pos.x, pos.z);
  c.save();
  c.translate(px, pz);
  c.rotate(Math.PI - heading);
  c.fillStyle = "#ffffff";
  c.strokeStyle = "#000000";
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(0, 3); c.lineTo(-5, 6);
  c.closePath(); c.fill(); c.stroke();
  c.restore();
}

export function updateHud(G) {
  const p = G.player;
  if (!p) return;
  const hp = Math.max(0, Math.round(p.health));
  el["health-fill"].style.width = `${hp}%`;
  el["health-fill"].classList.toggle("low", hp <= 30);
  el["health-text"].textContent = String(hp);
  el["cash"].textContent = `$${G.cash}`;
  let starsHtml = "";
  for (let i = 0; i < 5; i++) starsHtml += `<span class="${i < G.wanted ? "" : "dim"}">★</span>`;
  el["stars"].innerHTML = starsHtml;
  el["stars"].classList.toggle("hot", G.wanted >= 4);
  el["speed"].textContent = String(Math.round(G.speedKmh || 0));
  const w = WEAPONS[p.weapon];
  el["weapon"].textContent = w.name;
  el["ammo"].textContent = `${p.ammo[p.weapon]} / ${p.reserve[p.weapon]}`;
  el["objective"].textContent = G.objective || "—";
  drawMinimap(G);
}
