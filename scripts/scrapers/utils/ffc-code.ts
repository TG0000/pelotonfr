/**
 * Le département que porte un code de compétition FFC.
 *
 * « C41 42 005 042 » : les deux chiffres après la ligue donnent le
 * département de l'organisateur. C'est la seule borne fiable quand la fiche
 * n'écrit pas le lieu, et elle vaut sur 2 706 courses vérifiées.
 *
 * Vit ici, et non dans le script qui s'en sert, parce que ce script se lance
 * tout seul à l'import : l'importer pour cette fonction déclenchait toute la
 * passe nocturne de replacement des courses.
 */
export function departmentFromCode(sourceUrl: string | null): string | null {
  const m = /\/competition\/\d{4}\/[A-Z]?(\d{2})(\d{2})\d+\//.exec(sourceUrl ?? "");
  if (!m) return null;
  const d = m[2];
  if (d === "97") return null; // outre-mer : trois chiffres, pas dans le code
  if (d === "20") return null; // Corse : 2A / 2B, pas dans le code
  return d;
}
