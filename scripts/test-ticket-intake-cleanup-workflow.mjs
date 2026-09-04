import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = fs.readFileSync(
  path.join(root, ".github/workflows/ticket-intake-draft-cleanup.yml"),
  "utf8",
);
const valid = JSON.parse(fs.readFileSync(
  path.join(root, "scripts/fixtures/ticket-intake-cleanup-response-valid.json"),
  "utf8",
));
const filterMatch = workflow.match(/echo "\$response" \| jq -e '\n([\s\S]*?)\n\s*' >\/dev\/null/);
assert.ok(filterMatch, "cleanup response jq filter could not be extracted from the workflow");
const filter = filterMatch[1];

function accepted(payload) {
  const result = spawnSync("jq", ["-e", filter], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
  assert.notEqual(result.error?.code, "ENOENT", "jq is required for this workflow-contract test");
  return result.status === 0;
}

assert.equal(accepted(valid), true, "current cleanup response must pass");

for (const [name, mutate] of [
  ["missing converted purge summary", value => delete value.convertedDrafts],
  ["missing notification reconciliation summary", value => delete value.notificationDispatches],
  ["negative converted purge count", value => { value.convertedDrafts.purged = -1; }],
  ["oversize converted purge count", value => { value.convertedDrafts.purged = 26; }],
  ["non-integer notification count", value => { value.notificationDispatches.markedIndeterminate = 1.5; }],
  ["oversize notification count", value => { value.notificationDispatches.markedIndeterminate = 26; }],
]) {
  const candidate = structuredClone(valid);
  mutate(candidate);
  assert.equal(accepted(candidate), false, `${name} must fail closed`);
}

console.log("Ticket intake cleanup workflow response contract: 7/7 passed.");
