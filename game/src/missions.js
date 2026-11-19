// Tidewater Heat — missions.js
// Five story missions for Rico Marlowe: steal wheels, run the harbor,
// clear the pier, shake a three-star tail, and take the warehouse.
// Each mission has a briefing, a glowing beacon marker and a cash reward.

import * as THREE from "three";
import { PIER, WAREHOUSE, TOWER } from "./city.js";
import { spawnEnemiesAt, enemiesAlive } from "./combat.js";
import { playMissionComplete } from "./audio.js";

export const MISSIONS = [
  {
    id: "first-wheels",
    title: "MISSION 1 — FIRST WHEELS",
    briefing: "Fresh out, no wheels, no cash. Steal a car — any car — and bring it to the drop-off downtown. The cops will notice. Let them.",
    reward: 200,
    steps: [
      { text: "Steal a car (walk up to one and press E)", check: (G) => !!G.player.inCar },
      { text: "Drive to the drop-off marker", target: { x: 40, z: 40 }, check: (G) => nearTarget(G, 7) },
    ],
  },
  {
    id: "harbor-run",
    title: "MISSION 2 — HARBOR RUN",
    briefing: "The dock crew needs a runner. Hit all three checkpoints around the harbor before the tide turns. Fast and clean.",
    reward: 350,
    steps: [
      { text: "Reach checkpoint 1 (east docks)", target: { x: 120, z: -120 }, check: (G) => nearTarget(G, 8) },
      { text: "Reach checkpoint 2 (south harbor)", target: { x: 120, z: 120 }, check: (G) => nearTarget(G, 8) },
      { text: "Reach checkpoint 3 (west bridge)", target: { x: -80, z: 80 }, check: (G) => nearTarget(G, 8) },
    ],
  },
  {
    id: "pier-heat",
    title: "MISSION 3 — PIER HEAT",
    briefing: "The Red Jacks run the pier now. Go down to the boardwalk and take it back — all four of them. Watch your back; they shoot first.",
    reward: 500,
    steps: [
      { text: "Get to the pier", target: { x: PIER.x - 25, z: PIER.z }, check: (G) => nearTarget(G, 10), onEnter: (G) => {
        spawnEnemiesAt(G, PIER.x, PIER.z, 4, 9);
        G.addMessage("Red Jacks on the pier — take them all down!");
      } },
      { text: "Clear the pier of Red Jacks", check: (G) => enemiesAlive(G) === 0 },
    ],
  },
  {
    id: "lay-low",
    title: "MISSION 4 — LAY LOW",
    briefing: "Three stars and every cruiser in the bay on your tail. Lose them and get to the safehouse on Marlowe Street. Do not get wasted.",
    reward: 750,
    steps: [
      { text: "Reach the safehouse — the cops are coming", target: { x: -60, z: -40 }, check: (G) => nearTarget(G, 8), onEnter: (G) => {
        G.setWanted(3);
        G.addMessage("3 stars! Lose the cops and reach the safehouse.");
      } },
    ],
    onComplete: (G) => { G.setWanted(0); G.addMessage("Heat's off. You made it home."); },
  },
  {
    id: "takeover",
    title: "MISSION 5 — TIDEWATER TAKEOVER",
    briefing: "Last job. The Red Jacks' warehouse, five guns, then the tower rooftop drop. Finish this and Tidewater Bay is yours.",
    reward: 1000,
    steps: [
      { text: "Storm the warehouse", target: { x: WAREHOUSE.x + 20, z: WAREHOUSE.z }, check: (G) => nearTarget(G, 10), onEnter: (G) => {
        spawnEnemiesAt(G, WAREHOUSE.x + 20, WAREHOUSE.z, 5, 10);
        G.addMessage("Warehouse crew — five hostiles!");
      } },
      { text: "Clear the warehouse crew", check: (G) => enemiesAlive(G) === 0 },
      { text: "Drive to Tidewater Tower to finish", target: { x: TOWER.x, z: TOWER.z + 14 }, check: (G) => nearTarget(G, 8) },
    ],
    onComplete: (G) => {
      G.storyComplete = true;
      G.addMessage("TIDEWATER BAY IS YOURS. Story complete!");
    },
  },
];

function nearTarget(G, radius) {
  const t = G.mission.target;
  if (!t) return false;
  const p = G.player.inCar ? G.player.inCar.group.position : G.player.group.position;
  return Math.hypot(p.x - t.x, p.z - t.z) < radius;
}

function makeBeacon() {
  const group = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true), beamMat);
  beam.position.y = 30;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 3.4, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshBasicMaterial({ color: 0xffe98a })
  );
  diamond.position.y = 5;
  group.add(beam, ring, diamond);
  group.userData.diamond = diamond;
  group.userData.ring = ring;
  return group;
}

export function initMissions(G) {
  G.missionIndex = 0;
  G.mission = { step: 0, target: null, active: false, complete: false };
  G.missionKills = 0;
  G.storyComplete = false;
  G.beacon = makeBeacon();
  G.beacon.visible = false;
  G.scene.add(G.beacon);
  G.objective = "Press NEW GAME to start.";
  G.startMission = (index) => {
    if (index >= MISSIONS.length) {
      G.mission.active = false;
      G.mission.complete = true;
      G.objective = "Story complete — free roam Tidewater Bay!";
      G.beacon.visible = false;
      return;
    }
    G.missionIndex = index;
    G.mission = { step: 0, target: null, active: true, complete: false };
    const m = MISSIONS[index];
    G.showBriefing(m.title, m.briefing);
    enterStep(G);
  };
}

function enterStep(G) {
  const m = MISSIONS[G.missionIndex];
  const step = m.steps[G.mission.step];
  G.mission.target = step.target || null;
  if (step.target) {
    G.beacon.position.set(step.target.x, 0, step.target.z);
    G.beacon.visible = true;
  } else {
    G.beacon.visible = false;
  }
  G.objective = step.text;
  if (step.onEnter) step.onEnter(G);
}

function completeMission(G) {
  const m = MISSIONS[G.missionIndex];
  G.cash += m.reward;
  playMissionComplete();
  G.addMessage(`${m.title.split("—")[1].trim()} complete! +$${m.reward}`);
  if (m.onComplete) m.onComplete(G);
  G.saveGame();
  G.missionIndex++;
  G.mission.active = false;
  G.beacon.visible = false;
  if (G.missionIndex < MISSIONS.length) {
    G.objective = "Next mission starting…";
    // Brief pause, then the next briefing.
    setTimeout(() => {
      if (G.state === "playing") G.startMission(G.missionIndex);
    }, 3500);
  } else {
    G.mission.complete = true;
    G.objective = "Story complete — free roam Tidewater Bay!";
  }
}

export function updateMissions(G, dt) {
  if (G.beacon.visible) {
    G.beacon.userData.diamond.rotation.y += dt * 2;
    G.beacon.userData.diamond.position.y = 5 + Math.sin(G.time * 2) * 0.6;
    const s = 1 + Math.sin(G.time * 3) * 0.08;
    G.beacon.userData.ring.scale.set(s, s, s);
  }
  if (G.state !== "playing" || !G.mission.active) return;
  const m = MISSIONS[G.missionIndex];
  const step = m.steps[G.mission.step];
  if (step && step.check(G)) {
    G.mission.step++;
    if (G.mission.step >= m.steps.length) completeMission(G);
    else enterStep(G);
  }
}
