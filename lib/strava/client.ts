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
