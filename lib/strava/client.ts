/**
 * Strava API client.
 *
 * Tokens expire every six hours, so every call goes through `withAccessToken`,
 * which refreshes and persists a new pair when needed. Refreshing lazily rather
 * than on a schedule means a rider who has not opened the site for a month is
 * still served on their next visit.
 */

const STRAVA_API = "https://www.strava.com/api/v3";
const STRAVA_OAUTH = "https://www.strava.com/oauth/token";

/** Read-only: this product never writes to a rider's Strava account. */
export const STRAVA_SCOPES = "read,activity:read_all,profile:read_all";

export function stravaConfigured(): boolean {
  return Boolean(
    process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET
  );
}

export interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  athleteId: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number; firstname?: string; lastname?: string; city?: string };
}

async function requestToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(STRAVA_OAUTH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      ...body,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    throw new Error(`Strava token request failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

/** Exchanges the one-time code from the OAuth redirect for a token pair. */
export async function exchangeCode(code: string): Promise<
  StravaTokens & { athleteName: string | null; homeCity: string | null }
> {
  const data = await requestToken({ code, grant_type: "authorization_code" });
  const name = [data.athlete?.firstname, data.athlete?.lastname]
    .filter(Boolean)
    .join(" ");

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(data.expires_at * 1000),
    athleteId: data.athlete?.id ?? 0,
    athleteName: name || null,
    homeCity: data.athlete?.city ?? null,
  };
}

export async function refreshTokens(refreshToken: string): Promise<StravaTokens> {
  const data = await requestToken({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(data.expires_at * 1000),
    athleteId: data.athlete?.id ?? 0,
  };
}

export interface StravaActivity {
  id: number;
  name: string;
  description?: string | null;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  distance: number;
  moving_time: number;
  total_elevation_gain: number;
  average_watts?: number;
  weighted_average_watts?: number;
  max_watts?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  suffer_score?: number;
  calories?: number;
  start_latlng?: [number, number] | null;
}

/**
 * Lists activities after a given instant.
 *
 * Strava paginates at 200; the caller decides how far back to go, since a first
 * connection wants a season and a nightly sync wants a week.
 */
export async function listActivities(
  accessToken: string,
  after: Date,
  perPage = 100
): Promise<StravaActivity[]> {
  const activities: StravaActivity[] = [];
  const afterEpoch = Math.floor(after.getTime() / 1000);

  for (let page = 1; page <= 20; page++) {
    const url = `${STRAVA_API}/athlete/activities?after=${afterEpoch}&per_page=${perPage}&page=${page}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(25_000),
    });

    if (res.status === 429) {
      // Strava's window is 15 minutes; stopping cleanly beats hammering it.
      throw new Error("Strava rate limit reached");
    }
    if (!res.ok) {
      throw new Error(`Strava activities failed (${res.status})`);
    }

    const batch = (await res.json()) as StravaActivity[];
    activities.push(...batch);
    if (batch.length < perPage) break;
  }

  return activities;
}

export interface AthleteZones {
  ftp: number | null;
  weightKg: number | null;
}

export async function getAthleteSummary(
  accessToken: string
): Promise<AthleteZones> {
  const res = await fetch(`${STRAVA_API}/athlete`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return { ftp: null, weightKg: null };

  const data = (await res.json()) as { ftp?: number; weight?: number };
  return {
    ftp: data.ftp ?? null,
    weightKg: data.weight ?? null,
  };
}

export interface ActivityStreams {
  latlng: Array<[number, number]>;
  altitude: number[];
  distance: number[];
}

/**
 * The shape of a ride: where it went and how high it was.
 *
 * This is what turns a race from a name and a date into a course. Organisers
 * publish a trace roughly never, so the only reliable source is a rider who
 * rode it — and one rider's ride documents the circuit for everyone.
 */
export async function getActivityStreams(
  token: string,
  activityId: number
): Promise<ActivityStreams | null> {
  const res = await fetch(
    `${STRAVA_API}/activities/${activityId}/streams` +
      `?keys=latlng,altitude,distance&key_by_type=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;

  const data = (await res.json()) as Record<
    string,
    { data?: unknown[] } | undefined
  >;

  const latlng = (data.latlng?.data ?? []) as Array<[number, number]>;
  const altitude = (data.altitude?.data ?? []) as number[];
  const distance = (data.distance?.data ?? []) as number[];

  if (latlng.length < 2) return null;
  return { latlng, altitude, distance };
}

/** Thrown rather than swallowed: see exploreSegments. */
export class StravaRateLimitError extends Error {
  readonly name = "StravaRateLimitError";
}

export interface StravaSegment {
  id: number;
  name: string;
  distanceM: number;
  averageGrade: number;
  elevationM: number | null;
  climbCategory: number | null;
  startLat: number | null;
  startLng: number | null;
  /** The full shape, encoded — the explorer already carries it. */
  points: string | null;
  endLat: number | null;
  endLng: number | null;
}

/**
 * The notable climbs inside a geographic box.
 *
 * Strava answers with at most ten segments per call, ranked by its own notion
 * of interest, so a sector is asked twice: once without a category filter for
 * whatever is locally ridden, and once restricted to categorised climbs, which
 * surfaces the ones that actually decide a race.
 */
export async function exploreSegments(
  token: string,
  bounds: { south: number; west: number; north: number; east: number },
  options: { minCategory?: number; maxCategory?: number } = {}
): Promise<StravaSegment[]> {
  const params = new URLSearchParams({
    bounds: `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`,
    activity_type: "riding",
  });
  if (options.minCategory !== undefined) {
    params.set("min_cat", String(options.minCategory));
    params.set("max_cat", String(options.maxCategory ?? 5));
  }

  const res = await fetch(`${STRAVA_API}/segments/explore?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  /* A refusal is not an empty sector.
     Returning [] on any failure made a rate limit indistinguishable from
     "there is nothing here", so a caller marked races as read that had never
     been looked at. Strava allows 100 reads per fifteen minutes and 1 000 per
     day, and says so in these headers. */
  if (res.status === 429) {
    const usage = res.headers.get("x-readratelimit-usage") ?? "?";
    const limit = res.headers.get("x-readratelimit-limit") ?? "?";
    throw new StravaRateLimitError(
      `Strava read limit reached (${usage} of ${limit}).`
    );
  }
  if (!res.ok) return [];

  const body = (await res.json()) as {
    segments?: Array<Record<string, unknown>>;
  };

  return (body.segments ?? []).map((s) => {
    const start = (s.start_latlng as [number, number] | undefined) ?? undefined;
    const end = (s.end_latlng as [number, number] | undefined) ?? undefined;
    return {
      id: Number(s.id),
      name: String(s.name ?? "").slice(0, 160),
      distanceM: Number(s.distance ?? 0),
      averageGrade: Number(s.avg_grade ?? 0),
      elevationM: s.elev_difference === undefined ? null : Number(s.elev_difference),
      climbCategory: s.climb_category === undefined ? null : Number(s.climb_category),
      startLat: start?.[0] ?? null,
      startLng: start?.[1] ?? null,
      // The explorer already carries the shape, so recognising a circuit costs
      // no extra request at all.
      points: (s.points as string | undefined) ?? null,
      endLat: end?.[0] ?? null,
      endLng: end?.[1] ?? null,
    };
  });
}

export function authorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: STRAVA_SCOPES,
    state,
  });
  return `https://www.strava.com/oauth/authorize?${params}`;
}
