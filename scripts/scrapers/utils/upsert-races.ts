import { createHash } from "crypto";
import { neon } from "@neondatabase/serverless";
import type { ScrapedRace, UpsertStats } from "../../../lib/scraper-types";
import { toISODate } from "./parse-date";

function computeHash(race: ScrapedRace, federationId: number): string {
  const content = [
    federationId,
    race.externalId,
    toISODate(race.raceDate),
    race.name,
    race.city,
    race.isCancelled ? "1" : "0",
    race.discipline,
    race.categories.sort().join(","),
  ].join("|");
  return createHash("sha256").update(content).digest("hex");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeSql(dbUrl: string) {
  const _neon = neon(dbUrl);
  return (query: string, params?: unknown[]) =>
    _neon.query(query, params ?? []) as Promise<Record<string, unknown>[]>;
}

export async function upsertRaces(
  races: ScrapedRace[],
  federationId: number,
  dbUrl: string
): Promise<UpsertStats> {
  if (races.length === 0) return { inserted: 0, updated: 0, skipped: 0 };

  const sql = makeSql(dbUrl);
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const race of races) {
    const hash = computeHash(race, federationId);
    const slug = slugify(race.name);

    try {
      const result = await sql(
        `INSERT INTO races (
          external_id, federation_id, name, slug, source_url,
          race_date, race_date_end,
          city, department_code, department_name, postcode,
          discipline, race_type, level, categories, gender, distance_km,
          is_cancelled, organizer, contact_email, contact_phone, notes,
          content_hash, geocoding_status
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7,
          $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17,
          $18, $19, $20, $21, $22,
          $23, 'pending'
        )
        ON CONFLICT (federation_id, external_id) DO UPDATE SET
          name           = EXCLUDED.name,
          slug           = EXCLUDED.slug,
          source_url     = EXCLUDED.source_url,
          race_date      = EXCLUDED.race_date,
          race_date_end  = EXCLUDED.race_date_end,
          city           = EXCLUDED.city,
          department_code = EXCLUDED.department_code,
          department_name = EXCLUDED.department_name,
          postcode       = EXCLUDED.postcode,
          discipline     = EXCLUDED.discipline,
          race_type      = EXCLUDED.race_type,
          level          = EXCLUDED.level,
          categories     = EXCLUDED.categories,
          gender         = EXCLUDED.gender,
          distance_km    = EXCLUDED.distance_km,
          is_cancelled   = EXCLUDED.is_cancelled,
          organizer      = EXCLUDED.organizer,
          contact_email  = EXCLUDED.contact_email,
          contact_phone  = EXCLUDED.contact_phone,
          notes          = EXCLUDED.notes,
          content_hash   = EXCLUDED.content_hash,
          scraped_at     = now(),
          geocoding_status = CASE
            WHEN races.city != EXCLUDED.city THEN 'pending'
            ELSE races.geocoding_status
          END
        WHERE races.content_hash IS DISTINCT FROM EXCLUDED.content_hash
        RETURNING xmax`,
        [
          race.externalId,
          federationId,
          race.name,
          slug,
          race.sourceUrl ?? null,
          toISODate(race.raceDate),
          race.raceDateEnd ? toISODate(race.raceDateEnd) : null,
          race.city,
          race.departmentCode ?? null,
          race.departmentName ?? null,
          race.postcode ?? null,
          race.discipline,
          race.raceType ?? null,
          race.level ?? null,
          race.categories,
          race.gender ?? "mixed",
          race.distanceKm ?? null,
          race.isCancelled,
          race.organizer ?? null,
          race.contactEmail ?? null,
          race.contactPhone ?? null,
          race.notes ?? null,
          hash,
        ]
      );

      if (result.length === 0) {
        skipped++;
      } else {
        const xmax = Number((result[0] as { xmax: string }).xmax);
        if (xmax === 0) {
          inserted++;
        } else {
          updated++;
        }
      }
    } catch (err) {
      console.error(
        `Failed to upsert race ${race.externalId} (${race.name}):`,
        err
      );
    }
  }

  return { inserted, updated, skipped };
}

// Department centroid coordinates [lng, lat] keyed by normalized department name
const DEPT_CENTROIDS: Record<string, [number, number]> = {
  "ain": [5.3489, 46.0697], "aisne": [3.3820, 49.5666], "allier": [3.3330, 46.3674],
  "alpes de haute provence": [-6.2341, 44.0922], "hautes alpes": [6.2602, 44.6630],
  "alpes maritimes": [7.1874, 43.9352], "ardeche": [4.2764, 44.7467],
  "ardennes": [4.7160, 49.6967], "ariege": [1.6060, 42.9319], "aube": [4.0756, 48.2974],
  "aude": [2.3503, 43.0697], "aveyron": [2.7379, 44.2799],
  "bouches du rhone": [5.3797, 43.5283], "calvados": [-0.3583, 49.0935],
  "cantal": [2.6697, 45.0434], "charente": [0.1609, 45.6660],
  "charente maritime": [-0.8826, 45.7597], "cher": [2.4978, 47.0834],
  "correze": [1.8751, 45.3439], "corse du sud": [9.0172, 41.8617],
  "haute corse": [9.2130, 42.3028], "cote d or": [4.7716, 47.4169],
  "cotes d armor": [-2.8779, 48.4638], "creuse": [2.0272, 46.0828],
  "dordogne": [0.7278, 45.1455], "doubs": [6.3591, 47.2322], "drome": [5.0537, 44.7289],
  "eure": [1.1718, 49.0703], "eure et loir": [1.3634, 48.4440],
  "finistere": [-4.0862, 48.2320], "gard": [4.3612, 43.9661],
  "haute garonne": [1.4422, 43.5047], "gers": [0.5879, 43.6448],
  "gironde": [-0.5792, 44.8378], "herault": [3.5774, 43.6119],
  "ille et vilaine": [-1.6801, 48.1173], "indre": [1.5601, 46.8127],
  "indre et loire": [0.6853, 47.3941], "isere": [5.7193, 45.1885],
  "jura": [5.6987, 46.6735], "landes": [-0.9949, 43.9435],
  "loir et cher": [1.3370, 47.5896], "loire": [4.3885, 45.4389],
  "haute loire": [3.8853, 45.0429], "loire atlantique": [-1.5534, 47.2184],
  "loiret": [2.3525, 47.9029], "lot": [1.6670, 44.6254],
  "lot et garonne": [0.6220, 44.3508], "lozere": [3.5010, 44.5024],
  "maine et loire": [-0.5512, 47.4667], "manche": [-1.3197, 49.1158],
  "marne": [4.2249, 48.9638], "haute marne": [5.1394, 48.1115],
  "mayenne": [-0.6048, 48.1416], "meurthe et moselle": [6.1803, 48.6937],
  "meuse": [5.3742, 48.9955], "morbihan": [-2.8102, 47.8009],
  "moselle": [6.4764, 49.1199], "nievre": [3.5047, 47.1048],
  "nord": [3.1553, 50.5234], "oise": [2.4303, 49.4155],
  "orne": [0.0849, 48.5809], "pas de calais": [2.2800, 50.5100],
  "puy de dome": [3.0825, 45.7597], "pyrenees atlantiques": [-0.6257, 43.2924],
  "hautes pyrenees": [0.0861, 43.1000], "pyrenees orientales": [2.5862, 42.5990],
  "bas rhin": [7.5539, 48.5692], "haut rhin": [7.3397, 47.9278],
  "rhone": [4.8357, 45.7640], "haute saone": [6.0876, 47.6237],
  "saone et loire": [4.5868, 46.6551], "sarthe": [0.1966, 48.0077],
  "savoie": [6.4243, 45.5696], "haute savoie": [6.4489, 46.1202],
  "paris": [2.3488, 48.8534], "seine maritime": [0.9920, 49.5388],
  "seine et marne": [2.9395, 48.6195], "yvelines": [1.9059, 48.7850],
  "deux sevres": [-0.3130, 46.6413], "somme": [2.2904, 49.9304],
  "tarn": [2.1487, 43.7792], "tarn et garonne": [1.2146, 44.0165],
  "var": [6.2180, 43.4653], "vaucluse": [5.1477, 43.9937],
  "vendee": [-1.4104, 46.6706], "vienne": [0.3401, 46.5802],
  "haute vienne": [1.2598, 45.8354], "vosges": [6.3990, 48.1894],
  "yonne": [3.5697, 47.7993], "territoire de belfort": [6.8560, 47.6382],
  "essonne": [2.2926, 48.5209], "hauts de seine": [2.2070, 48.8470],
  "seine saint denis": [2.4897, 48.9119], "val de marne": [2.4562, 48.7744],
  "val d oise": [2.1847, 49.0768],
};

function getDeptCentroid(name: string): [number, number] | null {
  const key = name.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  return DEPT_CENTROIDS[key] ?? null;
}

/**
 * Run geocoding pass: update all races with geocoding_status='pending'.
 */
export async function geocodePendingRaces(dbUrl: string): Promise<number> {
  const sql = makeSql(dbUrl);
  const pending = await sql(
    `SELECT id, city, department_name, postcode FROM races WHERE geocoding_status IN ('pending','failed') LIMIT 500`
  );

  let geocoded = 0;

  for (const row of pending) {
    const { id, city, department_name, postcode } = row as {
      id: string;
      city: string;
      department_name: string | null;
      postcode: string | null;
    };

    try {
      // Try department centroid first if city looks like a department name
      const centroid = getDeptCentroid(city) ?? (department_name ? getDeptCentroid(department_name) : null);

      const q = encodeURIComponent(city);
      const postcodeParam = postcode
        ? `&postcode=${encodeURIComponent(postcode)}`
        : "";
      const url = `https://api-adresse.data.gouv.fr/search/?q=${q}${postcodeParam}&type=municipality&limit=1`;

      const res = await fetch(url, {
        headers: { "User-Agent": "PelotonFR/1.0 (+https://pelotonfr.fr)" },
        signal: AbortSignal.timeout(5000),
      });

      let located = false;
      if (res.ok) {
        const data = (await res.json()) as {
          features?: Array<{
            geometry: { coordinates: [number, number] };
            properties: { score: number };
          }>;
        };
        const feature = data.features?.[0];
        if (feature && feature.properties.score >= 0.4) {
          const [lng, lat] = feature.geometry.coordinates;
          await sql(
            `UPDATE races SET location = ST_MakePoint($1, $2)::geography, geocoding_status='success' WHERE id=$3`,
            [lng, lat, id]
          );
          geocoded++;
          located = true;
        }
      }

      if (!located && centroid) {
        // Use department centroid as fallback
        const [lng, lat] = centroid;
        await sql(
          `UPDATE races SET location = ST_MakePoint($1, $2)::geography, geocoding_status='success' WHERE id=$3`,
          [lng, lat, id]
        );
        geocoded++;
        located = true;
      }

      if (!located) {
        await sql(`UPDATE races SET geocoding_status='failed' WHERE id=$1`, [id]);
      }
    } catch {
      await sql(
        `UPDATE races SET geocoding_status='failed' WHERE id=$1`,
        [id]
      );
    }

    // Polite delay
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 100));
  }

  return geocoded;
}
