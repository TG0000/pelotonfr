import { ImageResponse } from "next/og";
import { getRaceById } from "@/lib/db/queries/races";
import { displayRaceName } from "@/lib/race-name";
import { placeLabel } from "@/components/races/RacePrimitives";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export const runtime = "nodejs";
export const alt = "Course cycliste sur PelotonFR";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Les couleurs de la marque, écrites en dur : le générateur d'image ne lit pas le CSS. */
const NAVY = "#19283f";
const PAPER = "#faf7ef";
const YELLOW = "#ff805b";
const FED: Record<string, string> = { ffc: "#3b82f6", fsgt: "#22c55e", ufolep: "#f97316" };

/**
 * L'aperçu d'un lien partagé.
 *
 * Un lien vers une course envoyé sur WhatsApp ou Messages montre cette carte
 * avant qu'on ait cliqué : le nom, la date, la commune. C'est ce qui décide
 * si l'autre ouvre le lien.
 */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let race = null;
  try {
    race = await getRaceById(id);
  } catch {
    race = null;
  }

  const title = race ? displayRaceName(race.name) : "Course introuvable";
  const when = race
    ? format(new Date(`${race.raceDate}T12:00:00Z`), "EEEE d MMMM yyyy", { locale: fr })
    : "";
  const where = race ? placeLabel(race).text : "";
  const fed = race?.federationSlug ?? "ffc";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: NAVY,
          color: PAPER,
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 28 }}>
          <div style={{ width: 18, height: 18, borderRadius: 9, background: YELLOW }} />
          <span style={{ fontWeight: 700 }}>PelotonFR</span>
          <span style={{ opacity: 0.6 }}>·</span>
          <span style={{ color: FED[fed] ?? PAPER, fontWeight: 700 }}>{fed.toUpperCase()}</span>
        </div>

        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            fontSize: title.length > 60 ? 52 : 64,
            fontWeight: 700,
            lineHeight: 1.1,
            marginTop: 24,
          }}
        >
          {title}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 32 }}>
          <span style={{ textTransform: "capitalize" }}>{when}</span>
          <span style={{ opacity: 0.75 }}>{where}</span>
        </div>

        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 14, background: YELLOW }} />
      </div>
    ),
    size
  );
}
