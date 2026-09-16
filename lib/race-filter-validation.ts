export function validRaceDate(value: string | null): boolean {
  if (value === null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    && date.getUTCFullYear() >= 1900 && date.getUTCFullYear() <= 2200;
}

/** Same bounds for server-rendered pages and their public API. */
export function validRaceFilters(params: URLSearchParams): boolean {
  const numeric = (name: string, min: number, max: number, integer = false) => {
    const raw = params.get(name);
    if (raw === null) return true;
    const number = Number(raw);
    return raw.trim() !== "" && Number.isFinite(number) && number >= min && number <= max
      && (!integer || Number.isInteger(number));
  };
  if (!numeric("lat", -90, 90) || !numeric("lng", -180, 180) || params.has("lat") !== params.has("lng")) return false;
  if (!numeric("radius", 1, 500) || !numeric("page", 1, 10000, true)) return false;
  if (!["dateFrom", "dateTo", "jour"].every(key => validRaceDate(params.get(key)))) return false;
  const from = params.get("dateFrom"), to = params.get("dateTo");
  if (from && to && from > to) return false;
  if ((params.get("q")?.length ?? 0) > 160) return false;
  return ["fed", "disc", "cat"].every(key => {
    const values = params.getAll(key);
    return values.length <= 40 && values.every(value => value.length <= 64);
  });
}
