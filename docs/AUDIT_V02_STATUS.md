# PelotonFR V0.2 — suivi des 61 constats

**État : en cours. Cette branche n’est pas prête à être fusionnée.**

Base auditée : `9b88b18671968a5cd63ec8d168e2e55a5aa4896e`.

## Identité retenue

Trois prototypes comparables : [index](prototypes-v02/index.html). Les données sont fictives et les services externes sont déconnectés. Choix utilisateur du 15 septembre : ambiance générale hybride 01 + 03, ambiance 02 pour le futur espace premium. Un seul logo et une famille typographique commune.

Preview des prototypes : https://pelotonfr-em5m7d3si-theos-projects-3e2cd9a8.vercel.app

## Registre

« En cours » ne signifie pas validé : les migrations n’ont pas encore été appliquées à une base de test, et aucun changement de production n’est autorisé par cette PR.

| Constat | Priorité | Sujet | État et suite |
|---|---|---|---|
| SEC-01 | P0 | Une adresse non vérifiée peut devenir un critère d’autorisation opérateur | Accès opérateur par ADMIN_USER_IDS uniquement ; tests unitaires. |
| SEC-02 | P0 | La migration des comptes fait confiance aux adresses et alias | Suppression de la migration implicite des comptes par e-mail ; récupération historique à documenter et tester. |
| SEC-03 | P1 | Le premier arrivé peut devenir responsable de n’importe quel club | Adhésions en attente ; attribution opérateur vérifiée ; tests de base de données à effectuer. |
| SEC-04 | P1 | L’association à un coureur fédéral reste une auto-déclaration | À traiter — voir proposition et critères de vérification dans l’audit. |
| SEC-05 | P1 | L’ancien OAuth Strava emploie un état prévisible et réutilisable | Ancien callback OAuth désactivé (410) ; connexion via Better Auth ; test OAuth réel à effectuer. |
| SEC-06 | P1 | Les jetons Strava sont stockés et dupliqués sans chiffrement applicatif | Chiffrement AES-GCM du stockage métier et chiffrement Better Auth ; migration des jetons historiques et tests intégrés à terminer. |
| SEC-07 | P1 | La configuration du client PostgreSQL désactive la vérification du certificat | Vérification TLS complète dans le pool PostgreSQL. |
| SEC-08 | P1 | Les écritures publiques n’ont pas de budget d’abus visible dans l’application | Compteurs atomiques partagés et limites contact/adhésion ; autres routes à couvrir. |
| SEC-09 | P2 | La validation des paramètres n’est pas homogène | Validation UUID, message et chemins de retour ajoutée ; couverture globale à terminer. |
| SEC-10 | P2 | Les réponses n’appliquent pas plusieurs protections navigateur usuelles | En-têtes de défense et noindex des previews ajoutés ; vérification navigateur à effectuer. |
| SEC-11 | P2 | Une dépendance de développement possède un avis de sécurité élevé | Correctif js-yaml via override ; audit npm à vérifier. |
| DON-01 | P1 | La nouvelle adresse du profil peut rester absente des données métier | Seule une adresse vérifiée alimente le compte métier ; propagation après mise à jour Better Auth ; test intégré à terminer. |
| DON-02 | P1 | Un e-mail ignoré peut être compté comme envoyé | Transport absent, adresse fictive et refus fournisseur lèvent une erreur ; tests sans envoi réel. |
| DON-03 | P1 | Déconnecter Strava ne purge pas les données annoncées comme supprimées | À traiter — voir proposition et critères de vérification dans l’audit. |
| DON-04 | P1 | Le dépôt de circuit confond identifiant Better Auth et UUID métier | À traiter — voir proposition et critères de vérification dans l’audit. |
| DON-05 | P1 | Un dépôt utilisateur écrase immédiatement le circuit public | À traiter — voir proposition et critères de vérification dans l’audit. |
| DON-06 | P1 | Rejoindre à nouveau son club peut retirer son rôle de responsable | Rôle conservé en cas de réinscription, adhésion vérifiée unique ; transfert du dernier responsable à compléter. |
| DON-07 | P1 | Une mise à jour d’activité n’est pas limitée à son propriétaire | Mise à jour des activités liée aussi au propriétaire user_id. |
| DON-08 | P1 | Le brief transforme une sortie entière en longueur de tour | À traiter — voir proposition et critères de vérification dans l’audit. |
| DON-09 | P1 | L’horaire de départ estimé contredit les informations organisateur | À traiter — voir proposition et critères de vérification dans l’audit. |
| DON-10 | P1 | Le compte à rebours des engagements utilise midi comme heure courante | À traiter — voir proposition et critères de vérification dans l’audit. |
| DON-11 | P1 | Le brief peut annoncer la mauvaise date et heure de clôture | À traiter — voir proposition et critères de vérification dans l’audit. |
| DON-12 | P2 | Une épreuve de plusieurs jours devient passée dès son premier jour | À traiter — voir proposition et critères de vérification dans l’audit. |
| DON-13 | P2 | Le langage du brief donne trop de certitude aux inférences | À traiter — voir proposition et critères de vérification dans l’audit. |
| DON-14 | P1 | L’accueil conserve des courses et une fraîcheur périmées | À traiter — voir proposition et critères de vérification dans l’audit. |
| UX-01 | P1 | La liste déborde horizontalement sur téléphone | À traiter — voir proposition et critères de vérification dans l’audit. |
| UX-02 | P1 | Des commandes perdent leur nom accessible sur mobile | À traiter — voir proposition et critères de vérification dans l’audit. |
| UX-03 | P1 | Les textes secondaires et annulations manquent de contraste | À traiter — voir proposition et critères de vérification dans l’audit. |
| UX-04 | P2 | La sémantique de certaines pages doit être corrigée | À traiter — voir proposition et critères de vérification dans l’audit. |
| UX-05 | P2 | Une ancienne réponse peut remplacer la ville recherchée | À traiter — voir proposition et critères de vérification dans l’audit. |
| UX-06 | P2 | La fiche duplique la liste des engagés | À traiter — voir proposition et critères de vérification dans l’audit. |
| UX-07 | P2 | La connexion perd l’intention d’ajouter une course | À traiter — voir proposition et critères de vérification dans l’audit. |
| UX-08 | P1 | Le bouton Strava peut échouer silencieusement | Déconnexion Strava : erreur affichée et état occupé toujours libéré ; synchronisation durable à terminer. |
| UX-09 | P2 | Le parcours e-mail manque d’issues après un envoi manqué | À traiter — voir proposition et critères de vérification dans l’audit. |
| UX-10 | P2 | L’accueil démontre trop peu le bénéfice propre au produit | À traiter — voir proposition et critères de vérification dans l’audit. |
| PERF-01 | P1 | Chaque bouton de saison recharge son propre plan | À traiter — voir proposition et critères de vérification dans l’audit. |
| PERF-02 | P1 | La première synchronisation concentre six ans de travail dans une requête | À traiter — voir proposition et critères de vérification dans l’audit. |
| PERF-03 | P1 | La synchronisation masque certains succès partiels | À traiter — voir proposition et critères de vérification dans l’audit. |
| PERF-04 | P1 | Le renouvellement Strava a plusieurs écrivains non coordonnés | Rotation des jetons sous verrou de connexion et synchronisation des deux stockages ; tests concurrents à terminer. |
| PERF-05 | P1 | Une dépendance routière peut bloquer toute la fiche | À traiter — voir proposition et critères de vérification dans l’audit. |
| PERF-06 | P2 | Les lectures répétées et limites de listes demandent une optimisation mesurée | À traiter — voir proposition et critères de vérification dans l’audit. |
| PERF-07 | P2 | La région des fonctions mérite une comparaison avec la base et les lecteurs | À traiter — voir proposition et critères de vérification dans l’audit. |
| OPS-01 | P1 | La recette de préversion échouait malgré un déploiement READY | À traiter — voir proposition et critères de vérification dans l’audit. |
| OPS-02 | P1 | Les logs Actions peuvent publier les adresses des destinataires | Adresses retirées des logs des alertes et erreurs fournisseur masquées ; recherche globale à terminer. |
| OPS-03 | P1 | Les pull requests n’ont pas de garde de qualité applicative | Workflow qualité et premiers tests ; protection de branche et CI distante à vérifier. |
| OPS-04 | P1 | Le bootstrap et l’environnement restent insuffisamment documentés | À traiter — voir proposition et critères de vérification dans l’audit. |
| OPS-05 | P1 | Les migrations sont non atomiques et le mode à blanc écrit | Transactions par migration, dry-run en lecture seule et rejet des changements de checksum ; tests intégrés à effectuer. |
| OPS-06 | P1 | Les erreurs de données peuvent ressembler à une liste vide ou une disparition | À traiter — voir proposition et critères de vérification dans l’audit. |
| OPS-07 | P2 | Les nouveaux contrôles nocturnes ont besoin d’un cycle de recette observable | À traiter — voir proposition et critères de vérification dans l’audit. |
| OPS-08 | P2 | Le sitemap est figé et l’URL de référence est dispersée | À traiter — voir proposition et critères de vérification dans l’audit. |
| CONF-01 | P1 | Le contact publié utilise un domaine non résolu | Formulaire avec suivi privé et boîte de traitement opérateur ; domaine Vercel conservé ; test intégré à effectuer. |
| CONF-02 | P1 | La notice ne décrit plus tous les traitements actuels | À traiter — voir proposition et critères de vérification dans l’audit. |
| CONF-03 | P0 | Les usages collectifs de Strava demandent une validation contractuelle | À traiter — voir proposition et critères de vérification dans l’audit. |
| CONF-04 | P1 | L’opposition à la republication doit survivre aux collectes | À traiter — voir proposition et critères de vérification dans l’audit. |
| NEW-01 | P1 | Le plafond Street View ne garantit pas la gratuité annoncée | À traiter — voir proposition et critères de vérification dans l’audit. |
| NEW-02 | P2 | Le plein écran conserve son état après une sortie par Échap | À traiter — voir proposition et critères de vérification dans l’audit. |
| NEW-03 | P2 | Une erreur du chargement Google reste mémorisée pour tous les essais | À traiter — voir proposition et critères de vérification dans l’audit. |
| NEW-04 | P1 | Une panne de métadonnées peut devenir une couverture nulle pendant 180 jours | À traiter — voir proposition et critères de vérification dans l’audit. |
| NEW-05 | P1 | Le garde-fou nocturne supprime des données sur des heuristiques trop générales | À traiter — voir proposition et critères de vérification dans l’audit. |
| NEW-06 | P1 | Le nouveau place-check peut écrire même en mode à blanc | À traiter — voir proposition et critères de vérification dans l’audit. |
| NEW-07 | P2 | La correction de catégories ne répare pas automatiquement les valeurs déjà remplies | À traiter — voir proposition et critères de vérification dans l’audit. |

## Conditions avant fusion

- Choix et déclinaison de l’identité.
- Tous les scénarios de l’audit traités ou explicitement arbitrés.
- Base de preview isolée, sans copie des comptes ni des jetons de production.
- Migrations, parcours de connexion, autorisations intercomptes et suppression/revocation Strava vérifiés.
- CI distante verte, tests navigateur desktop/mobile et mesure des performances.
- Validation des usages collectifs des données Strava et des mentions légales ; aucun accord externe ne peut être déduit du code.
- Autorisation explicite de mise en production ; cette PR reste en brouillon jusque-là.
