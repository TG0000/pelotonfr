import * as maplibregl from "maplibre-gl";

/**
 * MapLibre, avec son worker au bon endroit.
 *
 * La v6 charge son worker comme un module ESM depuis une URL calculée sur
 * `import.meta.url` ; mis en chunks par Turbopack, ce chemin ne mène nulle
 * part et la carte reste sans tracé (voir scripts/build/copy-maplibre-worker).
 * Tout ce qui construit une carte importe MapLibre d'ici, pour que l'URL soit
 * posée avant la première carte et à un seul endroit.
 */
if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
}

export { maplibregl };
