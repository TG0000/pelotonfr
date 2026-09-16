import { jsonObject } from "@/lib/request-security";
import { mutationOriginAllowed } from "@/lib/request-security";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/session";
import { resolveUser } from "@/lib/db/queries/alerts";
import { consumeLimit } from "@/lib/rate-limit";
import { isUuid } from "@/lib/validation";
import { startSyncJob,readSyncJob,advanceSyncJob } from "@/lib/strava/sync-job";
export const maxDuration=60;
export async function GET() {
  const {userId}=await auth();if(!userId)return NextResponse.json({error:"Connecte-toi pour consulter la synchronisation."},{status:401});
  return NextResponse.json({job:await readSyncJob(await resolveUser(userId))});
}
export async function POST(request:NextRequest) {
  if (!mutationOriginAllowed(request)) return NextResponse.json({error:"Origine refusée."},{status:403});
  const {userId}=await auth();if(!userId)return NextResponse.json({error:"Connecte-toi pour synchroniser."},{status:401});
  const id=await resolveUser(userId);
  if(!(await consumeLimit(`strava:sync:${id}`,30,60)))return NextResponse.json({error:"Réessaie dans une minute."},{status:429});
  const body=await jsonObject(request,512);
  if(!body)return NextResponse.json({error:"Demande invalide."},{status:400});
  if(body.jobId!==undefined&&!isUuid(body.jobId))return NextResponse.json({error:"Synchronisation invalide."},{status:400});
  const days=body.days??90;if(![30,90,365].includes(Number(days)))return NextResponse.json({error:"Choisis 30, 90 ou 365 jours."},{status:400});
  try {
    const job=body.jobId?await advanceSyncJob(id,String(body.jobId)):await startSyncJob(id,Number(days));
    if(!job)return NextResponse.json({error:"Relie d’abord ton compte Strava."},{status:409});
    return NextResponse.json({job});
  }catch{return NextResponse.json({error:"Synchronisation indisponible. Réessaie dans un instant."},{status:503});}
}
