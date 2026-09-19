import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { COLLECTORS, scheduledCollectors, shortfallFor } from "../lib/collectors";

/**
 * La déclaration des collecteurs et ce qui tourne vraiment doivent concorder.
 *
 * Les deux ont divergé sans que rien ne le dise. « Bosses Strava » est resté
 * déclaré et surveillé alors qu'aucun workflow ne l'appelait plus : la page
 * d'état l'a montré à l'arrêt pendant cinq jours, et le contrôle de nuit
 * s'apprêtait à en prévenir par courriel. Dans l'autre sens, onze collecteurs
 * tournaient chaque nuit sans apparaître nulle part, faute d'être déclarés —
 * le placement des courses, le contrôle des lieux, la météo, les circuits.
 * Une panne sur l'un d'eux était invisible.
 */

const workflows = readdirSync(".github/workflows")
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => readFileSync(`.github/workflows/${name}`, "utf8"))
  .join("\n");

const packageScripts: Record<string, string> = JSON.parse(
  readFileSync("package.json", "utf8")
).scripts;

test("chaque collecteur déclaré est lancé par un workflow", () => {
  for (const spec of scheduledCollectors()) {
    const command = spec.command as string;
    assert.ok(
      packageScripts[command],
      `${spec.key} : la commande « ${command} » n'existe pas dans package.json`
    );
    /* `npm run scrape:briefing -- --places` compte : on cherche la commande,
       pas la ligne entière, mais bornée pour que « scrape » ne se reconnaisse
       pas dans « scrape:results ». */
    const called = new RegExp(`npm run ${command.replace(/[:]/g, "[:]")}(\\s|$)`, "m").test(workflows);
    assert.ok(called, `${spec.key} : « npm run ${command} » n'est lancé par aucun workflow`);
  }
});

test("chaque commande de collecte lancée correspond à un collecteur déclaré", () => {
  /* Les scripts qui ne collectent rien — migrations, qualité, plan du site —
     n'ont pas de ligne sur la page d'état et n'en veulent pas. */
  const horsCollecte = new Set([
    "build", "lint", "typecheck", "test",
    "db:migrate", "db:archive-report", "db:recompute-categories",
    "alerts:send", "alerts:closing", "alerts:club",
    "seo:indexnow",
  ]);
  const lancees = new Set(
    [...workflows.matchAll(/npm run ([a-z][a-z:0-9-]*)/g)].map((m) => m[1])
  );
  const declarees = new Set(COLLECTORS.map((s) => s.command).filter(Boolean));
  for (const commande of lancees) {
    if (horsCollecte.has(commande)) continue;
    assert.ok(
      declarees.has(commande),
      `« npm run ${commande} » tourne sans être déclaré dans COLLECTORS : sa panne serait invisible`
    );
  }
});

test("aucune clé de collecteur n'est déclarée deux fois", () => {
  const keys = COLLECTORS.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("un collecteur surveillé a des délais croissants et non nuls", () => {
  for (const spec of scheduledCollectors()) {
    assert.ok(spec.maxAgeHours > 0, `${spec.key} : maxAgeHours nul`);
    assert.ok(
      spec.criticalAgeHours > spec.maxAgeHours,
      `${spec.key} : le seuil critique doit dépasser le seuil de retard`
    );
  }
});

test("l'écart se juge selon ce que le collecteur fait", () => {
  const moisson = { seen: 200, written: 10 };
  const semaineVide = { seen: 1000, written: 0 };

  // Une moisson qui voit deux cents et en garde dix est cassée le soir même.
  assert.equal(shortfallFor("harvest", moisson, { seen: 0, written: 0 }), true);

  // Un examen qui ouvre mille fiches et en retient trente fait son métier :
  // c'est ce ratio-là qui affichait « 34 sur 1 393 » comme une anomalie.
  assert.equal(shortfallFor("scan", { seen: 1393, written: 34 }, { seen: 1393, written: 34 }), false);

  // Mais une semaine entière sans rien rapporter, si.
  assert.equal(shortfallFor("scan", { seen: 300, written: 0 }, semaineVide), true);

  // L'entretien ne rapporte rien par nature : il n'a pas d'écart.
  assert.equal(shortfallFor("maintenance", moisson, semaineVide), false);
});
