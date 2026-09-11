/**
 * Sert le worker de MapLibre depuis /public.
 *
 * MapLibre 6 charge son worker comme un module ESM, à une URL calculée depuis
 * `import.meta.url`. Une fois le paquet mis en chunks par Turbopack, cette URL
 * tombe dans le dossier des chunks, où le fichier n'existe pas : la page
 * reçoit du HTML à la place, les sources GeoJSON ne se décodent jamais, et la
 * carte affiche le relief sans le tracé — sans autre bruit qu'une ligne de
 * console sur un « script module ».
 *
 * On copie donc le worker et sa dépendance partagée dans /public à chaque
 * installation, pour qu'ils suivent toujours la version du paquet, et on
 * pointe MapLibre dessus (lib/maplibre.ts).
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/package.json")) + "/dist";
const out = join(process.cwd(), "public", "maplibre");
mkdirSync(out, { recursive: true });

for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(dist, file), join(out, file));
}
console.log("worker MapLibre copié dans public/maplibre/");
