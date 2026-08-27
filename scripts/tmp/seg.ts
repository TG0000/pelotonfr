import { loadEnv } from "../lib/load-env";
loadEnv();
import { neon } from "@neondatabase/serverless";
import { getAccessToken } from "../../lib/db/queries/strava";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const [u] = (await sql`SELECT user_id FROM strava_connections LIMIT 1`) as { user_id: string }[];
  const token = await getAccessToken(u.user_id);
  if (!token) return console.log("no token");

  // A tight box around Domfront en Poiraie.
  const lat = 48.5936, lng = -0.6472, d = 0.045;
  const bounds = `${lat - d},${lng - d},${lat + d},${lng + d}`;

  for (const cat of ["", "4,5", "1,5"]) {
    const url = `https://www.strava.com/api/v3/segments/explore?bounds=${bounds}` +
      `&activity_type=riding${cat ? `&min_cat=${cat.split(",")[0]}&max_cat=${cat.split(",")[1]}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json() as { segments?: Array<Record<string, unknown>> };
    console.log(`\ncat=${cat || "any"}  http ${res.status}  ${body.segments?.length ?? 0} segments`);
    for (const s of (body.segments ?? []).slice(0, 6))
      console.log(`   ${String(s.name).slice(0,34).padEnd(36)} ${s.distance} m  ${s.avg_grade}%  cat ${s.climb_category}  elev ${s.elev_difference}`);
  }
}
main();
