#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const offerData = JSON.parse(
  fs.readFileSync(new URL('../src/config/offers.json', import.meta.url), 'utf8')
);

const source = fs.readFileSync(
  new URL('../supabase/functions/_shared/generated-content-guardrails.ts', import.meta.url),
  'utf8',
);
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  reportDiagnostics: true,
});
const syntaxErrors = (transpiled.diagnostics || []).filter(
  (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
);
assert.deepEqual(syntaxErrors, [], 'shared Supabase guard must parse');

const guardrails = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`
);
const {
  EXACT_FABSY_ACTION_COMMITMENT,
  EXACT_FABSY_ONE_LINE,
  EXACT_FABSY_PRICING,
  EXACT_FABSY_SPEED_DISCLAIMER,
  assertGeneratedContentSafe,
  generatedContentViolations,
} = guardrails;

assert.equal(EXACT_FABSY_PRICING, offerData.canonicalPricingCopy);
assert.equal(EXACT_FABSY_ONE_LINE, offerData.rapidResolution.oneLineDescription);
assert.equal(EXACT_FABSY_ACTION_COMMITMENT, offerData.rapidResolution.actionCommitment);
assert.equal(EXACT_FABSY_SPEED_DISCLAIMER, offerData.rapidResolution.speedDisclaimer);

for (const safe of [
  { hook: 'Check the deadline printed on your ticket and review the available options.' },
  { captions: '00:00.000 --> 00:03.000\nReview the ticket carefully.' },
  { next: EXACT_FABSY_PRICING },
  { next: EXACT_FABSY_ONE_LINE },
  { next: EXACT_FABSY_ACTION_COMMITMENT },
  { next: EXACT_FABSY_SPEED_DISCLAIMER },
  { result: 'Fabsy is an agent service, not a law firm. Outcomes vary.' },
]) {
  assert.doesNotThrow(() => assertGeneratedContentSafe(safe));
}

for (const unsafe of [
  { text: 'Fabsy offers risk-free representation.' },
  { text: 'A simple process — with clear next steps.' },
  { text: 'Created for women drivers in Alberta.' },
  { text: 'Fabsy reports a 99% success rate.' },
  { text: 'Fabsy **pricing** is outcome-**based**.' },
  { text: 'Fabsy charges a flat $488.' },
  { text: 'Rapid Resolution costs $198.' },
  { text: 'The insurance report costs $49.' },
  { text: 'The bundle costs $229.' },
  { text: 'Fabsy completes every disclosure review within 24 hours.' },
  { text: 'The fine is $390 and adds 3 demerit points.' },
  { text: 'You must respond within 30 days.' },
  { text: 'A court appearance is mandatory at 51 km/h over the limit.' },
  { text: 'Insurance premiums can rise 20% for three years.' },
  { text: 'Fabsy lawyers provide legal advice.' },
  { text: 'Most tickets resolve with a reduced fine.' },
  { text: 'Read our client testimonials and 4.9-star rating.' },
]) {
  assert.ok(generatedContentViolations(unsafe).length > 0, JSON.stringify(unsafe));
  assert.throws(() => assertGeneratedContentSafe(unsafe), /failed publication guardrails/);
}

console.log('Supabase generated-content guardrail tests passed.');
