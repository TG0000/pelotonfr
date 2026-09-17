# Connexion et validations complémentaires — 17 septembre 2026

## Interface

- Google passe avant le formulaire e-mail. Il était déjà actif sur le domaine de production ; la preview isolée n’utilisait pas les identifiants Google de production.
- Strava occupe un encart distinct, marqué facultatif. Le texte sépare la connexion, l’import choisi par l’utilisateur et sa période. Les droits de lecture, l’absence de publication sur Strava et la déconnexion sont expliqués dans un volet dépliable.
- Le fond orange du bouton est assombri pour rendre le petit texte blanc suffisamment contrasté. La fenêtre de connexion peut défiler sur les petits écrans.
- Google et Apple partagent des états d’attente et d’erreur visibles. L’e-mail reste disponible si un fournisseur échoue.
- La page `/connexion` est explicitement non indexable.

## Apple

Le code serveur, la signature ES256 et le bouton sont préparés. Le compte Apple Developer est gratuit : **aucune activation possible actuellement, aucun achat effectué**. Le bouton reste masqué sans les quatre variables requises. Voir [la procédure Apple](CONNEXION_APPLE.md) pour l’abonnement, les identifiants, le retour HTTPS et le relais d’e-mail.

## Vérifications réalisées

- TypeScript, ESLint, build et tests ; test Apple avec clé synthétique, vérification cryptographique des claims et de l’expiration, configuration incomplète désactivée, clé invalide refusée.
- Recette visuelle locale avec identifiants OAuth factices, exclusivement pour afficher les boutons. Aucune requête OAuth avec ces identifiants : les erreurs réseau sont simulées.
- Page à 320 px, volet Strava ouvert, pas de débordement horizontal ; audit axe après correction du contraste. Google en erreur réseau affiche une alternative e-mail.
- Vérification Brevo en lecture seule : l’expéditeur configuré existe et est actif. Ce résultat ne prouve pas la réception d’un e-mail.
- Alertes en mode `--dry-run`, avec clés de transport retirées : une règle active correspond à cinq nouvelles courses ; aucune clôture et aucun rappel de club dans les fenêtres courantes. Aucun e-mail envoyé ni marqué comme livré.
- Maintenance : aucune vue de plus de 90 jours, aucun compteur expiré de plus de 7 jours, aucun ticket traité de plus de 90 jours à supprimer au moment de l’inspection. Aucune purge exécutée.

## Correction opérationnelle

Les étapes d’envoi du workflow nocturne ne transmettaient pas `ALERT_FROM_EMAIL` ni `BREVO_FROM_EMAIL` au transport. Elles transmettent désormais ces deux paramètres, et le secret d’expéditeur Brevo a été configuré dans GitHub depuis la configuration de production existante, sans afficher sa valeur. Un test vérifie que les deux étapes d’envoi disposent de ces paramètres.

L’ancien run `35004310331` n’a aucun journal de job disponible. Son workflow à `c2cd3fe` contient une clé YAML dupliquée ; le fichier de `main` est maintenant valide et les workflows sont actifs. Cela explique un défaut vérifiable de l’ancien fichier, sans établir la cause exclusive de toutes les exécutions manquées.

## Restant à valider

- Réception et consommation d’un vrai lien e-mail : adresse de recette demandée au propriétaire.
- Connexions Google/Strava complètes avec les comptes du titulaire ; les redirections ont été vérifiées, pas la validation de ses identifiants externes.
- Premier cycle nocturne complet. Plusieurs collecteurs sont en retard, bien que leur dernière exécution enregistrée soit réussie ; le workflow complet n’est pas présenté comme validé. Aucun envoi réel à des utilisateurs ni enrichissement payant n’a été déclenché pour cette recette.
- Activation Apple après abonnement et configuration, puis recette réelle incluant le relais privé.
- Revue juridique/contractuelle externe des données et sources, toujours ouverte.
