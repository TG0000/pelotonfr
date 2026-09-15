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

La migration 064 décrit le schéma d'authentification. La 066 met les adhésions historiques en attente de vérification : anticiper la revue des clubs avant toute mise en production. La migration des anciens jetons OAuth reste un préalable à la fusion de la V0.2.

## V0.2 en cours

Le [registre des 61 constats](docs/AUDIT_V02_STATUS.md) distingue les corrections en cours des validations encore nécessaires. La branche `codex/v0.2-audit-brand` et sa PR restent en brouillon. Aucun déploiement de production ne fait partie des tests.

L'identité retient les directions éditorial sportif + esprit club pour le site, performance sombre pour un futur espace premium. Aucune facturation ni règle d'abonnement n'est implémentée à ce stade.
