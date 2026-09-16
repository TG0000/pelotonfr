import {loadEnv} from "../lib/load-env";
import {migrateStravaTokens} from "../../lib/strava/migrate-tokens";
import {getDatabasePool} from "../../lib/db/transaction";
loadEnv();
const apply=process.argv.includes("--apply");
migrateStravaTokens(apply).then(result=>console.log({mode:apply?"applied":"inspection only",...result})).catch(()=>{console.error("Token migration refused; no changes committed. Check keys and legacy formats without logging credentials.");process.exitCode=1;}).finally(()=>getDatabasePool().end());
