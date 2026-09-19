# Préparer « Continuer avec Apple »

L’intégration Better Auth est prête mais inactive. Le compte Apple Developer gratuit ne permet pas de configurer cette connexion web. Aucun achat ni abonnement n’a été engagé.

## Activation ultérieure

1. Obtenir un abonnement Apple Developer actif, seulement sur décision du propriétaire.
2. Enregistrer un App ID principal avec Sign in with Apple, puis un **Services ID** web associé. Le Services ID, pas le Bundle ID natif, devient `APPLE_CLIENT_ID`.
3. Enregistrer le domaine `pelotonfr.com` et le retour exact `https://pelotonfr.com/api/auth/callback/apple`. Apple refuse localhost : c'est pour ça que cette étape attendait un vrai domaine.
4. Créer la clé Sign in with Apple et conserver son fichier `.p8` dans un emplacement protégé. Ne pas le coller dans GitHub, une PR ou une conversation.
5. Configurer côté Vercel, environnement concerné : `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`. La clé accepte les retours ligne réels ou `\n`. Aucun secret `NEXT_PUBLIC_*`.
6. Reconstruire le déploiement : le bouton n’apparaît que lorsque les quatre variables sont renseignées. Le JWT client est signé en ES256 à l’initialisation serveur, durée 180 jours ; pas de JWT statique à recopier périodiquement. La clé Apple reste révocable et doit être renouvelée si compromise.
7. Enregistrer l’expéditeur de courrier auprès du **Private Email Relay** Apple avant de tester « Masquer mon adresse e-mail ».

## Recette requise avant activation publique

- Connexion initiale, retour POST Apple, conservation du nom et de l’adresse fournis.
- Nouvelle connexion avec le même identifiant Apple quand les informations de profil ne sont plus renvoyées.
- « Masquer mon adresse e-mail », réception du courrier via le relais.
- Annulation/refus Apple et erreur réseau : retour compréhensible, aucune création partielle non maîtrisée.
- Comptes existants : pas de rapprochement automatique par une adresse arbitraire ; association explicite depuis un compte connecté à valider avant de l’exposer.
- État OAuth/nonces et origine : validation Better Auth conservée ; seule l’origine officielle `https://appleid.apple.com` ajoutée à la liste de confiance pour le retour POST.
- Chiffrement des jetons au repos par Better Auth ; aucune clé privée dans le bundle navigateur.

Le test automatisé vérifie la désactivation si configuration incomplète, la signature ES256 avec une clé synthétique, les claims Apple, l’expiration sous six mois et le refus d’une clé invalide. Il ne prouve pas un échange avec Apple tant que les identifiants réels n’existent pas.

## Documentation officielle

- [Apple — configurer la connexion web](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web)
- [Apple — relais d’e-mail privé](https://developer.apple.com/help/account/capabilities/configure-private-email-relay-service)
- [Better Auth — Apple](https://better-auth.com/docs/authentication/apple)
