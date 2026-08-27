import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { resolveUser } from "@/lib/db/queries/alerts";
import {
  getAccessToken,
  saveActivities,
  saveFitness,
} from "@/lib/db/queries/strava";
import { listActivities, getAthleteSummary } from "@/lib/strava/client";
import { matchRideToRace } from "@/lib/strava/match-races";
import { saveRideTrace } from "@/lib/strava/ingest-trace";

/** Rides older than this are not worth re-reading on every sync. */
const SYNC_WINDOW_DAYS = 400;

/**
 * How many courses one synchronisation may bring back.
 *
 * A trace costs one Strava read, against a ceiling of a thousand a day shared
 * with everything else we ask of them. A first sync can link forty rides at
 * once, and reading all of them would spend the day's budget on one rider — so
 * a pass takes the most recent handful and the next pass takes the next.
 */
const TRACES_PER_SYNC = 12;

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = await resolveUser(userId);
  const token = await getAccessToken(id);
  if (!token) {
    return NextResponse.json({ error: "Strava non connecté" }, { status: 400 });
  }

  try {
    const after = new Date(Date.now() - SYNC_WINDOW_DAYS * 86400000);
    const activities = await listActivities(token, after);

    // Only rides can be races; runs and gym sessions are noise here.
    const rides = activities.filter((a) =>
      ["Ride", "VirtualRide", "GravelRide", "MountainBikeRide"].includes(a.sport_type)
    );

    const saved = await saveActivities(id, rides);

    const summary = await getAthleteSummary(token);
    await saveFitness(id, summary.ftp, summary.weightKg);

    // The rider's own categories disambiguate a meeting that ran several.
    const [profile] = await sql(
      `SELECT r.category FROM users u LEFT JOIN riders r ON r.id = u.rider_id
        WHERE u.id = $1::uuid`,
      [id]
    );
    const categories = profile?.category ? [String(profile.category)] : [];

    const pending = await sql(
      `SELECT id, name, local_date,
              ST_Y(start_location::geometry) AS lat,
              ST_X(start_location::geometry) AS lng
         FROM strava_activities
        WHERE user_id = $1::uuid AND race_id IS NULL AND race_match_method = 'none'`,
      [id]
    );

    let linked = 0;
    for (const row of pending) {
      const r = row as Record<string, unknown>;
      const match = await matchRideToRace(sql, {
        name: (r.name as string) ?? "",
        localDate: String(r.local_date).slice(0, 10),
        lat: r.lat != null ? Number(r.lat) : null,
        lng: r.lng != null ? Number(r.lng) : null,
        categories,
      });
      if (!match) continue;

      await sql(
        `UPDATE strava_activities
            SET race_id = $2::uuid, race_match_method = $3::varchar
          WHERE id = $1::uuid`,
        [r.id, match.raceId, match.method]
      );
      linked++;
    }

    // The link says which race the ride was; the ride says what the course is.
    // Newest first, because a rider syncs after racing and the parcours they
    // just rode is the one somebody is about to look up. Races already carrying
    // a rider's trace are left alone.
    const untraced = await sql(
      `SELECT a.activity_id, a.race_id
         FROM strava_activities a
    LEFT JOIN race_traces t ON t.race_id = a.race_id
        WHERE a.user_id = $1::uuid
          AND a.race_id IS NOT NULL
          AND (t.race_id IS NULL OR t.source = 'segment')
        ORDER BY a.local_date DESC
        LIMIT $2::int`,
      [id, TRACES_PER_SYNC]
    );

    let traced = 0;
    for (const row of untraced) {
      const r = row as Record<string, unknown>;
      try {
        const outcome = await saveRideTrace(
          sql,
          token,
          Number(r.activity_id),
          r.race_id as string
        );
        if (outcome === "stored") traced++;
      } catch {
        // One unreadable activity must not cost the rider their whole sync.
        break;
      }
    }

    return NextResponse.json({ synced: saved, linked, traced });
  } catch (err) {
    console.error("Strava sync:", err);
    const message = err instanceof Error ? err.message : "Erreur de synchronisation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
