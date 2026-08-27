import { auth } from "@clerk/nextjs/server";

/**
 * Who may arbitrate.
 *
 * The data pages are readable by anyone — a collector at a standstill is worth
 * saying out loud. Correcting the data is not: attaching a start list to the
 * wrong race writes a falsehood every reader then sees as fact.
 *
 * A list of Clerk user ids in the environment rather than a role table, because
 * there is exactly one operator and a table would be a schema pretending at a
 * team. When the list is empty nobody is an operator, which is the right
 * failure: a missing variable must not hand the controls to everyone.
 */
export async function isOperator(): Promise<boolean> {
  const allowed = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return false;

  const { userId } = await auth();
  return userId != null && allowed.includes(userId);
}
