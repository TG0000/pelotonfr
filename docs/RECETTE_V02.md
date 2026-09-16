# Recette de la V0.2 — 16 septembre 2026

## Version à essayer

[Préversion de la branche](https://pelotonfr-git-codex-v02-audit-brand-theos-projects-3e2cd9a8.vercel.app) · [PR #2 en brouillon](https://github.com/TG0000/pelotonfr/pull/2)

Vercel protège cet accès ; une connexion Vercel ou un lien temporaire de partage est nécessaire. Les trois anciennes pages de concepts sont distinctes de cette application.

Cette préversion utilise une base séparée contenant trois courses « Démo ». Les comptes et jetons de production n’ont pas été copiés. Les 71 migrations ont été appliquées uniquement à cette base de test.

## Parcours pour Théo

1. **Identité et navigation** : regarder l’accueil, le calendrier et une fiche sur ordinateur puis téléphone. L’univers général associe crème, bleu et corail ; le graphite/bleu électrique reste prévu pour les futurs espaces premium. Aucune facturation n’est activée.
2. **Recherche** : alterner calendrier/liste/carte, filtrer FFC/FSGT/UFOLEP et revenir à toutes les courses. Les noms « Démo » désignent des événements fictifs.
3. **Saison** : ajouter une course avant connexion, se connecter par e-mail, retrouver cette course, la confirmer au programme puis la retirer. Aucun rattachement à un coureur fédéral n’est nécessaire. Le vrai acheminement du lien e-mail reste à tester avec sa propre adresse.
4. **Fiche course** : consulter horaire organisateur, longueur du circuit et source ; tester plein écran puis Échap. Le tracé de démonstration est fictif.
5. **Contact** : créer une demande de test et conserver son code privé ; le suivi fonctionne sans adresse sur un domaine acheté. Les réponses demandent un opérateur configuré dans `ADMIN_USER_IDS`.

Strava/Google OAuth ne sont pas configurés sur cette branche. Les usages collectifs Strava restent désactivés ; Street View intégré reste fermé sans budgets explicites. Leur absence ne doit pas apparaître comme une connexion cassée.

## Contrôles techniques

- TypeScript, ESLint, tests et build sous Node 22.
- 17 tests unitaires : identité, chiffrement, transport e-mail simulé, dates de Paris, horaires, validation des requêtes/filtres, workflow YAML, panne/reprise Google et couverture inconnue.
- 12 tests d’intégration sur la base isolée : séparation des comptes, adhésions concurrentes, limites atomiques, contact privé et limite visiteur, rollback, synchronisation/reprise/purge Strava, oppositions durables, migration/rotation des jetons, modération des circuits, dry-run sans écriture, saison sans profil fédéral et compteurs de liste.
- Aucun e-mail envoyé pour la recette ; aucune requête Strava réelle ni panorama Google payant.
- Navigateur à 390 px : accueil, calendrier, fiche, contact, saison ; aucun débordement constaté sur ces vues. Axe ne relève aucune violation sur les vues testées après corrections. Les textes de l’illustration demandent une vérification visuelle, axe ne sait pas déterminer leur fond ; ce contrôle ne constitue pas une certification d’accessibilité.
- Preview distante `cda8b09` : session synthétique reconnue, ajout avant connexion restauré, API de plan 200, filtre invalide 400, CSP/anti-frame/nosniff/noindex présents. Le programme d’un compte sans profil fédéral est visible. Le contrôle distant a identifié le bandeau de préversion hors repère : il est désormais un `aside` nommé.

## Mesure des requêtes SQL

Requêtes réelles de `getRaces`, `getRacesForMap` et `getRacesForCalendar`, exécutées dans une transaction avec tables temporaires : **10 000 courses et 100 000 engagements synthétiques**, puis rollback. Aucune ligne de ce jeu n’a été publiée. `EXPLAIN (ANALYZE, BUFFERS)` ; statistiques temporaires actualisées. Les clubs, classements et prévisions de grande taille ne sont pas représentés.

| Requête | Avant | Après |
|---|---:|---:|
| Page de 24 courses, tri par date | 267,1 ms | 59,7 ms |
| Page autour d’une position, 603 courses admissibles | 14,6 ms | 7,5 ms |
| Page par texte, 100 courses admissibles | 14,1 ms | 7,5 ms |

La cause vérifiée : le sous-calcul du nombre d’engagés s’exécute **24 fois au lieu de 10 000** sur une page triée par date. Pour le tri par engagés, le calcul reste effectué avant pagination afin de conserver le classement exact. Les tests vérifient les compteurs sur plusieurs tris.

Après modification : décompte global 35,8 ms, carte plafonnée à 2 000 résultats 11,2 ms, calendrier de 42 jours/2 407 courses 4,2 ms. Ce sont des observations uniques, sans mesure statistique de p95 ni trafic concurrent. Les caches et la variabilité de la base influencent les durées ; le nombre d’exécutions évitées est la preuve la plus robuste. Cela ne mesure ni le réseau, ni le rendu navigateur, ni la latence de production.

Vercel confirme les fonctions de la préversion en `lhr1`, dans la région de la base (Londres). Aucun gain spécifique au changement de région n’est revendiqué.

## Avant les premiers vrais utilisateurs

Consulter le [registre détaillé des 61 constats](AUDIT_V02_STATUS.md). Restent notamment la recette OAuth/e-mail réelle, le cycle nocturne complet, la configuration des opérateurs, la préparation des migrations de production et la validation externe des traitements/conditions Strava. Les données historiques sans provenance restent hors publication. La fusion et la mise en production attendent la validation de Théo.
