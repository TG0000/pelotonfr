"use client";
import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth";
import type { RaceIntent } from "@/lib/db/queries/plan";
import { isUuid } from "@/lib/validation";
const NONE: ReadonlyMap<string,RaceIntent> = new Map();
type PlanState = { plan: ReadonlyMap<string,RaceIntent>; set: (raceId:string,intent:RaceIntent|null)=>Promise<void>; isSignedIn:boolean; ready:boolean; pending:ReadonlySet<string> };
const Context=createContext<PlanState|null>(null);

/** One request and one state per signed-in session, shared across all race controls. */
export function PlanProvider({children}:{children:ReactNode}) {
  const {userId}=useAuth();
  return createElement(SessionPlanProvider,{key:userId??"anonymous",isSignedIn:Boolean(userId)},children);
}

function SessionPlanProvider({children,isSignedIn}:{children?:ReactNode;isSignedIn:boolean}) {
  const router=useRouter();
  const [intents,setIntents]=useState<Map<string,RaceIntent>>(new Map());
  const [ready,setReady]=useState(false);
  const [pending,setPending]=useState<Set<string>>(new Set());
  const [locks]=useState(()=>new Set<string>());
  const [error,setError]=useState("");
  useEffect(()=>{
    if(!isSignedIn)return;
    const controller=new AbortController();
    fetch("/api/plan",{signal:controller.signal}).then(async response=>{
      if(!response.ok)throw new Error();
      const data=await response.json();
      const loaded = new Map<string,RaceIntent>(Object.entries(data.intents??{}));
      try {
        const raw=sessionStorage.getItem("pelotonfr:pending-plan");
        if (raw) {
          const saved=JSON.parse(raw);
          if(isUuid(saved.raceId)&&Date.now()-saved.at<15*60_000&&Date.now()>=saved.at&&!loaded.has(saved.raceId)) {
            const result=await fetch("/api/plan",{method:"POST",signal:controller.signal,headers:{"Content-Type":"application/json"},body:JSON.stringify({raceId:saved.raceId,intent:"envisagee"})});
            if (!result.ok) throw new Error();
            loaded.set(saved.raceId,"envisagee");
            router.refresh();
          }
          sessionStorage.removeItem("pelotonfr:pending-plan");
        }
      } catch { if(!controller.signal.aborted)setError("L’ajout demandé avant la connexion n’a pas abouti. Tu peux réessayer avec le bouton Ajouter."); }
      if(!controller.signal.aborted){setIntents(loaded);setReady(true);}
    }).catch(()=>{if(!controller.signal.aborted)setError("Ta saison n’a pas pu être chargée. Recharge la page pour réessayer.");});
    return ()=>controller.abort();
  },[isSignedIn,router]);
  const set=useCallback(async(raceId:string,intent:RaceIntent|null)=>{
    if(!isSignedIn||!ready||locks.has(raceId))return;
    locks.add(raceId);setPending(new Set(locks));setError("");
    const previous=intents.get(raceId)??null;
    setIntents(current=>{const next=new Map(current);if(intent===null)next.delete(raceId);else next.set(raceId,intent);return next;});
    try {
      const response=await fetch("/api/plan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({raceId,intent})});
      if(!response.ok)throw new Error();
      router.refresh();
    } catch {
      setIntents(current=>{const next=new Map(current);if(previous===null)next.delete(raceId);else next.set(raceId,previous);return next;});
      setError("La modification de ta saison n’a pas été enregistrée. Réessaie.");
    } finally { locks.delete(raceId);setPending(new Set(locks)); }
  },[isSignedIn,ready,intents,locks,router]);
  return createElement(Context.Provider,{value:{plan:isSignedIn?intents:NONE,set,isSignedIn,ready:isSignedIn&&ready,pending}},children,
    error?createElement("div",{role:"alert",className:"fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-xl rounded-xl border bg-background p-4 shadow-lg"},error,
      createElement("button",{type:"button",className:"ml-3 underline",onClick:()=>setError("")},"Fermer")):null);
}
export function usePlan():PlanState {
  const value=useContext(Context);
  if(!value)throw new Error("PlanProvider is required");
  return value;
}
