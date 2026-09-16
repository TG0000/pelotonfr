import {symmetricEncrypt,symmetricDecrypt} from "better-auth/crypto";
import {transaction} from "@/lib/db/transaction";
import {openToken,sealToken} from "@/lib/security";

/** Explicit one-time preparation, idempotent and atomic; never logs tokens. */
export async function migrateStravaTokens(apply=false):Promise<{business:number;auth:number}> {
 return transaction(async client=>{
  let business=0,auth=0;
  const secret=process.env.BETTER_AUTH_SECRET;
  if(!secret)throw new Error("Auth secret missing");
  const connections=await client.query("SELECT user_id,access_token,refresh_token FROM strava_connections FOR UPDATE");
  for(const row of connections.rows){
   const convert=(value:string)=>{
    if(value.startsWith("v1.")){openToken(value);return value;}
    if(!/^[a-f0-9]{40}$/i.test(value))throw new Error("Unknown legacy Strava token format; manual reconnection required");
    return sealToken(value);
   };
   const access=convert(row.access_token),refresh=convert(row.refresh_token);
   if(access!==row.access_token||refresh!==row.refresh_token){
    business++;
    if(apply)await client.query("UPDATE strava_connections SET access_token=$2,refresh_token=$3 WHERE user_id=$1",[row.user_id,access,refresh]);
   }
  }
  const accounts=await client.query('SELECT id,"accessToken","refreshToken" FROM account WHERE "providerId"=\'strava\' FOR UPDATE');
  for(const row of accounts.rows){
   const convert=async(value:string|null)=>{
    if(!value)return value;
    if(/^[a-f0-9]{40}$/i.test(value))return symmetricEncrypt({key:secret,data:value});
    await symmetricDecrypt({key:secret,data:value});return value;
   };
   const access=await convert(row.accessToken),refresh=await convert(row.refreshToken);
   if(access!==row.accessToken||refresh!==row.refreshToken){
    auth++;if(apply)await client.query('UPDATE account SET "accessToken"=$2,"refreshToken"=$3 WHERE id=$1',[row.id,access,refresh]);
   }
  }
  return {business,auth};
 });
}
