import {test} from "node:test";
import assert from "node:assert/strict";
import {jsonObject,mutationOriginAllowed} from "../lib/request-security";
import {composeBrief,type BriefInput} from "../lib/race-brief";
test("Cookie writes reject missing, null and cross-origin callers",()=>{
 for(const origin of [undefined,"null","https://attacker.test","https://pelotonfr.vercel.app.attacker.test"]){
  assert.equal(mutationOriginAllowed(new Request("https://pelotonfr.vercel.app/api/plan",{headers:origin?{origin}:{}})),false);
 }
 assert.equal(mutationOriginAllowed(new Request("https://pelotonfr.vercel.app/api/plan",{headers:{origin:"https://pelotonfr.vercel.app"}})),true);
});
test("JSON bodies reject null, arrays, malformed and oversized streamed content",async()=>{
 for(const body of ["null","[]","bad","{\"value\":\""+"x".repeat(100)+"\"}"]){
  assert.equal(await jsonObject(new Request("https://example.test",{method:"POST",body}),32),null);
 }
 assert.deepEqual(await jsonObject(new Request("https://example.test",{method:"POST",body:'{"race":"test"}'}),32),{race:"test"});
});
test("Brief distinguishes an eight-lap recording from organiser circuit and uses Paris closure time",()=>{
 const fixture:BriefInput={daysLeft:1,startHour:null,timingMeasured:false,entriesEngaged:null,entriesCapacity:null,entriesCloseAt:"2026-09-16T22:30:00Z",entrantCount:null,clubGoing:null,trace:{distanceM:65900,elevationGainM:352,points:[]},circuitM:8500,lapCount:8,distanceKm:68,climbs:[],field:null,lastEdition:null,weather:null,ground:null,road:null,seen:null,shelter:null,grain:null,blind:[],now:new Date("2026-09-16T20:00:00Z")};
 const text=composeBrief(fixture).lines.join(" ");
 assert.match(text,/jeudi.*00:30/);assert.match(text,/8,5 km.*8 fois/);assert.match(text,/352 m D\+ au total/);assert.doesNotMatch(text,/352 m de dénivelé par tour/);
});
