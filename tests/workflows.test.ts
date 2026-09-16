import {test} from "node:test";
import {readFileSync,readdirSync} from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const yaml=require("js-yaml");
test("GitHub workflows parse with duplicate mapping keys rejected",()=>{
 for(const file of readdirSync(".github/workflows").filter(name=>/\.ya?ml$/.test(name)))yaml.load(readFileSync(`.github/workflows/${file}`,"utf8"));
});
