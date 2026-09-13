import { getAuthUser } from "@/lib/session";

/**
 * Who may arbitrate.
 *
 * The data pages are readable by anyone — a collector at a standstill is worth
 * saying out loud. Correcting the data is not: attaching a start list to the
 * wrong race writes a falsehood every reader then sees as fact.
 *
 * A list of e-mails in the environment rather than a role table, because there
 * is exactly one operator and a table would be a schema pretending at a team.
 * E-mails rather than ids: the id changed when the accounts moved from Clerk
 * to Better Auth, the address did not. When the list is empty nobody is an
 * operator, which is the right failure: a missing variable must not hand the
 * controls to everyone.
 */
export async function isOperator(): Promise<boolean> {
  const emails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const ids = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (emails.length === 0 && ids.length === 0) return false;

  const user = await getAuthUser();
  if (!user) return false;
  return emails.includes(user.email.toLowerCase()) || ids.includes(user.id);
}
