#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const REQUIRED_GATES = Object.freeze(Array.from({ length: 21 }, (_, index) => index + 1));
const MONEY_TOLERANCE = 0.011;

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonNegative(value) {
  return finiteNumber(value) && value >= 0;
}

function rate(value) {
  return finiteNumber(value) && value >= 0 && value <= 1;
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validTimestamp(value) {
  return nonEmpty(value) && Number.isFinite(Date.parse(value));
}

function validHttpsUrl(value) {
  if (!nonEmpty(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function closeMoney(actual, expected) {
  return finiteNumber(actual) && Math.abs(actual - expected) < MONEY_TOLERANCE;
}

export function calculateAcquisitionLimits(economics) {
  if (!economics || typeof economics !== 'object' || Array.isArray(economics)) return null;
  const {
    priceCad,
    paymentFeesCad,
    fulfillmentCostCad,
    refundRate,
    supportCostCad,
    requiredContributionCad,
    qualifiedLeadToPaidRate,
    plannedLandingToPurchaseRate,
    observedClickToLandingRate,
  } = economics;
  if (![priceCad, paymentFeesCad, fulfillmentCostCad, supportCostCad, requiredContributionCad]
    .every(nonNegative) || ![refundRate, qualifiedLeadToPaidRate, plannedLandingToPurchaseRate, observedClickToLandingRate]
    .every(rate)) return null;

  const maximumCacCad = priceCad - paymentFeesCad - fulfillmentCostCad -
    (priceCad * refundRate) - supportCostCad - requiredContributionCad;
  return {
    maximumCacCad,
    maximumCplCad: maximumCacCad * qualifiedLeadToPaidRate,
    breakEvenCpcCad: maximumCacCad * plannedLandingToPurchaseRate * observedClickToLandingRate,
  };
}

export function evaluatePaidAcquisitionReadiness(record) {
  const failures = [];
  const fail = message => failures.push(message);
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { ready: false, failures: ['Readiness record must be a JSON object.'], calculations: null };
  }
  if (record.schemaVersion !== 1) fail('schemaVersion must be 1.');

  const release = record.release;
  if (!release || typeof release !== 'object' || Array.isArray(release)) {
    fail('release is required.');
  } else {
    if (!COMMIT.test(release.sourceCommit || '')) fail('release.sourceCommit must be a full 40-character commit SHA.');
    if (!nonEmpty(release.deploymentId)) fail('release.deploymentId is required.');
    if (!validHttpsUrl(release.productionUrl)) fail('release.productionUrl must be an HTTPS URL.');
    if (!nonEmpty(release.bundlePath)) fail('release.bundlePath is required.');
    if (!SHA256.test(release.bundleSha256 || '')) fail('release.bundleSha256 must be a lowercase SHA-256.');
    if (!nonEmpty(release.evidenceDirectory)) fail('release.evidenceDirectory is required.');
  }

  const economics = record.economics;
  const calculations = calculateAcquisitionLimits(economics);
  if (!calculations) {
    fail('economics must contain complete, finite non-negative costs and rates from 0 to 1.');
  } else {
    if (economics.priceCad !== 198) fail('economics.priceCad must match the current CA$198 Rapid Resolution price.');
    if (economics.fulfillmentCostCad !== 0) fail('economics.fulfillmentCostCad must preserve Brett\'s supplied CA$0 value.');
    if (calculations.maximumCacCad <= 0) fail('Calculated maximum CAC must be positive.');
    if (!closeMoney(economics.approvedMaximumCacCad, calculations.maximumCacCad)) {
      fail(`approvedMaximumCacCad must equal the calculated value (${calculations.maximumCacCad.toFixed(2)}).`);
    }
    if (!closeMoney(economics.approvedMaximumCplCad, calculations.maximumCplCad)) {
      fail(`approvedMaximumCplCad must equal the calculated value (${calculations.maximumCplCad.toFixed(2)}).`);
    }
    if (!closeMoney(economics.approvedBreakEvenCpcCad, calculations.breakEvenCpcCad)) {
      fail(`approvedBreakEvenCpcCad must equal the calculated value (${calculations.breakEvenCpcCad.toFixed(2)}).`);
    }
    if (!nonEmpty(economics.approvedBy) || !validTimestamp(economics.approvedAt)) {
      fail('The calculated acquisition limits require an owner and timestamp.');
    }
  }

  const operations = record.operations;
  if (!operations || typeof operations !== 'object' || Array.isArray(operations)) {
    fail('operations is required.');
  } else {
    if (!finiteNumber(operations.weeklyCaseCapacity) || operations.weeklyCaseCapacity <= 0) {
      fail('operations.weeklyCaseCapacity must be supplied and positive.');
    }
    if (!finiteNumber(operations.maximumMediaLossCad) || operations.maximumMediaLossCad <= 0) {
      fail('operations.maximumMediaLossCad must be supplied and positive.');
    }
    if (!finiteNumber(operations.maximumSpendWithoutLeadCad) || operations.maximumSpendWithoutLeadCad <= 0) {
      fail('operations.maximumSpendWithoutLeadCad must be supplied and positive.');
    }
    if (!finiteNumber(operations.maximumSpendWithoutPurchaseCad) || operations.maximumSpendWithoutPurchaseCad <= 0) {
      fail('operations.maximumSpendWithoutPurchaseCad must be supplied and positive.');
    }
    if (calculations && finiteNumber(operations.maximumMediaLossCad)) {
      const leadCeiling = Math.min(operations.maximumMediaLossCad, 3 * calculations.maximumCplCad);
      const purchaseCeiling = Math.min(operations.maximumMediaLossCad, 3 * calculations.maximumCacCad);
      if (!finiteNumber(operations.maximumSpendWithoutLeadCad) || operations.maximumSpendWithoutLeadCad > leadCeiling + MONEY_TOLERANCE) {
        fail(`maximumSpendWithoutLeadCad cannot exceed min(maximum loss, 3 x maximum CPL), currently CA$${leadCeiling.toFixed(2)}.`);
      }
      if (!finiteNumber(operations.maximumSpendWithoutPurchaseCad) || operations.maximumSpendWithoutPurchaseCad > purchaseCeiling + MONEY_TOLERANCE) {
        fail(`maximumSpendWithoutPurchaseCad cannot exceed min(maximum loss, 3 x maximum CAC), currently CA$${purchaseCeiling.toFixed(2)}.`);
      }
    }
    if (operations.noCrossPlatformOverlapStageOne !== true) {
      fail('operations.noCrossPlatformOverlapStageOne must be true.');
    }
    if (!nonEmpty(operations.phoneTestEvidence)) fail('operations.phoneTestEvidence is required.');
    if (!nonEmpty(operations.notificationTestEvidence)) fail('operations.notificationTestEvidence is required.');
    if (!nonEmpty(operations.stripeBrandingEvidence)) fail('operations.stripeBrandingEvidence is required.');
  }

  const gates = Array.isArray(record.gates) ? record.gates : [];
  const seen = new Set();
  for (const gate of gates) {
    if (!gate || typeof gate !== 'object' || !Number.isInteger(gate.id)) continue;
    if (seen.has(gate.id)) fail(`Gate ${gate.id} appears more than once.`);
    seen.add(gate.id);
    if (!REQUIRED_GATES.includes(gate.id)) fail(`Gate ${gate.id} is not part of the 21-gate launch board.`);
    if (gate.status !== 'PASS') fail(`Gate ${gate.id} is ${gate.status || 'missing a status'}; every gate must be PASS.`);
    if (!Array.isArray(gate.evidence) || gate.evidence.length === 0 || gate.evidence.some(item => !nonEmpty(item))) {
      fail(`Gate ${gate.id} requires at least one evidence reference.`);
    }
  }
  for (const id of REQUIRED_GATES) if (!seen.has(id)) fail(`Gate ${id} is missing.`);

  const review = record.review;
  if (!review || typeof review !== 'object' || Array.isArray(review)) {
    fail('review is required.');
  } else {
    if (!nonEmpty(review.releaseOwner)) fail('review.releaseOwner is required.');
    if (!nonEmpty(review.independentReviewer)) fail('review.independentReviewer is required.');
    if (review.releaseOwner === review.independentReviewer && nonEmpty(review.releaseOwner)) {
      fail('The independent reviewer cannot be the release owner.');
    }
    if (!validTimestamp(review.reviewedAt)) fail('review.reviewedAt is required.');
    if (review.providerStatusBeforeLaunch !== 'PAUSED') fail('The provider must be read back as PAUSED before launch.');
    if (!finiteNumber(review.oneClickPauseSeconds) || review.oneClickPauseSeconds <= 0) {
      fail('review.oneClickPauseSeconds must record a successful pause test.');
    }
    if (!nonEmpty(review.goApprovedBy) || !validTimestamp(review.goApprovedAt)) {
      fail('A written GO owner and timestamp are required.');
    }
  }

  const spend = record.spendAuthorization;
  if (!spend || typeof spend !== 'object' || Array.isArray(spend)) {
    fail('A separate spendAuthorization is required after GO.');
  } else {
    if (!['meta', 'google'].includes(spend.platform)) fail('spendAuthorization.platform must be meta or google.');
    if (!finiteNumber(spend.dailyCapCad) || spend.dailyCapCad <= 0) fail('spendAuthorization.dailyCapCad must be positive.');
    if (!finiteNumber(spend.totalCapCad) || spend.totalCapCad <= 0) fail('spendAuthorization.totalCapCad must be positive.');
    if (finiteNumber(spend.dailyCapCad) && finiteNumber(spend.totalCapCad) && spend.dailyCapCad > spend.totalCapCad) {
      fail('The daily cap cannot exceed the total cap.');
    }
    if (operations && finiteNumber(operations.maximumMediaLossCad) && finiteNumber(spend.totalCapCad) &&
        spend.totalCapCad > operations.maximumMediaLossCad + MONEY_TOLERANCE) {
      fail('The authorized total cap cannot exceed the approved maximum media loss.');
    }
    if (calculations && finiteNumber(spend.totalCapCad) &&
        spend.totalCapCad > 3 * calculations.maximumCacCad + MONEY_TOLERANCE) {
      fail('The stage-one total cap cannot exceed three times the approved maximum CAC.');
    }
    if (!validTimestamp(spend.startAt) || !validTimestamp(spend.endAt) || Date.parse(spend.endAt) <= Date.parse(spend.startAt)) {
      fail('spendAuthorization requires a valid startAt before endAt.');
    }
    if (typeof spend.taxesAdditional !== 'boolean') fail('spendAuthorization.taxesAdditional must be explicit.');
    if (!nonEmpty(spend.authorizedBy) || !validTimestamp(spend.authorizedAt)) {
      fail('Spend requires a separate owner and timestamp.');
    }
    if (validTimestamp(spend.authorizedAt) && review && validTimestamp(review.goApprovedAt) &&
        Date.parse(spend.authorizedAt) < Date.parse(review.goApprovedAt)) {
      fail('Spend authorization must occur after the written GO decision.');
    }
    if (validTimestamp(spend.startAt) && validTimestamp(spend.authorizedAt) &&
        Date.parse(spend.startAt) < Date.parse(spend.authorizedAt)) {
      fail('The campaign cannot start before its spend authorization.');
    }
  }

  if (record.decision !== 'GO') fail('decision must be GO only after every requirement passes.');
  return { ready: failures.length === 0, failures, calculations };
}

function printResult(file, result) {
  const calculations = result.calculations;
  if (calculations) {
    console.log(`Calculated limits: CAC CA$${calculations.maximumCacCad.toFixed(2)}; CPL CA$${calculations.maximumCplCad.toFixed(2)}; break-even CPC CA$${calculations.breakEvenCpcCad.toFixed(2)}.`);
  }
  if (result.ready) {
    console.log(`GO: ${file} passes all paid-acquisition launch controls.`);
    return;
  }
  console.error(`NO-GO: ${file} has ${result.failures.length} blocking issue${result.failures.length === 1 ? '' : 's'}.`);
  for (const failure of result.failures) console.error(`- ${failure}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const supplied = process.argv[2] || 'docs/paid-acquisition/2026-09-03-restart-readiness.json';
  const file = path.resolve(root, supplied);
  try {
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    const result = evaluatePaidAcquisitionReadiness(record);
    printResult(path.relative(root, file), result);
    if (!result.ready) process.exitCode = 1;
  } catch (error) {
    console.error(`NO-GO: could not validate ${path.relative(root, file)}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
