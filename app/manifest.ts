import type { MetadataRoute } from "next";

/**
 * Ce que le téléphone garde quand on épingle le site.
 *
 * Sans manifeste, un raccourci posé sur un écran d'accueil s'appelle comme le
 * titre de la page où on était et s'ouvre dans le navigateur, barre d'adresse
 * comprise. Avec, il porte le nom du produit, l'encre de la marque et s'ouvre
 * comme une application.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PelotonFR — le calendrier du cyclisme amateur",
    short_name: "PelotonFR",
    description:
      "Les courses FFC, FSGT et UFOLEP près de chez toi : dates, catégories, engagés, parcours et météo au départ.",
    lang: "fr",
    start_url: "/",
    display: "standalone",
    background_color: "#18263f",
    theme_color: "#18263f",
    categories: ["sports"],
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any", purpose: "any" },
      { src: "/apple-icon.png", type: "image/png", sizes: "180x180" },
    ],
  };
}
