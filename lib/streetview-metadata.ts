import { CANONICAL_SITE_URL } from "@/lib/site-url";

export async function hasPano(key: string, lat: number, lng: number): Promise<boolean | null> {
  const url = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat.toFixed(6)},${lng.toFixed(6)}&radius=40&source=outdoor&key=${key}`;
  try {
    /* La clé est restreinte aux sites autorisés, parce qu'elle voyage dans le
       code de la page et que n'importe qui pourrait la recopier. Cet appel-ci
       part d'un script, sans navigateur pour poser le référent : il l'annonce
       lui-même, sinon Google le refuse. */
    const res = await fetch(url, {
      headers: { Referer: `${CANONICAL_SITE_URL}/` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { status: string };
    if (data.status === "OK") return true;
    if (data.status === "ZERO_RESULTS") return false;
    return null;
  } catch {
    return null;
  }
}


export function coverageFromSamples(samples: Array<{m: number; ok: boolean | null}>, step: number, lapM: number) {
    if (!samples.length || samples.some(sample => sample.ok === null)) return null;
    const spans: Array<{ fromM: number; toM: number }> = [];
    let open: { fromM: number; toM: number } | null = null;
    for (const s of samples) {
      if (s.ok) {
        if (!open) open = { fromM: Math.max(0, Math.round(s.m - step / 2)), toM: Math.round(s.m + step / 2) };
        else open.toM = Math.round(s.m + step / 2);
      } else if (open) { spans.push(open); open = null; }
    }
    if (open) spans.push(open);
    for (const sp of spans) sp.toM = Math.min(sp.toM, Math.round(lapM));
    const covered = spans.reduce((a, s) => a + (s.toM - s.fromM), 0);
    return {spans, covered};
}
