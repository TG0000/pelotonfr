/** Un nom de fichier qu'un coureur retrouve parmi cinquante sur son compteur. */
export function fileSlug(name: string, fallback = "parcours"): string {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || fallback;
}
