// Compares the catalog marker comments in the practice files migration with
// supabase/functions/_shared/practice-catalog.ts (the single source of truth
// for stages, notify flags and outcomes). Run by scripts/test-practice-sql.sh;
// supabase/tests/practice-files.test.sql then checks the markers against the
// SQL behaviour, so catalog, markers and SQL must all agree.
//
// Needs a Node that loads TypeScript directly (22.6+ with type stripping).
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const migrationPath = `${root}supabase/migrations/20261001150000_anderhue_practice_files.sql`;
const catalog = await import(pathToFileURL(`${root}supabase/functions/_shared/practice-catalog.ts`).href);

const expected = [];
for (const area of catalog.PRACTICE_AREAS) {
  expected.push(`-- catalog:stages:${area}=${catalog.STAGES[area].map(stage => stage.value).join(",")}`);
}
for (const area of catalog.PRACTICE_AREAS) {
  expected.push(`-- catalog:notify:${area}=${catalog.STAGES[area].filter(stage => stage.notify).map(stage => stage.value).join(",")}`);
}
// LTB outcomes predate the catalog markers; ltb_cases keeps its own CHECK.
for (const area of catalog.PRACTICE_AREAS.filter(area => area !== "ltb")) {
  expected.push(`-- catalog:outcomes:${area}=${catalog.OUTCOMES[area].map(outcome => outcome.value).join(",")}`);
}

const actual = readFileSync(migrationPath, "utf8").split("\n").filter(line => line.startsWith("-- catalog:"));
const missing = expected.filter(line => !actual.includes(line));
const extra = actual.filter(line => !expected.includes(line));

// Every terminal stage must notify and be closed/declined (the SQL treats
// exactly those two stages as terminal in every area).
const terminalProblems = catalog.PRACTICE_AREAS.flatMap(area => catalog.STAGES[area]
  .filter(stage => Boolean(stage.terminal) !== ["closed", "declined"].includes(stage.value))
  .map(stage => `${area}:${stage.value} terminal flag does not match the SQL terminal stages`));

if (missing.length || extra.length || terminalProblems.length) {
  for (const line of missing) console.error(`missing from migration: ${line}`);
  for (const line of extra) console.error(`not in catalog: ${line}`);
  for (const line of terminalProblems) console.error(line);
  process.exit(1);
}
console.log(`catalog markers match practice-catalog.ts (${expected.length} lists)`);
