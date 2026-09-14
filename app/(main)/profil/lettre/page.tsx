import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthUser } from "@/lib/session";
import { resolveUser } from "@/lib/db/queries/alerts";
import { getRiderSeason } from "@/lib/db/queries/points";
import { assess, downgradeLetter, isLadderCategory } from "@/lib/category-rules";
import { CopyLetter } from "@/components/profil/CopyLetter";

export const metadata: Metadata = { title: "Lettre de demande de descente" };

/**
 * La lettre au comité, remplie avec la saison telle qu'on la connaît.
 *
 * Le coureur relit, corrige le nom du comité, signe. Rien n'est envoyé d'ici :
 * la demande passe par le club ou par le formulaire du comité, selon la région.
 */
export default async function LettrePage() {
  const user = await getAuthUser();
  const userId = user ? await resolveUser(user.id, user.email) : null;
  const season = userId ? await getRiderSeason(userId) : null;

  let body: string | null = null;
  if (season && isLadderCategory(season.category)) {
    const a = assess({ category: season.category, gender: season.gender, results: season.results, cpp: season.cpp, cppRank: season.cppRank });
    if (a.down) {
      body = downgradeLetter({ firstName: season.firstName, lastName: season.lastName, uciId: season.uciId, club: season.club, a, season: season.season });
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href="/profil" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Mon profil
      </Link>
      <h1 className="mb-2 text-2xl font-bold">Demande de descente de catégorie</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        À envoyer au comité régional entre le 1er novembre et le 31 décembre, souvent via un formulaire du comité ou par ton club. Relis, corrige, signe.
      </p>
      {body ? (
        <CopyLetter text={body} />
      ) : (
        <p className="rounded-xl border border-border bg-surface-1 p-4 text-sm text-muted-foreground">
          {userId
            ? "Rien à demander d'après ce qu'on sait : ton compte n'est pas relié à un coureur, ou ta saison justifie ta catégorie."
            : "Connecte-toi pour préparer la lettre avec ta saison."}
        </p>
      )}
    </div>
  );
}
