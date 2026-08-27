-- Where a trace is, according to the trace.
--
-- A course recorded by a rider carries its own coordinates — it is a GPS track.
-- But the race row it hangs off often has none: races discovered through the
-- results index only ever knew a department, and that stand-in was cleared once
-- it turned out to be a centroid.
--
-- So looking for "a trace from near this race" through the race's own location
-- found nothing, even where a rider had ridden the exact circuit. The trace
-- knows perfectly well where it is; it just had no way to say so.

ALTER TABLE race_traces
  ADD COLUMN IF NOT EXISTS centre GEOGRAPHY(Point, 4326);

UPDATE race_traces
SET centre = ST_MakePoint(
      ((bounds->>'west')::float8 + (bounds->>'east')::float8) / 2,
      ((bounds->>'south')::float8 + (bounds->>'north')::float8) / 2
    )::geography
WHERE centre IS NULL AND bounds IS NOT NULL;

CREATE INDEX IF NOT EXISTS race_traces_centre_idx
  ON race_traces USING GIST (centre);
