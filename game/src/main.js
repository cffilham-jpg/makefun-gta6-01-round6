// Tidewater Heat — main.js
// Boot, game loop, input, screens, save/load and module wiring.

import * as THREE from "three";
import { buildCity, updateCity } from "./city.js";
import { buildPlayer, updatePlayer } from "./player.js";
import { initVehicles, updateVehicles } from "./vehicles.js";
import { initPedestrians, updatePedestrians } from "./pedestrians.js";
import { updateCombat, clearEnemies } from "./combat.js";
import { initPolice, updatePolice } from "./police.js";
import { initMissions, updateMissions } from "./missions.js";
import { initHud, updateHud } from "./hud.js";
import { initAudio, setMuted, isMuted, playClick, stopSiren, setEngine } from "./audio.js";
import { shotParams, stageShot } from "./shots.js";

const SAVE_KEY = "tidewater-heat-save-v1";
const SPAWN = { x: 0, z: 20 };

// ---------- shared game state ----------
const G = {
  state: "menu", // menu | playing | paused | dead
  time: 0,
  cash: 0,
  wanted: 0,
  speedKmh: 0,
  storyComplete: false,
  keys: new Set(),
  mouseDown: false,
  pointerLocked: false,
  camYaw: Math.PI,
  camPitch: 0.32,
  cars: [],
  peds: [],
  enemies: [],
  tracers: [],
  colliders: [],
  lastShotPos: null,
  lastShotTime: -99,
  shotsFired: 0,
  objective: "",
};

// One-shot key presses: set on keydown, consumed by exactly one update.
const pressed = new Set();
G.consumeKey = (code) => {
  if (pressed.has(code)) { pressed.delete(code); return true; }
  return false;
};

// ---------- renderer / scene / camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById("app").appendChild(renderer.domElement);

G.renderer = renderer;
G.scene = new THREE.Scene();
G.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 900);
G.camera.position.set(0, 40, 120);
G.clock = new THREE.Clock();

// ---------- modules ----------
buildCity(G);
buildPlayer(G);
initVehicles(G);
initPedestrians(G);
initPolice(G);
initMissions(G);
initHud(G);

// ---------- save / load ----------
G.saveGame = () => {
  try {
    const p = G.player;
    const pos = p.inCar ? p.inCar.group.position : p.group.position;
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: G.cash,
      missionIndex: G.missionIndex,
      x: pos.x, z: pos.z,
      health: Math.max(1, Math.round(p.health)),
      weapon: p.weapon,
      savedAt: Date.now(),
    }));
  } catch (e) { /* storage unavailable: play on without saving */ }
};
G.loadSaveData = () => {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
};

// ---------- flow ----------
function clearHostiles() {
  clearEnemies(G);
  for (const o of G.officers) G.scene.remove(o.mesh);
  G.officers = [];
  for (const c of G.policeCars) {
    G.scene.remove(c.group);
    const i = G.cars.indexOf(c);
    if (i >= 0) G.cars.splice(i, 1);
  }
  G.policeCars = [];
}

function resetRun() {
  clearHostiles();
  const p = G.player;
  if (p.inCar) p.inCar = null;
  p.group.visible = true;
  p.group.position.set(SPAWN.x, 0, SPAWN.z);
  p.heading = Math.PI;
  p.group.rotation.y = Math.PI;
  p.health = p.maxHealth;
  p.weapon = "pistol";
  p.ammo = { pistol: 12, smg: 30, shotgun: 6 };
  p.reserve = { pistol: 48, smg: 120, shotgun: 24 };
  G.cash = 0;
  G.storyComplete = false;
  G.setWanted(0);
  G.missionKills = 0;
  G.camera.fov = 60;
  G.camera.updateProjectionMatrix();
}

function startNewGame() {
  initAudio();
  playClick();
  resetRun();
  G.state = "playing";
  G.showScreen(null);
  G.startMission(0);
  G.addMessage("Welcome to Tidewater Bay, Rico.");
}

function continueGame() {
  const save = G.loadSaveData();
  if (!save) { startNewGame(); return; }
  initAudio();
  playClick();
  resetRun();
  G.cash = save.cash || 0;
  const p = G.player;
  p.health = save.health || 100;
  if (save.weapon) p.weapon = save.weapon;
  if (typeof save.x === "number" && typeof save.z === "number" && !G.hitsBuilding(save.x, save.z, 1)) {
    p.group.position.set(save.x, 0, save.z);
  }
  G.state = "playing";
  G.showScreen(null);
  G.startMission(Math.max(0, Math.min(4, save.missionIndex || 0)));
  G.addMessage("Welcome back to Tidewater Bay.");
}

function retryAfterDeath() {
  initAudio();
  playClick();
  clearHostiles();
  const p = G.player;
  if (p.inCar) p.inCar = null;
  p.group.visible = true;
  p.group.position.set(SPAWN.x, 0, SPAWN.z);
  p.heading = Math.PI;
  p.group.rotation.y = Math.PI;
  p.health = p.maxHealth;
  G.setWanted(0);
  G.state = "playing";
  G.showScreen(null);
  G.startMission(G.missionIndex);
  G.addMessage("Back on your feet. The bay is still yours to take.");
}

G.onPlayerDeath = () => {
  G.state = "dead";
  stopSiren();
  setEngine(false, 0);
  G.setDeadText("Rico went down in Tidewater Bay — but legends get back up.");
  G.showScreen("dead");
  if (document.pointerLockElement) document.exitPointerLock();
  G.saveGame();
};

function pauseGame() {
  if (G.state !== "playing") return;
  G.state = "paused";
  G.showScreen("pause");
  if (document.pointerLockElement) document.exitPointerLock();
  G.saveGame();
}

function resumeGame() {
  if (G.state !== "paused") return;
  playClick();
  G.state = "playing";
  G.showScreen(null);
}

// ---------- input ----------
window.addEventListener("keydown", (e) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if (!e.repeat) pressed.add(e.code);
  G.keys.add(e.code);
  if (e.code === "KeyP" || e.code === "Escape") {
    if (G.state === "playing") pauseGame();
    else if (G.state === "paused") resumeGame();
  }
  if (e.code === "KeyM") setMuted(!isMuted());
});
window.addEventListener("keyup", (e) => G.keys.delete(e.code));
window.addEventListener("blur", () => { G.keys.clear(); G.mouseDown = false; });

renderer.domElement.addEventListener("click", () => {
  if (G.state === "playing" && !document.pointerLockElement) {
    renderer.domElement.requestPointerLock();
  }
});
document.addEventListener("pointerlockchange", () => {
  G.pointerLocked = document.pointerLockElement === renderer.domElement;
});
window.addEventListener("mousemove", (e) => {
  if (!G.pointerLocked || G.state !== "playing") return;
  G.camYaw -= e.movementX * 0.0022;
  G.camPitch = Math.max(-0.15, Math.min(1.1, G.camPitch + e.movementY * 0.0022));
});
window.addEventListener("mousedown", (e) => {
  if (e.button === 0 && G.state === "playing") G.mouseDown = true;
});
window.addEventListener("mouseup", (e) => {
  if (e.button === 0) G.mouseDown = false;
});
window.addEventListener("resize", () => {
  G.camera.aspect = window.innerWidth / window.innerHeight;
  G.camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- buttons ----------
document.getElementById("btn-start").addEventListener("click", startNewGame);
document.getElementById("btn-continue").addEventListener("click", continueGame);
document.getElementById("btn-resume").addEventListener("click", resumeGame);
document.getElementById("btn-restart").addEventListener("click", startNewGame);
document.getElementById("btn-retry").addEventListener("click", retryAfterDeath);
G.updateSaveInfo();

// ---------- screenshot staging / autostart ----------
const params = shotParams();
if (params.autostart) {
  startNewGame();
  stageShot(G, params);
} else {
  G.showScreen("start");
}

// ---------- loop ----------
let lastSave = 0;
let menuAngle = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(G.clock.getDelta(), 0.05);

  if (G.state === "playing") {
    G.time += dt;
    updatePlayer(G, dt);
    updateVehicles(G, dt);
    updatePedestrians(G, dt);
    updateCombat(G, dt);
    updatePolice(G, dt);
    updateMissions(G, dt);
    updateCity(G, dt);
    updateHud(G);
    if (G.time - lastSave > 30) { lastSave = G.time; G.saveGame(); }
  } else if (G.state === "menu") {
    // Slow orbit over downtown behind the start screen.
    menuAngle += dt * 0.05;
    const r = 130;
    G.camera.position.set(Math.cos(menuAngle) * r, 55, Math.sin(menuAngle) * r);
    G.camera.lookAt(0, 0, 0);
    updateCity(G, dt);
  }
  pressed.clear();
  renderer.render(G.scene, G.camera);
}
animate();

// Test hooks: the play-test drives and inspects the game through these.
window.__game = G;
window.__tidewaterReady = true;
