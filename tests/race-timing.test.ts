import { test } from "node:test";
import assert from "node:assert/strict";
import { todayISO } from "../lib/date";
import { resolveTiming,parsePublishedHour } from "../lib/race-timing";
test("The French calendar changes date at Paris midnight, including DST",()=>{
 assert.equal(todayISO(new Date("2026-06-01T22:30:00Z")),"2026-06-02");
 assert.equal(todayISO(new Date("2026-01-01T23:30:00Z")),"2026-01-02");
});
test("Published meeting start has priority and remains labelled by scope",()=>{
 const result=resolveTiming({categories:[],discipline:"route",distanceKm:80,startTime:"15h30",bibPickupTime:"14h30",historical:{startHour:14,durationMinutes:80}});
 assert.equal(result.startHour,15.5);assert.equal(result.source,"published-meeting");
});
test("An estimate cannot precede bib pickup and invalid hours are ignored",()=>{
 const result=resolveTiming({categories:[],discipline:"route",distanceKm:80,startTime:null,bibPickupTime:"16:00",historical:null});
 assert.equal(result.startHour,16.5);assert.equal(parsePublishedHour("27h99"),null);
});
