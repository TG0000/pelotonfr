import { getAuthUser } from "@/lib/session";
import { operatorAllowed } from "@/lib/security";

export async function isOperator(): Promise<boolean> {
  const user = await getAuthUser();
  return Boolean(user && operatorAllowed(user.id));
}
