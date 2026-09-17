# V0.2 — les 23 contrôles avant publication

Contrôles du 17 septembre 2026, à la demande de Théo. Publication autorisée après vérification. Domaine : https://pelotonfr.vercel.app. Cette recette complète le registre des 61 constats ; elle ne constitue ni une certification RGPD, ni un audit d’intrusion exhaustif.

## Résultats et changements

| # | Point | Avant / constat | Correction ou preuve |
|---|---|---|---|
| 1 | RGPD | Notice trop courte pour les traitements actuels. | `/confidentialite` : responsable, finalités/bases, destinataires, Londres et transferts possibles, durées/critères, droits, CNIL et contact privé. Opposition durable et suppression testées en base isolée. Validation juridique externe à obtenir. |
| 2 | CGU | Aucune page dédiée. | `/cgu`, service gratuit, conditions du compte, sources, usages interdits, contenus, disponibilité et droits impératifs ; liens dans le pied de page et la connexion. Aucun abonnement inventé. |
| 3 | API hors frontend | Les API sont des routes Next.js serveur ; une URL visible n’est pas un secret. | PostgreSQL, OAuth, e-mail et clés restent côté serveur. Contrôles d’identité, d’origine et de données sur les écritures. Scan de 44 fichiers JS clients : aucune valeur secrète de production trouvée. Pas besoin d’un second domaine. |
| 4 | HTTPS | HTTP redirigé par Vercel. | Réponse HTTP 308 vers HTTPS vérifiée ; HSTS un an, cookies de consentement Secure sur HTTPS, anti-frame/nosniff. |
| 5 | Cookies | Balise interne envoyée sans choix explicite. | Bannière Accepter/Refuser de même importance ; refus par défaut, choix 180 jours, retrait dans le pied de page. Navigateur : 0 appel avant choix, 0 après refus, 1 après accord, aucun nouveau après retrait/rechargement. API sans accord : 204 avant tout accès base. |
| 6 | Meta title | Métadonnées déjà présentes, cohérence à contrôler. | Titre de marque, modèle `%s | PelotonFR`, titres propres aux pages légales et descriptions. 29 adresses parcourues, aucun titre HTML manquant. |
| 7 | Image réseaux | Pas d’image de partage globale de la nouvelle identité. | `/opengraph-image`, PNG 1200×630 vérifié visuellement, logo identique au site ; carte Twitter grand format et images courses harmonisées. |
| 8 | Favicon | Nouvelle identité disponible. | `/favicon.ico` servi en 200 ; symbole P cohérent avec la marque, contrôlé dans le navigateur. |
| 9 | Sitemap/robots | Deux routes de redirection dans le sitemap. | Remplacées par les routes canoniques ; ajout CGU/contact ; courses actives, non annulées, à venir ; revalidation horaire. Previews interdites à l’indexation, production ouverte aux seules pages publiques recommandées. robots.txt n’est pas un contrôle d’accès. |
| 10 | Textes images | Photos et illustration à vérifier. | Aucun `<img>` sans attribut alt sur les pages parcourues ; photos de route décrites, illustration SVG nommée, image de popup décorative accompagnée de son contexte. |
| 11 | Compression images | Peu d’images lourdes dans la page d’accueil. | Identité vectorielle ; photos préparées en JPEG largeur max 900/qualité 72 par le collecteur ; vignettes lazy + décodage asynchrone et dimensions 176×112 explicites. Les tuiles de fournisseurs externes ne sont pas recompressées par le site. |
| 12 | Vitesse | Mesure Lighthouse mobile sur build de production local. | Premier passage : performance 86, accessibilité 100, bonnes pratiques 100, SEO 100 ; FCP 1,06 s, LCP 4,18 s, TBT 40 ms, CLS 0. Retrait du préchargement des trois graisses monospace non prioritaires. Ce n’est pas une mesure terrain ni une promesse de p95. |
| 13 | Contraste | Nouvelle palette et interactions à inspecter. | Lighthouse accessibilité 100 ; contrôles axe précédents sans violation sur vues testées ; modes clair/sombre et boutons de consentement lisibles. Revue manuelle nécessaire pour les textes sur illustration ; pas de certification WCAG globale. |
| 14 | Responsive | À 320 px, les cartes débordaient de 47 px. | Taille minimale de carte corrigée (`min-w-0`) ; recette aux largeurs 320, 390 et bureau. |
| 15 | 404 | Page existante, conteneur sans repère principal. | Repère `main`, logo, texte et retour accueil ; véritable statut HTTP 404 sur adresse inexistante. |
| 16 | Liens cassés | Contrôle borné des liens internes publics. | 29 adresses explorées ; seule l’adresse volontairement inexistante retourne 404. Les liens externes et chaque fiche historique ne sont pas tous certifiés. |
| 17 | Formulaires | Données et erreurs utilisateur à vérifier. | Validation côté serveur (dates réelles, UUID, catégorie/message, taille JSON), erreurs visibles, requêtes paramétrées ; tests unitaires/intégration. Aucune création de vrai compte ni envoi d’e-mail à un tiers. |
| 18 | Anti-spam | Ne pas compter sur les seuls champs HTML. | Compteurs atomiques PostgreSQL, plafonds visiteur et globaux sur contact/suivi, contrôle d’origine, limites de taille et limites d’authentification. Limites testées en base isolée ; pas de CAPTCHA intrusif ajouté. |
| 19 | Analytics | Outil interne déjà présent. | Audience interne accessible à l’opérateur ; collecte uniquement sur accord, exclusion des pages personnelles, pas d’identifiant persistant ni IP brute enregistrée dans les vues, suppression à 90 jours par maintenance quotidienne. |
| 20 | Un seul CTA | Plusieurs actions existent dans le parcours. | Un CTA principal dans le hero : « Trouver ma prochaine course ». Exploration en lien secondaire, saison/club dans leurs sections ; la navigation et le consentement restent accessibles. |
| 21 | llms | Fichier absent. | `/llms.txt` : présentation, liens canoniques, limites des données et rappel des sources officielles ; aucune donnée privée. Format indicatif, sans garantie de classement ou de respect par les robots. |
| 22 | Cache | Cache public existant ; cache privé pas partout explicite. | API privées `private, no-store` ; API de liste publique `s-maxage=300, stale-while-revalidate=60`, sitemap 1 h, ressources Next versionnées immuables. Géométrie Street View versionnée ; inconnue non mise en cache comme une absence. |
| 23 | Encodage JS | Confusion possible entre minification et protection. | JavaScript compilé/minifié par build Next ; HTML UTF-8, compression activée, source maps navigateur désactivées et aucune `.map` dans les 44 fichiers clients inspectés. L’obfuscation ne protège pas un secret : les clés restent serveur. |

## Validation technique

- Node 22 : TypeScript, ESLint, 18 tests unitaires, 12 tests d’intégration et build de production réussis.
- Tests d’intégration exécutés uniquement dans `pelotonfr_preview_v02` avec données synthétiques ; migration atomique, rollback, chiffrement/déchiffrement Strava et Google, isolation utilisateurs, contact, modération et anti-republication.
- La note Lighthouse est une observation de laboratoire sur une page et un appareil simulé. Les pages de carte restent dépendantes du fournisseur et du réseau.
- Aucune valeur secrète, aucun compte réel et aucune sauvegarde ne sont inclus dans le dépôt.

## Vérification finale locale

Après corrections : aucun débordement à 320, 390 et 1440 px ; `/api/plan` et `/api/auth/get-session` renvoient `private, no-store`, la date impossible `dateFrom=2026-02-31` est refusée en 400. Axe 4.12.1 : zéro violation en clair et sombre, un contrôle de contraste manuel sur l’illustration. Les contrôles GitHub `quality` et `Vercel` sont verts sur `8ee82a1`.

Le candidat CLI initial a été refusé par Vercel car l’adresse d’auteur Git locale n’est pas associée au compte autorisé. Aucun domaine n’a basculé. L’enregistrement du présent rapport via le compte GitHub authentifié permet d’utiliser son identité réelle pour la suite, sans changer les permissions du projet.

Limite observée : une réponse IGN WFS de plus de 2 Mo dépasse le cache de données Next.js ; cette réponse externe peut être relue. Les caches applicatifs annoncés ci-dessus ne garantissent donc pas la mise en cache de chaque réponse fournisseur.

## Préparation de la production

- Sauvegarde PostgreSQL custom locale protégée avant changement : 58 453 410 octets, catalogue lisible, 305 entrées. Vérification du catalogue, pas une restauration complète de répétition.
- 63 empreintes de migrations existantes correspondent au dépôt ; migrations additives 064–071 appliquées ensemble dans une transaction.
- Clé de chiffrement dédiée créée en production ; secret de session existant conservé. Les deux comptes vérifiés correspondant aux anciennes adresses opérateur autorisées sont migrés vers une liste explicite d’identifiants.
- Inspection des jetons : une connexion Strava métier et un compte Google historique à convertir. Conversion atomique et idempotente prévue immédiatement avant la promotion du candidat construit avec les variables de production.
- Pas de promotion de la preview reliée à la base de démonstration. Candidat de production préparé sans attribution du domaine, puis conversion/promotion contrôlée.
- Retour arrière : les anciennes versions ne savent pas lire les nouveaux jetons chiffrés. Ne pas seulement changer d’alias ; rétablir les seuls jetons concernés à partir de la sauvegarde contrôlée ou demander une reconnexion. Ne pas restaurer toute la base en écrasant de nouvelles écritures.

## Suivi après bascule

Vérifier le domaine public, les pages/ressources et en-têtes, l’accès anonyme aux API, le consentement et les journaux Vercel. Les essais OAuth complets avec le compte personnel et la réception d’un vrai e-mail restent à faire par le titulaire ; les redirections seules ne prouvent pas le parcours complet. Le premier cycle nocturne complet n’a pas encore été observé.

Les usages collectifs Strava restent désactivés et Street View intégré reste fermé sans budgets. La vérification des droits sur les sources, des accords prestataires et des obligations juridiques de l’éditeur reste un travail externe ; ces points ne sont pas présentés comme « certifiés conformes ».

## Références

- [CNIL — conformité cookies](https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies/comment-mettre-mon-site-web-en-conformite)
- [CNIL — information et transparence](https://www.cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence)
- [CNIL — durées de conservation](https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees)
- [Vercel — déploiements](https://vercel.com/docs/deployments)
- Documentation locale Next.js 16.3.4 : polices, métadonnées, ImageResponse et en-têtes.
