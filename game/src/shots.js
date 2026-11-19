// Tidewater Heat — shots.js
// Screenshot staging: reads URL query parameters and sets up a scene
// before the first frame, so every screenshot is a real render of the
// game in a known state. ?shot=chase|foot|drive|shootout, ?autostart=1,
// plus overrides: ?mission=N, ?wanted=N, ?cash=N, ?weapon=pistol|smg|shotgun.

import { spawnCar, enterCar } from "./vehicles.js";
import { PIER } from "./city.js";

export function shotParams() {
  const q = new URLSearchParams(window.location.search);
  return {
    shot: q.get("shot") || "",
    autostart: q.get("autostart") === "1",
    mission: q.has("mission") ? parseInt(q.get("mission"), 10) : null,
    wanted: q.has("wanted") ? parseInt(q.get("wanted"), 10) : null,
    cash: q.has("cash") ? parseInt(q.get("cash"), 10) : null,
    weapon: q.get("weapon") || null,
  };
}

function placePlayer(G, x, z, heading) {
  const p = G.player;
  p.group.position.set(x, 0, z);
  p.heading = heading;
  p.group.rotation.y = heading;
  G.camYaw = heading + Math.PI;
}

function giveCar(G, type, x, z, heading) {
  const car = spawnCar(G, type, x, z, heading);
  enterCar(G, car);
  car.speed = 12;
  return car;
}

export function stageShot(G, params) {
  const p = G.player;
  if (params.cash !== null && !Number.isNaN(params.cash)) G.cash = params.cash;
  if (params.weapon && ["pistol", "smg", "shotgun"].includes(params.weapon)) {
    p.weapon = params.weapon;
  }

  switch (params.shot) {
    case "chase": {
      // Cover shot: three-star police chase downtown, HUD + minimap live.
      placePlayer(G, 0, 40, 0);
      giveCar(G, "sport", 0, 40, 0);
      G.startMission(3);
      G.setWanted(3);
      // Two cruisers closing in from the front and the side.
      spawnCar(G, "police", 10, 5, Math.PI);
      spawnCar(G, "police", -14, 70, 0);
      G.policeCars.push(...G.cars.slice(-2));
      G.addMessage("3 stars! Lose the cops and reach the safehouse.");
      break;
    }
    case "foot": {
      // Rico on foot in the city, mission 1 briefing up.
      placePlayer(G, -12, 24, Math.PI * 0.75);
      G.startMission(0);
      break;
    }
    case "drive": {
      // Driving downtown on the harbor run.
      placePlayer(G, 40, -80, 0);
      giveCar(G, "sedan", 40, -80, 0);
      G.startMission(1);
      break;
    }
    case "shootout": {
      // The pier shootout: SMG out, Red Jacks on the deck. Starting
      // mission 3 already spawns the gang via its first step, and the
      // player spawns inside the approach radius, so the fight is live
      // on the first frame.
      placePlayer(G, PIER.x - 30, PIER.z + 6, Math.PI / 2);
      p.weapon = "smg";
      G.startMission(2);
      G.addMessage("Red Jacks on the pier — take them all down!");
      break;
    }
    default:
      break;
  }

  if (params.mission !== null && !Number.isNaN(params.mission)) {
    G.startMission(Math.max(0, Math.min(4, params.mission)));
  }
  if (params.wanted !== null && !Number.isNaN(params.wanted)) {
    G.setWanted(params.wanted);
  }
  window.__shotReady = true;
}
