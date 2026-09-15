import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import fs from 'node:fs';

const result = await build({
  entryPoints: ['src/lib/curated-content-policy.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs', logLevel: 'silent',
});
const module = { exports: {} };
runInNewContext(result.outputFiles[0].text, { module, exports: module.exports });
const { isReviewedOutcomeFaq } = module.exports;
const offers = JSON.parse(fs.readFileSync('src/config/offers.json', 'utf8'));
const approved = {
  q: 'Does Rapid Resolution promise a withdrawal or reduction?',
  a: offers.rapidResolution.outcomeDisclaimer,
};
assert.equal(isReviewedOutcomeFaq(approved), true);
for (const value of [
  null, undefined, '', {},
  { ...approved, q: 'Does Fabsy charge $1?' },
  { ...approved, a: `${approved.a} Fabsy charges $1.` },
  { ...approved, a: approved.a.replace('none of those improvements is obtained', 'any improvement is obtained') },
  { ...approved, a: `<p>${approved.a}</p>` },
]) assert.equal(isReviewedOutcomeFaq(value), false, 'Only the entire approved question and answer qualify');
console.log('Curated refund FAQ policy: exact published copy accepted; altered prices, conditions and markup rejected.');
