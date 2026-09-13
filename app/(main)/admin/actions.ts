"use server";

import { revalidatePath } from "next/cache";
import { isOperator } from "@/lib/admin";
import { setReportStatus } from "@/lib/db/queries/reports";

/** Marquer un signalement traité ou écarté. Réservé à l'opérateur. */
export async function treatReport(id: string, status: "traite" | "ignore" | "ouvert"): Promise<void> {
  if (!(await isOperator())) return;
  await setReportStatus(id, status);
  revalidatePath("/admin");
}
