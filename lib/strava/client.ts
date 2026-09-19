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
  athlete?: {
    id: number;
    firstname?: string;
    lastname?: string;
    city?: string;
    /** L'avatar, en 124 px. */
    profile_medium?: string;
  };
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
    throw new Error(`STRAVA_TOKEN_${res.status}`);
  }
  return (await res.json()) as TokenResponse;
}

/** Exchanges the one-time code from the OAuth redirect for a token pair. */
export async function exchangeCode(code: string): Promise<
  StravaTokens & {
    athleteName: string | null;
    homeCity: string | null;
    avatarUrl: string | null;
  }
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
    avatarUrl: data.athlete?.profile_medium ?? null,
  };
}

/**
 * L'adresse e-mail qu'un compte créé depuis Strava porte en attendant la vraie.
 *
 * Strava ne communique jamais l'adresse d'un athlète, et un compte sans
 * adresse n'existe pas pour Better Auth. Celle-ci est reconnaissable, ne
 * reçoit rien, et se remplace depuis le profil — les alertes attendront
 * qu'un coureur en donne une vraie.
 */
export const PLACEHOLDER_EMAIL_DOMAIN = "athlete.strava.pelotonfr.app";

export function placeholderEmail(athleteId: number | string): string {
  return `strava-${athleteId}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`));
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

/**
 * Strava refuse — pas « il n'y a rien ici ».
 *
 * L'explorateur de segments répondait 401 pendant deux nuits, et chaque refus était
 * lu comme un secteur vide : neuf cents lectures dépensées, trois cents
 * courses marquées lues sans avoir été regardées. Un refus arrête la passe.
 */
export class StravaAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StravaAuthError";
  }
}

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

/** Un segment tel qu'une sortie l'a rencontré. */
export interface EffortSegment {
  id: number;
  name: string;
  distanceM: number;
  averageGrade: number;
  elevationM: number;
  climbCategory: number;
  startLat: number;
  startLng: number;
}

/**
 * Les segments qu'une sortie a traversés.
 *
 * `segments/explore` s'est fermé ; les sorties de nos coureurs, elles, disent
 * exactement quelles bosses le parcours emprunte — puisqu'ils l'ont couru.
 * Une lecture par sortie, pour tous les segments de la course.
 */
export async function getActivityEffortSegments(
  token: string,
  activityId: number
): Promise<EffortSegment[]> {
  const res = await fetch(`${STRAVA_API}/activities/${activityId}?include_all_efforts=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 429) throw new StravaRateLimitError("Strava read limit reached.");
  if (res.status === 401 || res.status === 403) throw new StravaAuthError(`Strava refuse activities/${activityId} (${res.status}).`);
  if (!res.ok) return [];
  const body = (await res.json()) as { segment_efforts?: Array<{ segment?: Record<string, unknown> }> };
  const seen = new Map<number, EffortSegment>();
  for (const e of body.segment_efforts ?? []) {
    const sg = e.segment;
    if (!sg || typeof sg.id !== "number") continue;
    const start = (sg.start_latlng as number[] | undefined) ?? [];
    const high = Number(sg.elevation_high ?? 0);
    const low = Number(sg.elevation_low ?? 0);
    seen.set(sg.id, {
      id: sg.id,
      name: String(sg.name ?? ""),
      distanceM: Number(sg.distance ?? 0),
      averageGrade: Number(sg.average_grade ?? 0),
      elevationM: Math.max(0, high - low),
      climbCategory: Number(sg.climb_category ?? 0),
      startLat: Number(start[0] ?? 0),
      startLng: Number(start[1] ?? 0),
    });
  }
  return [...seen.values()];
}

export interface StravaRoute {
  id: number;
  name: string;
  distance: number;
  elevation_gain: number;
  /** Tracé résumé, encodé en polyline. */
  map?: { summary_polyline?: string | null; polyline?: string | null };
}

/**
 * Les itinéraires qu'un coureur a dessinés dans Strava.
 *
 * Avant une course, on trace souvent la boucle pour la charger sur le
 * compteur : « Circuit Buais », « Gastines 2026 ». C'est un tracé sans
 * sortie, nommé comme la course, et il reste ouvert quand l'explorateur de
 * segments ne l'est plus.
 */
export async function listRoutes(accessToken: string, athleteId: number): Promise<StravaRoute[]> {
  const routes: StravaRoute[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(`${STRAVA_API}/athletes/${athleteId}/routes?per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return routes;
    const batch = (await res.json()) as StravaRoute[];
    routes.push(...batch);
    if (batch.length < 100) break;
  }
  return routes;
}

/** One bounded page, with an upper time boundary stable across the job. */
export async function listActivitiesPage(token: string, after: Date, before: Date, page: number, perPage = 50): Promise<StravaActivity[]> {
  const query = new URLSearchParams({ after: String(Math.floor(after.getTime()/1000)), before: String(Math.floor(before.getTime()/1000)), page: String(page), per_page: String(perPage) });
  const response = await fetch(`${STRAVA_API}/athlete/activities?${query}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`STRAVA_ACTIVITIES_${response.status}`);
  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || rows.length > perPage) throw new Error("STRAVA_INVALID_PAGE");
  return rows as StravaActivity[];
}
export async function revokeToken(token: string): Promise<boolean> {
  const response = await fetch("https://www.strava.com/oauth/deauthorize", { method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  return response.ok;
}
