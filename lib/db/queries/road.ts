import { sql } from "../index";
import { toDateOnly } from "@/lib/date";
import { summarise, type RoadReading, type RoadSeen } from "@/lib/road-vision";

export interface RoadView {
  pictureId: string;
  alongM: number | null;
  takenOn: string | null;
  url: string;
  producer: string | null;
  bearing: number | null;
  orientation: string | null;
  reading: RoadReading | null;
}

/** Les photos lues sur le tracé d'une course, et ce qu'elles disent ensemble. */
export async function getRoadViews(raceId: string): Promise<{ views: RoadView[]; seen: RoadSeen | null }> {
  const rows = await sql(
    `SELECT picture_id, along_m, taken_on, url, producer, reading, bearing, orientation
       FROM road_views WHERE race_id = $1::uuid AND ok ORDER BY along_m`,
    [raceId]
  );
  const views = rows.map((r) => ({
    pictureId: r.picture_id as string,
    alongM: r.along_m != null ? Number(r.along_m) : null,
    takenOn: r.taken_on ? toDateOnly(r.taken_on as string | Date) : null,
    url: r.url as string,
    producer: (r.producer as string) ?? null,
    bearing: r.bearing != null ? Number(r.bearing) : null,
    orientation: (r.orientation as string) ?? null,
    reading: (r.reading as RoadReading) ?? null,
  }));
  const seen = summarise(views.map((v) => v.reading).filter((r): r is RoadReading => r !== null));
  return { views, seen };
}
