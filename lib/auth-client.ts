"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

/** Le client des comptes : session, connexion par lien, déconnexion. */
export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});

export const { useSession, signOut } = authClient;
