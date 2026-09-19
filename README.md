# PelotonFR

Calendrier du cyclisme amateur français : courses FFC, FSGT et UFOLEP, préparation de saison et coordination des clubs. Next.js 16, React 19, Better Auth et PostgreSQL/PostGIS (Neon).

## Développement

Node.js 22 et npm sont requis.

```sh
npm ci
cp .env.example .env.local
# Renseigner une base de développement et des secrets générés indépendamment.
npm run db:migrate:dry
npm run db:migrate
npm run dev
```

Le calendrier peut se consulter sans compte. Les connexions par lien e-mail nécessitent un transport Brevo ou Resend réellement configuré. Strava et Google sont facultatifs et exigent leurs propres origines de retour OAuth. Ne copiez jamais les identifiants d'une base de production dans une preview.

## Vérification

```sh
npm run lint
npm run typecheck
npm test
npm audit --audit-level=high
npm run build
```

`npm run test:integration` écrit des comptes synthétiques puis les efface. Il refuse toute base dont le nom n'est pas `pelotonfr_preview_v02`. La connexion doit être fournie par l'environnement ; les tests unitaires n'envoient aucun e-mail.

## Authentification et données

- `BETTER_AUTH_SECRET` protège les sessions et le stockage OAuth de Better Auth.
- `TOKEN_ENCRYPTION_KEY` est une clé AES de 32 octets, encodée sur 64 caractères hexadécimaux, pour les jetons Strava du stockage métier. Une clé absente ou incorrecte provoque un refus ; elle ne doit pas être changée sans migration.
- `ADMIN_USER_IDS` contient exclusivement des identifiants Better Auth. Une adresse e-mail ne confère aucun droit opérateur.
- Les demandes de contact se traitent dans `/admin/contact`, les vérifications de clubs dans `/admin/clubs`.
- Le retour OAuth Strava historique `/api/strava/callback` est retiré. L'intégration actuelle utilise Better Auth.

## Migrations

Les fichiers SQL appliqués sont immuables. Le script vérifie leurs empreintes avant d'écrire. Les migrations en attente et leurs enregistrements sont validés ensemble, dans une transaction protégée contre deux exécutions concurrentes. Un échec annule le lot. `--dry-run` est strictement en lecture seule.

La migration 064 décrit le schéma d'authentification. La 066 met les adhésions historiques en attente de vérification : anticiper la revue des clubs avant toute mise en production. Les migrations 067–071 ajoutent les tâches Strava, la révocation différée, la version des couvertures Street View, les oppositions durables et la modération des circuits.

Pour préparer les anciens jetons Strava : `npx tsx scripts/db/encrypt-strava-tokens.ts` inspecte sans écrire ; `--apply` chiffre les deux stockages dans une transaction. Sauvegarder d’abord, conserver les mêmes secrets, suspendre les écritures OAuth pendant cette opération. Un format inconnu ou une mauvaise clé provoque un refus et un rollback ; prévoir une reconnexion individuelle. Ne jamais exécuter cette préparation sur la production depuis la recette.

## V0.2 en cours

Le [registre des 61 constats](docs/AUDIT_V02_STATUS.md) distingue les corrections en cours des validations encore nécessaires. La branche `codex/v0.2-audit-brand` et sa PR restent en brouillon. Aucun déploiement de production ne fait partie des tests.

L'identité retient les directions éditorial sportif + esprit club pour le site, performance sombre pour un futur espace premium. Aucune facturation ni règle d'abonnement n'est implémentée à ce stade.

## Services externes et recette

- Fonctions configurées à Londres (`lhr1`), près de la base Neon `eu-west-2`. [Documentation Vercel](https://vercel.com/docs/functions/configuring-functions/region). Node 22 est fixé dans `engines` et dans la CI.
- `ENABLE_PUBLIC_STRAVA` : la porte de la version premium. Vide ou absente, tout ce qui vient de Strava est visible — le circuit, le vent, la route lue en photo, Street View. Posée à `false`, ces pages se referment et les activités ne sont plus ingérées. Une couleur premium ne donne aucun droit.
- `/admin/circuits` permet la revue des propositions ; `/admin/confidentialite` traite les oppositions validées. Un nom seul demande une vérification des homonymes.
- Street View intégré exige `GOOGLE_MAPS_BROWSER_KEY`, `STREETVIEW_DAILY_CAP` et `STREETVIEW_MONTHLY_CAP`. Les plafonds d’ouvertures ne sont pas des plafonds de facture : restrictions API/domaine, quotas fournisseur et suivi de facturation sont nécessaires.
- `place-check --dry-run` consulte uniquement les lieux déjà connus et ne géocode pas les inconnus ; aucun lieu ni journal de collecte n’est écrit. `data-guard` signale les anomalies pour revue et ne supprime plus les tracés ou liens de course sur une distance supposée aberrante.
- La base de preview contient seulement des courses « Démo » et des comptes de test. La recette ne déclenche pas les collecteurs ni les envois réels.
