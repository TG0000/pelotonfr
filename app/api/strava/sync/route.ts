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

/** Rides older than this are not worth re-reading on every sync. */
const SYNC_WINDOW_DAYS = 400;

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

    return NextResponse.json({ synced: saved, linked });
  } catch (err) {
    console.error("Strava sync:", err);
    const message = err instanceof Error ? err.message : "Erreur de synchronisation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
