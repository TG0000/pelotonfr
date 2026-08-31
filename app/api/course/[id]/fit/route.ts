import { NextRequest, NextResponse } from "next/server";
import { getRaceById } from "@/lib/db/queries/races";
import { getRaceTrace } from "@/lib/db/queries/race-detail";
import { detectLaps } from "@/lib/trace";
import { displayRaceName } from "@/lib/race-name";
import { encodeCourse, type TracePoint } from "@/lib/fit-course";

/**
 * Le parcours au format FIT, pour le compteur.
 *
 * Le GPX à côté est une trace ; celui-ci est un parcours. C'est le format
 * natif des Garmin Edge et des Wahoo ELEMNT : ils y lisent la distance
 * restante, le profil qui défile et l'annonce de l'arrivée, ce qu'un GPX ne
 * porte pas. C'est aussi le seul format que l'API Wahoo accepte pour créer une
 * route à distance.
 *
 * `?tour=1` donne un seul tour, ce qu'il faut pour un circuit : quatorze copies
 * de la même boucle disent la même chose dans un fichier quatorze fois plus
 * gros, et le compteur annonce alors quatorze fois l'arrivée.
 */

/** Un nom de fichier qu'un coureur retrouve parmi cinquante sur son compteur. */
function fileNameFor(name: string, date: string, oneLap: boolean): string {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "parcours"}-${date}${oneLap ? "-1tour" : ""}.fit`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let race;
  let trace;
  try {
    [race, trace] = await Promise.all([getRaceById(id), getRaceTrace(id)]);
  } catch {
    return NextResponse.json({ error: "Indisponible" }, { status: 500 });
  }

  if (!race) {
    return NextResponse.json({ error: "Course introuvable" }, { status: 404 });
  }
  if (!trace) {
    return NextResponse.json(
      { error: "Aucun tracé connu pour cette course" },
      { status: 404 }
    );
  }

  const wantsOneLap = request.nextUrl.searchParams.get("tour") === "1";
  const laps = detectLaps(trace.points);
  const points =
    wantsOneLap && laps.lap && laps.lapCount > 1 ? laps.lap : trace.points;

  const name = displayRaceName(race.name);
  const course = encodeCourse(
    points as readonly TracePoint[],
    wantsOneLap && laps.lap ? `${name} — un tour` : name,
    new Date(`${race.raceDate}T08:00:00Z`)
  );

  return new NextResponse(Buffer.from(course.bytes) as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.ant.fit",
      "Content-Disposition": `attachment; filename="${fileNameFor(
        name,
        race.raceDate,
        wantsOneLap
      )}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
