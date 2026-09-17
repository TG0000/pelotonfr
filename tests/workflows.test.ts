import {test} from "node:test";
import {readFileSync,readdirSync} from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const yaml=require("js-yaml");
test("GitHub workflows parse with duplicate mapping keys rejected",()=>{
 for(const file of readdirSync(".github/workflows").filter(name=>/\.ya?ml$/.test(name)))yaml.load(readFileSync(`.github/workflows/${file}`,"utf8"));
});

test("Scheduled email steps receive the verified sender configuration",()=>{
 const workflow=yaml.load(readFileSync('.github/workflows/scrape.yml','utf8'));
 for(const name of ['Send alert digests','Send closing notices']){
  const step=workflow.jobs.scrape.steps.find((step:{name:string})=>step.name===name);
  if(!step?.env?.BREVO_FROM_EMAIL || !step?.env?.ALERT_FROM_EMAIL)throw new Error(`${name}: missing sender configuration`);
 }
});
