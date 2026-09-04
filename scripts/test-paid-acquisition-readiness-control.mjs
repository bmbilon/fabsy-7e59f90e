#!/usr/bin/env node

import assert from 'node:assert/strict';
import { calculateAcquisitionLimits, evaluatePaidAcquisitionReadiness } from './paid-acquisition-readiness.mjs';

const evidence = id => [`docs/paid-acquisition/evidence/gate-${id}.json`];
const economics = {
  priceCad: 198,
  paymentFeesCad: 7.37,
  fulfillmentCostCad: 0,
  refundRate: 0.2,
  supportCostCad: 10,
  requiredContributionCad: 25,
  qualifiedLeadToPaidRate: 0.3,
  plannedLandingToPurchaseRate: 0.015,
  observedClickToLandingRate: 0.794,
  approvedBy: 'Owner',
  approvedAt: '2026-09-04T15:00:00-06:00',
};
const limits = calculateAcquisitionLimits(economics);
assert.ok(limits);

const valid = {
  schemaVersion: 1,
  decision: 'GO',
  release: {
    sourceCommit: 'a'.repeat(40),
    deploymentId: 'deployment-fixture',
    productionUrl: 'https://fabsy.ca/rapid-resolution',
    bundlePath: '/assets/index-fixture.js',
    bundleSha256: 'b'.repeat(64),
    evidenceDirectory: 'docs/paid-acquisition/evidence',
  },
  economics: {
    ...economics,
    approvedMaximumCacCad: Number(limits.maximumCacCad.toFixed(2)),
    approvedMaximumCplCad: Number(limits.maximumCplCad.toFixed(2)),
    approvedBreakEvenCpcCad: Number(limits.breakEvenCpcCad.toFixed(2)),
  },
  operations: {
    weeklyCaseCapacity: 100,
    maximumMediaLossCad: 150,
    phoneTestEvidence: 'docs/paid-acquisition/evidence/phone.json',
    notificationTestEvidence: 'docs/paid-acquisition/evidence/notifications.json',
    stripeBrandingEvidence: 'docs/paid-acquisition/evidence/stripe.json',
  },
  gates: Array.from({ length: 21 }, (_, index) => ({ id: index + 1, status: 'PASS', evidence: evidence(index + 1) })),
  review: {
    releaseOwner: 'Release Owner',
    independentReviewer: 'Independent Reviewer',
    reviewedAt: '2026-09-04T16:00:00-06:00',
    providerStatusBeforeLaunch: 'PAUSED',
    oneClickPauseSeconds: 9,
    goApprovedBy: 'Owner',
    goApprovedAt: '2026-09-04T16:30:00-06:00',
  },
  spendAuthorization: {
    platform: 'meta',
    dailyCapCad: 25,
    totalCapCad: 150,
    startAt: '2026-09-05T09:00:00-06:00',
    endAt: '2026-09-12T09:00:00-06:00',
    taxesAdditional: true,
    authorizedBy: 'Owner',
    authorizedAt: '2026-09-04T17:00:00-06:00',
  },
};

assert.equal(evaluatePaidAcquisitionReadiness(valid).ready, true);

const noGo = structuredClone(valid);
noGo.decision = 'NO_GO';
noGo.economics.refundRate = null;
noGo.gates[2] = { id: 3, status: 'PRODUCTION_OPEN', evidence: [] };
noGo.review.independentReviewer = noGo.review.releaseOwner;
noGo.spendAuthorization = null;
const result = evaluatePaidAcquisitionReadiness(noGo);
assert.equal(result.ready, false);
assert.ok(result.failures.some(message => message.includes('economics')));
assert.ok(result.failures.some(message => message.includes('Gate 3')));
assert.ok(result.failures.some(message => message.includes('independent reviewer')));
assert.ok(result.failures.some(message => message.includes('spendAuthorization')));
assert.ok(result.failures.some(message => message.includes('decision must be GO')));

const duplicateGate = structuredClone(valid);
duplicateGate.gates[20] = { id: 1, status: 'PASS', evidence: evidence(1) };
const duplicateResult = evaluatePaidAcquisitionReadiness(duplicateGate);
assert.equal(duplicateResult.ready, false);
assert.ok(duplicateResult.failures.some(message => message.includes('appears more than once')));
assert.ok(duplicateResult.failures.some(message => message.includes('Gate 21 is missing')));

console.log('Paid-acquisition readiness control: valid GO passes; missing economics, evidence, separation of duties and spend authorization fail closed.');

