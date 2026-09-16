# PelotonFR V0.2 — suivi des 61 constats

**16 septembre 2026 — PR en brouillon ; aucune fusion ni mise en production.**

Base auditée : `9b88b18671968a5cd63ec8d168e2e55a5aa4896e`. [PR #2](https://github.com/TG0000/pelotonfr/pull/2).

## Identité

Décision utilisateur : directions 01 éditorial sport + 03 esprit club pour le site ; direction 02 graphite/bleu électrique pour le futur premium. Logo commun, Manrope, Barlow Condensed et IBM Plex Mono. Aucune facturation ou attribution premium inventée.

## Preuves et limites

- 17 tests unitaires et 12 tests d’intégration réussis sur la base dédiée. Aucun compte ou jeton de production copié.
- Build local sous Node 22 réussi ; schéma d’authentification inspecté ; CI et Vercel réussis sur 4bc5e81. Les derniers compléments font l’objet d’une nouvelle recette.
- Les mentions « corrigé » décrivent le scénario couvert, pas une garantie générale d’absence de défaut. Les validations restantes sont nommées ci-dessous.
- Les usages collectifs Strava et Street View payant restent fermés sans configuration explicite. Les validations contractuelles et de facturation ne se déduisent pas du code.

| Constat | Priorité | Sujet | Correction, preuve et suite |
|---|---|---|---|
| SEC-01 | P0 | Une adresse non vérifiée peut devenir un critère d’autorisation opérateur | Corrigé — autorisation par identifiants Better Auth explicites ; test unitaire. |
| SEC-02 | P0 | La migration des comptes fait confiance aux adresses et alias | Corrigé — aucune migration implicite par e-mail ou alias ; scénario intercomptes testé en base isolée. |
| SEC-03 | P1 | Le premier arrivé peut devenir responsable de n’importe quel club | Corrigé — toute adhésion attend une revue opérateur ; aucun rôle au premier arrivé ; concurrence testée. |
| SEC-04 | P1 | L’association à un coureur fédéral reste une auto-déclaration | Corrigé pour la bêta — association déclarative explicitement non vérifiée, dissociation disponible, aucun droit club associé. |
| SEC-05 | P1 | L’ancien OAuth Strava emploie un état prévisible et réutilisable | Ancien callback retiré (410), état OAuth confié à Better Auth. Recette OAuth réelle restant à faire sur une application de test dédiée. |
| SEC-06 | P1 | Les jetons Strava sont stockés et dupliqués sans chiffrement applicatif | Corrigé et testé — AES-GCM métier, chiffrement Better Auth, migration atomique à blanc/application/idempotence. Migration de production non exécutée. |
| SEC-07 | P1 | La configuration du client PostgreSQL désactive la vérification du certificat | Corrigé — TLS verify-full ; test unitaire et connexions réelles à la base isolée. |
| SEC-08 | P1 | Les écritures publiques n’ont pas de budget d’abus visible dans l’application | Budgets atomiques par compte/visiteur et garde globale contact ; protections d’origine sur les mutations API. Test concurrent du compteur. Contact borné à cinq créations par visiteur/heure, avec garde globale ; WAF fournisseur non configuré. |
| SEC-09 | P2 | La validation des paramètres n’est pas homogène | UUID, corps JSON bornés, origine, coordonnées, filtres et retour local validés sur les mutations principales. Tests null/array/malformed/oversized ; mêmes bornes sur calendrier et API, dates impossibles/coordonnées partielles/pages non entières refusées. |
| SEC-10 | P2 | Les réponses n’appliquent pas plusieurs protections navigateur usuelles | En-têtes CSP défensifs, anti-frame, nosniff, referrer et noindex preview. En-têtes contrôlés sur la preview Vercel ; filtre invalide renvoie 400. |
| SEC-11 | P2 | Une dépendance de développement possède un avis de sécurité élevé | Override js-yaml ; npm audit sans vulnérabilité au contrôle du 16 septembre sous Node 22. |
| DON-01 | P1 | La nouvelle adresse du profil peut rester absente des données métier | Corrigé — propagation depuis le profil Better Auth vérifié ; changement vérifié testé en base. |
| DON-02 | P1 | Un e-mail ignoré peut être compté comme envoyé | Corrigé — transport absent/refus/adresse fictive lèvent une erreur, aucun faux succès ; tests avec fournisseur simulé. |
| DON-03 | P1 | Déconnecter Strava ne purge pas les données annoncées comme supprimées | Corrigé pour les données attribuables — purge activités/traces/propositions/versions, révocation chiffrée avec réessai. Test panne fournisseur. Agrégats historiques sans provenance maintenus hors publication, revue encore nécessaire. |
| DON-04 | P1 | Le dépôt de circuit confond identifiant Better Auth et UUID métier | Corrigé — résolution de l’UUID métier avant le dépôt ; format du lien et de la course validé. |
| DON-05 | P1 | Un dépôt utilisateur écrase immédiatement le circuit public | Corrigé — dépôt en attente, revue opérateur, archive du tracé précédent, invalidation des images/couvertures ; test base absence d’écrasement et approbation idempotente. |
| DON-06 | P1 | Rejoindre à nouveau son club peut retirer son rôle de responsable | Rôle conservé à la réadhésion ; une adhésion vérifiée maximum ; départ du dernier responsable refusé si d’autres membres restent. Revue opérateur du successeur ; test de réadhésion passé. |
| DON-07 | P1 | Une mise à jour d’activité n’est pas limitée à son propriétaire | Corrigé — mises à jour limitées au propriétaire ; sauvegarde et synchronisation liées au user_id. |
| DON-08 | P1 | Le brief transforme une sortie entière en longueur de tour | Corrigé — circuit organisateur séparé du total de trace ; aucune conversion du D+ total en D+ par tour dans le brief. Test huit tours/trace longue. |
| DON-09 | P1 | L’horaire de départ estimé contredit les informations organisateur | Corrigé — horaire organisateur prioritaire et étiqueté premier départ de la réunion ; estimation après les dossards ; tests unitaires. |
| DON-10 | P1 | Le compte à rebours des engagements utilise midi comme heure courante | Corrigé — instant serveur partagé, plus de midi fictif pour le compte à rebours. |
| DON-11 | P1 | Le brief peut annoncer la mauvaise date et heure de clôture | Corrigé — jour et clôture en Europe/Paris ; tests UTC/minuit/été/hiver. |
| DON-12 | P2 | Une épreuve de plusieurs jours devient passée dès son premier jour | Corrigé — date de fin utilisée pour le statut passé et les requêtes à venir. |
| DON-13 | P2 | Le langage du brief donne trop de certitude aux inférences | Libellés moins affirmatifs : « Résultats récents », difficulté possible, tours détectés/estimés, provenance horaire. Relecture éditoriale globale à terminer. |
| DON-14 | P1 | L’accueil conserve des courses et une fraîcheur périmées | Accueil revalidé toutes les 5 minutes ; erreur de chargement distincte d’une absence de course. |
| UX-01 | P1 | La liste déborde horizontalement sur téléphone | Liste et fiche course mobiles vérifiées à 390 px sans débordement ; barre calendrier rendue sécable. Autres largeurs et page carte à contrôler. |
| UX-02 | P1 | Des commandes perdent leur nom accessible sur mobile | Libellés ajoutés à affichage, tri, saison, localisation, recherche coureur ; contrôles lecteur d’écran en cours. |
| UX-03 | P1 | Les textes secondaires et annulations manquent de contraste | Palette renforcée ; contrastes de lieux/fédérations/clôture corrigés après axe. Accueil clair/sombre, calendrier, contact et saison contrôlés ; contrôle humain complet restant nécessaire. |
| UX-04 | P2 | La sémantique de certaines pages doit être corrigée | dl/dt/dd corrigés, repère main de connexion, bouton saison séparé du lien de course. Axe ma-saison, calendrier et fiche course : 0 violation. |
| UX-05 | P2 | Une ancienne réponse peut remplacer la ville recherchée | Requêtes géographiques annulées et réponse obsolète ignorée ; sélection/clavier et libellé combobox. |
| UX-06 | P2 | La fiche duplique la liste des engagés | Un seul bloc d’engagés ; la seconde analyse ne répète plus une start-list publiée ; catégories traduites. |
| UX-07 | P2 | La connexion perd l’intention d’ajouter une course | Course conservée 15 minutes dans sessionStorage, retour vers la fiche et ajout après connexion ; restauration vérifiée sur Vercel avec session synthétique, sans envoi d’e-mail réel. Ma saison accessible sans profil fédéral, confirmation et retrait actualisent les sections. |
| UX-08 | P1 | Le bouton Strava peut échouer silencieusement | Erreurs de connexion/synchronisation/déconnexion affichées ; états occupés libérés ; reprise de synchronisation persistée. |
| UX-09 | P2 | Le parcours e-mail manque d’issues après un envoi manqué | Échec réseau pris en charge, correction d’adresse et renvoi disponibles ; fournisseurs absents masqués dans la connexion. |
| UX-10 | P2 | L’accueil démontre trop peu le bénéfice propre au produit | Accueil entièrement refait : bénéfice, recherche locale, courses réelles/démo, étapes de préparation ; identité 01 + 03 appliquée. |
| PERF-01 | P1 | Chaque bouton de saison recharge son propre plan | Provider unique par session ; un GET plan abouti pour toute la liste observé en navigateur, état réinitialisé au changement de compte. |
| PERF-02 | P1 | La première synchronisation concentre six ans de travail dans une requête | Tâche persistée 30/90/365 jours, 50 activités par page ; bail, limites partagées et reprise navigateur. Aucun import de six ans dans une requête. |
| PERF-03 | P1 | La synchronisation masque certains succès partiels | Succès final seulement après la dernière page ; erreurs/quota gardent un état incomplet ; test 51 activités/deux pages et quota. |
| PERF-04 | P1 | Le renouvellement Strava a plusieurs écrivains non coordonnés | Rotation sous verrou de connexion, deux stockages mis à jour ; trois renouvellements concurrents = un appel Strava dans le test. |
| PERF-05 | P1 | Une dépendance routière peut bloquer toute la fiche | IGN borné à 2,5 secondes ; détail continue avec données absentes si fournisseur indisponible. |
| PERF-06 | P2 | Les lectures répétées et limites de listes demandent une optimisation mesurée | React.cache sur lectures partagées/session/course ; limite carte explicitée à 2 000. Profil sur 10 000 courses/100 000 engagements fictifs : compteur des engagés déplacé après pagination (24 appels au lieu de 10 000) hors tri par engagés. Détails dans RECETTE_V02.md. |
| PERF-07 | P2 | La région des fonctions mérite une comparaison avec la base et les lecteurs | Base identifiée en eu-west-2 ; branche configurée en lhr1 selon recommandation Vercel. Gain de latence non encore mesuré ; aucune promesse chiffrée. |
| OPS-01 | P1 | La recette de préversion échouait malgré un déploiement READY | Base isolée et secrets propres à la branche ; 71 migrations appliquées, données fictives et connexion synthétique testées localement. Preview READY sur 4bc5e81 : lecture et écriture de saison, session synthétique et en-têtes vérifiés. Recette des derniers compléments en cours. |
| OPS-02 | P1 | Les logs Actions peuvent publier les adresses des destinataires | Destinataires retirés des logs d’alertes/rappels ; refus fournisseur sans corps de réponse. Recherche ciblée des logs d’e-mails sans résultat. |
| OPS-03 | P1 | Les pull requests n’ont pas de garde de qualité applicative | CI qualité présente ; main protégé avec quality + Vercel obligatoires, PR et discussions résolues, y compris administrateur. PR #2 reste brouillon. |
| OPS-04 | P1 | Le bootstrap et l’environnement restent insuffisamment documentés | README/env corrigés, Node 22 fixé, guide de préparation des jetons. Schéma Better Auth inspecté : aucune table/colonne/index manquant ; avertissement int8 lastRequest à documenter. |
| OPS-05 | P1 | Les migrations sont non atomiques et le mode à blanc écrit | Lot complet transactionnel, verrou, empreintes strictes, dry-run lecture seule ; commande réelle mise en échec testée : écriture et journal annulés. |
| OPS-06 | P1 | Les erreurs de données peuvent ressembler à une liste vide ou une disparition | Erreurs visibles sur accueil/calendrier/détail/département/start-list ; session ne masque plus une panne en déconnexion. Autres enrichissements facultatifs restent omis en cas de panne. |
| OPS-07 | P2 | Les nouveaux contrôles nocturnes ont besoin d’un cycle de recette observable | Garde-fou nocturne non destructif, mode à blanc testé ; collecteur Strava désactivé exclu des alertes. Cycle complet planifié sur environnement isolé et notification réelle non exécutés. |
| OPS-08 | P2 | Le sitemap est figé et l’URL de référence est dispersée | Origine canonique centralisée sur domaine Vercel ; sitemap revalidé toutes les heures et previews non indexables. |
| CONF-01 | P1 | Le contact publié utilise un domaine non résolu | Contact réel via tickets à code privé + boîte opérateur ; test du cloisonnement et du stockage de l’empreinte ; aucune fausse adresse publiée. |
| CONF-02 | P1 | La notice ne décrit plus tous les traitements actuels | Notice réécrite selon traitements actuels, rétention contact, Strava privé, oppositions et prestataires. Validation juridique externe restant à obtenir. |
| CONF-03 | P0 | Les usages collectifs de Strava demandent une validation contractuelle | Usage collectif Strava fermé par défaut dans lectures/export/images/collecteurs/dépôts. Validation contractuelle externe toujours requise avant activation. |
| CONF-04 | P1 | L’opposition à la republication doit survivre aux collectes | Registre minimal d’empreintes + suppression transactionnelle + barrières à l’import ; revue opérateur ; test réimport coureur/classement/engagement refusé, homonyme distinct conservé. |
| NEW-01 | P1 | Le plafond Street View ne garantit pas la gratuité annoncée | Aucune promesse de gratuité ; budgets jour/mois explicites, sérialisés, désactivation sans budget, limite visiteur. Restrictions et facturation Google à vérifier côté fournisseur avant activation. |
| NEW-02 | P2 | Le plein écran conserve son état après une sortie par Échap | fullscreenchange, sortie visible et repli CSS ; entrée native puis Échap vérifiés, état et classes remis à zéro. |
| NEW-03 | P2 | Une erreur du chargement Google reste mémorisée pour tous les essais | Promesse Google rejetée réinitialisée, script retiré, timeout de chargement complet, nettoyage des écouteurs. Réessai réutilise sa réservation ; panne réseau puis reprise et partage de requête testés avec navigateur simulé. |
| NEW-04 | P1 | Une panne de métadonnées peut devenir une couverture nulle pendant 180 jours | Réponse inconnue n’écrit aucune couverture ; hash du tracé lie cache et géométrie, couverture périmée ignorée. Tests fournisseur 503/refus/réponse invalide/hors ligne puis rétablissement ; couverture incomplète non publiable, zéro confirmé distingué. |
| NEW-05 | P1 | Le garde-fou nocturne supprime des données sur des heuristiques trop générales | Plus aucune suppression/déliaison/réappariement automatique sur distance, département ou nom ; anomalies conservées pour revue. Dry-run sans journal testé. |
| NEW-06 | P1 | Le nouveau place-check peut écrire même en mode à blanc | Dry-run sans création de lieu ni journal ; inspection des seuls lieux existants, inconnus laissés à examiner ; commande testée en base isolée. |
| NEW-07 | P2 | La correction de catégories ne répare pas automatiquement les valeurs déjà remplies | Relecture périodique des catégories déjà remplies et mise à jour si différentes ; --categories --force pour reprise ciblée. Collecte réelle volontairement non exécutée en production. |

## Avant fusion

1. Confirmer les scénarios navigateur sur la dernière preview, puis tester les connexions externes avec les comptes autorisés.
2. Traiter ou arbitrer explicitement les validations restantes du tableau ; ne pas activer Strava collectif avant revue contractuelle.
3. Préparer sauvegarde, clés, migration de jetons et revue des adhésions historiques ; aucune commande de production exécutée ici.
4. Obtenir le retour utilisateur sur la V0.2 et son autorisation explicite de publication. La PR reste en brouillon.
