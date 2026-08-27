import { NextRequest, NextResponse } from "next/server";
import { getRaceById } from "@/lib/db/queries/races";
import { getRaceTrace } from "@/lib/db/queries/race-detail";
import { detectLaps } from "@/lib/trace";
import { displayRaceName } from "@/lib/race-name";

/**
 * The course as a GPX file.
 *
 * Riders want the track on their head unit, and for a point-to-point race that
 * is the difference between knowing the route and following a car. Offered as a
 * download rather than a link to Strava because the trace may have come from
 * several places, and because a file works offline on the morning of the race.
 *
 * `?tour=1` gives a single lap, which is what a circuit race needs: fourteen
 * copies of the same loop is a larger file that says exactly the same thing.
 */

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!
  );
}

/** A filename a rider can find again among fifty others on a head unit. */
function fileNameFor(name: string, date: string, oneLap: boolean): string {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "parcours"}-${date}${oneLap ? "-1tour" : ""}.gpx`;
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
  const title = escapeXml(
    wantsOneLap && laps.lap ? `${name} — un tour` : name
  );

  const segments = points
    .map(
      ([lng, lat, ele]) =>
        `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}">` +
        `<ele>${Math.round(ele)}</ele></trkpt>`
    )
    .join("\n");

  const gpx =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="PelotonFR" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    `  <metadata>\n` +
    `    <name>${title}</name>\n` +
    `    <desc>${escapeXml(
      trace.source === "segment"
        ? "Circuit reconnu parmi les segments Strava du secteur."
        : "Tracé relevé par un coureur ayant disputé l'épreuve."
    )}</desc>\n` +
    `    <time>${new Date(`${race.raceDate}T12:00:00Z`).toISOString()}</time>\n` +
    `  </metadata>\n` +
    `  <trk>\n    <name>${title}</name>\n    <trkseg>\n${segments}\n    </trkseg>\n  </trk>\n` +
    `</gpx>\n`;

  return new NextResponse(gpx, {
    headers: {
      "Content-Type": "application/gpx+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileNameFor(
        name,
        race.raceDate,
        wantsOneLap
      )}"`,
      // The course does not change between two requests on the same day.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
