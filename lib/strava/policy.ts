/**
 * La porte de la version premium.
 *
 * Tout ce qui vient de Strava — le circuit, le vent sur le tour, la route lue
 * en photo, Street View — passe par ici. La porte est prévue pour le jour où
 * ces pages deviendront payantes ; tant qu'elle n'est pas posée, tout est
 * visible, sinon la fonction la plus travaillée du site reste éteinte sans
 * que rien ne le dise.
 *
 * Pour la refermer : ENABLE_PUBLIC_STRAVA="false".
 */
export function publicStravaEnabled(): boolean {
  return process.env.ENABLE_PUBLIC_STRAVA !== "false";
}
