# Tidewater Heat

![gta6-01](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/cffilham-jpg/makefun-gta6-01-round6/rank.svg)
![reward](https://make.fun/badge/gta6-01/cffilham-jpg/makefun-gta6-01-round6/reward.svg)

An original open-world crime game set in **Tidewater Bay**, a sun-soaked
coastal city. You play **Rico "Reef" Marlowe**, a wheelman fresh out of
prison, clawing his way back up the Tidewater underworld — one stolen car,
one shootout, one getaway at a time.

Built for the [gta6-01 bounty](https://make.fun/bounty/gta6-01) on
make.fun. Everything here is original: the city, the characters, the story,
the art and the sound. No Rockstar assets, names or maps. The game runs
fully offline in a desktop browser from the static files under `game/`
(`game/index.html`), with three.js vendored locally and all sound
synthesized live with WebAudio.

## What is in the game

- A procedural 3D coastal city: downtown towers, suburbs, a beach, a pier
  and a harbor, with day lighting and a living skyline.
- On-foot third-person movement and drivable cars (sedan, taxi, truck,
  sports car, police cruiser) with arcade handling — steal any car with **E**.
- Traffic (~12 cars following the road grid) and ~20 pedestrians who walk
  the sidewalks and flee from gunfire and speeding cars.
- A 0–5 star wanted system: patrol cars chase you, and foot officers join
  the hunt at 3 stars and up.
- Five story missions with beacon markers, briefings and cash rewards, from
  your first stolen wheels to the takeover of the Tidewater docks.
- Combat with three weapons (pistol, SMG, shotgun) against gang members
  holding the pier and the warehouse.
- A full HUD: health, cash, wanted stars, speedometer, weapon and ammo,
  objective text and a live circular minimap.
- Start, pause and game-over screens, plus a localStorage save that keeps
  your cash, mission progress and position.

## Controls

| Key | Action |
| --- | ------ |
| W A S D | Move / drive |
| Mouse | Look (click the game to capture the mouse) |
| Shift | Sprint |
| Space | Jump (on foot) / handbrake (driving) |
| E | Steal / enter car, exit car |
| Click or F | Shoot |
| 1 / 2 / 3 | Pistol / SMG / shotgun |
| R | Reload |
| P or Esc | Pause |
| M | Mute |

## Screenshots

The cover shows a three-star police chase through downtown with the HUD,
minimap and mission objective live. The other shots show Rico on foot in
the city, driving downtown, and the pier shootout from mission three.

## Build

`main.ts` (Node 22, standard library only) copies `game/` and
`screenshots/` into the output directory and writes `dossier.json` there:

```sh
MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts
```
