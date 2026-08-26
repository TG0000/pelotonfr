import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Routes the middleware itself blocks.
 *
 * Deliberately empty: `auth.protect()` answers an unauthenticated request with
 * 404 rather than a redirect, so that a protected path cannot be discovered by
 * probing. That is the right behaviour for something secret, and the wrong one
 * for a page whose whole job is to invite you to sign in — /profil and /alertes
 * both render a sign-in prompt when logged out, and a 404 hides that.
 *
 * Pages check the session themselves and show that prompt; API routes check it
 * and return 401. Add a matcher here only for a route that must not reveal it
 * exists.
 */
const isProtectedRoute = createRouteMatcher([]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
