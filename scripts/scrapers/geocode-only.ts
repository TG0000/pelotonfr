import "dotenv/config";
import { geocodePendingRaces } from "./utils/upsert-races";

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) { console.error("No DATABASE_URL"); process.exit(1); }
  const geocoded = await geocodePendingRaces(DATABASE_URL);
  console.log(`Geocoded: ${geocoded}`);
}
main().catch(console.error);
