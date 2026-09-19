import { test } from "node:test";
import assert from "node:assert/strict";
import { estReessayable } from "../scripts/scrapers/utils/db";

/**
 * Une coupure passagère de la base ne doit pas coûter une nuit de collecte.
 *
 * Le collecteur de catégories est tombé sur « Couldn't connect to compute
 * node » après cent trente-huit secondes de travail : huit cent quarante et
 * une courses examinées, rien de gardé, et une page d'état qui annonce un
 * échec pour une base qui allait très bien trente secondes plus tard.
 */


test("une coupure passagère se réessaie", () => {
  assert.equal(estReessayable(Object.assign(new Error("Server error (HTTP status 500)"), { "neon:retryable": true })), true);
  assert.equal(estReessayable(new Error("Couldn't connect to compute node")), true);
  assert.equal(estReessayable(new Error("socket hang up")), true);
  assert.equal(estReessayable(new Error("fetch failed")), true);
});

test("une faute de notre côté ne se réessaie pas", () => {
  // Boucler quatre fois sur une colonne inexistante ne la fera pas apparaître.
  assert.equal(estReessayable(new Error('relation "race_entries" does not exist')), false);
  assert.equal(estReessayable(new Error("syntax error at or near \"SELCT\"")), false);
  assert.equal(estReessayable(new Error("duplicate key value violates unique constraint")), false);
  assert.equal(estReessayable(null), false);
  assert.equal(estReessayable("boom"), false);
});
