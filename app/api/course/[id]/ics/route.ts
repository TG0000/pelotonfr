import { fileSlug } from "@/lib/slug";
import { NextResponse } from "next/server";
import { getRaceById } from "@/lib/db/queries/races";
import { displayRaceName } from "@/lib/race-name";
import { buildCalendar } from "@/lib/ics";
import { getSiteUrl } from "@/lib/site-url";

/**
 * La course, dans l'agenda du téléphone.
 *
 * Une journée entière, avec la commune en lieu et, dans la description, ce
 * que l'organisateur a annoncé : la remise des dossards et le premier départ.
 * C'est ce qu'on veut sous les yeux le matin, pas la fiche complète.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let race;
  try {
    race = await getRaceById(id);
  } catch {
    return NextResponse.json({ error: "Indisponible" }, { status: 500 });
  }
  if (!race) {
    return NextResponse.json({ error: "Course introuvable" }, { status: 404 });
  }

  const name = displayRaceName(race.name);
  const notes = [
    race.bibPickupTime || race.bibPickupPlace
      ? `Dossards : ${[race.bibPickupTime, race.bibPickupPlace].filter(Boolean).join(" — ")}`
      : null,
    race.startTime ? `Premier départ : ${race.startTime}` : null,
    race.organizer ? `Organisé par ${race.organizer}` : null,
  ].filter(Boolean);

  const ics = buildCalendar(
    [
      {
        uid: race.id,
        title: name,
        date: race.raceDate,
        endDate: race.raceDateEnd ?? null,
        location: [race.city, race.departmentCode ? `(${race.departmentCode})` : null]
          .filter(Boolean)
          .join(" "),
        description: notes.join("\n") || null,
        url: `${await getSiteUrl()}/course/${race.id}`,
      },
    ],
    name
  );

  const slug = fileSlug(name, "course");

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-${race.raceDate}.ics"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
