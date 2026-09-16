/** Explicitly synthetic fixtures. Refuses every database except the dedicated preview. */
import { getDatabasePool } from "../../lib/db/transaction";

async function main() {
  if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== "/pelotonfr_preview_v02") throw new Error("Preview database required");
  const fixtures = [
    { key:"preview-falaises",name:"Démo — Le Circuit des Falaises",fed:1,city:"Caen",lat:49.182,lng:-0.370,days:5,categories:["access1","access2"],distance:68 },
    { key:"preview-bocage",name:"Démo — La Ronde du Bocage",fed:2,city:"Vire",lat:48.839,lng:-0.889,days:12,categories:["fsgt3","fsgt4"],distance:72 },
    { key:"preview-ponts",name:"Démo — Le Prix des Trois Ponts",fed:3,city:"Bayeux",lat:49.278,lng:-0.703,days:19,categories:["fsgt2","fsgt3"],distance:56 },
  ];
  for (const race of fixtures) {
    await getDatabasePool().query(`INSERT INTO races(external_id,federation_id,name,race_date,city,department_code,department_name,region,
      discipline,categories,distance_km,location,geocoding_status,notes)
      VALUES($1,$2,$3,(now() AT TIME ZONE 'Europe/Paris')::date+$4::int,$5,'14','Calvados','Normandie','route',$6,$7,
      ST_SetSRID(ST_MakePoint($8,$9),4326)::geography,'success','Course fictive pour tester PelotonFR. Aucun engagement réel possible.')
      ON CONFLICT(federation_id,external_id) DO UPDATE SET name=EXCLUDED.name,race_date=EXCLUDED.race_date,notes=EXCLUDED.notes,categories=EXCLUDED.categories`,
      [race.key,race.fed,race.name,race.days,race.city,race.categories,race.distance,race.lng,race.lat]);
  }
  const demo=(await getDatabasePool().query("SELECT id FROM races WHERE external_id='preview-falaises' AND federation_id=1")).rows[0].id;
  const points=Array.from({length:65},(_,i)=>{const angle=i/64*2*Math.PI;return [-0.370+Math.cos(angle)*0.009,49.182+Math.sin(angle)*0.006,40+12*Math.sin(angle*2),Math.round(i/64*4200)];});
  await getDatabasePool().query(`INSERT INTO race_traces(race_id,source,points,distance_m,elevation_gain_m,min_elevation_m,max_elevation_m,bounds,centre)
    VALUES($1,'guide',$2,4200,48,28,52,$3,ST_MakePoint(-0.370,49.182)::geography)
    ON CONFLICT(race_id) DO UPDATE SET points=EXCLUDED.points,updated_at=now()`,[demo,JSON.stringify(points),JSON.stringify({west:-0.379,east:-0.361,south:49.176,north:49.188})]);
  await getDatabasePool().query("UPDATE races SET circuit_m=4200,lap_count=16,start_time='14h30',bib_pickup_time='13h00',bib_pickup_place='Lieu fictif',entries_close_at=(race_date-2)+time '20:00' AT TIME ZONE 'Europe/Paris',entries_close_source='fiche' WHERE id=$1",[demo]);
  console.log("Three synthetic races seeded in preview only.");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Seed failed"); process.exitCode=1; }).finally(() => getDatabasePool().end());
