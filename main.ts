// Tidewater Heat — build program (Node 22, standard library only).
//
// Copies the playable game and its screenshots into the output directory,
// then writes the make.fun dossier for the bundle with the vendored
// dossier library. The output directory comes from MAKEFUN_OUTPUT_DIR
// and falls back to /output when the variable is not set.

import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

// The repository root is the directory this program lives in.
const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

mkdirSync(outDir, { recursive: true });

// The whole game folder goes over as static files, exactly as built.
cpSync(join(repoRoot, "game"), join(outDir, "game"), { recursive: true });

// Screenshots ride along when the folder exists.
const shotsDir = join(repoRoot, "screenshots");
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outDir, "screenshots"), { recursive: true });
}

// The dossier describes the bundle under the competition's gate caps:
// at most 160 KiB of source text, at most 4 screenshots of at most
// 256 KiB each, the game at most 993 files and 48 MiB in total, and
// every game path at most 1000 bytes long.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, "dossier.json"), dossier);
