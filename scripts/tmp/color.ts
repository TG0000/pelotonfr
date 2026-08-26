import { oklchToHex } from "../../lib/color";
const vals = [
  "oklch(0.62 0.20 250)", "oklch(0.50 0.20 250)",
  "oklch(0.60 0.18 145)", "oklch(0.52 0.18 145)",
  "oklch(0.68 0.22 30)",  "oklch(0.58 0.22 30)",
  "oklch(1 0 0)", "oklch(0 0 0)", "#abcdef", "rgb(1,2,3)",
];
for (const v of vals) console.log(v.padEnd(24), "->", oklchToHex(v));
