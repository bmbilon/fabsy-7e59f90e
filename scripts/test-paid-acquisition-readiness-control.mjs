#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  calculateAcquisitionLimits,
  evaluatePaidAcquisitionReadiness,
  EXPECTED_CORE_FUNCTIONS,
  EXPECTED_MIGRATIONS,
  EXPECTED_SEPARATE_FUNCTIONS,
  EXPECTED_SHARED_FUNCTION_FILES,
  EXPECTED_TRUSTED_IP_FUNCTIONS,
  parseJsonWithoutDuplicateKeys,
} from './paid-acquisition-readiness.mjs';

const NOW = '2026-09-04T18:00:00Z';
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
}).trim();

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function transitiveSharedFunctionSources(root) {
  const sharedRoot = path.join(root, 'supabase/functions/_shared');
  const pending = [...EXPECTED_CORE_FUNCTIONS, ...EXPECTED_SEPARATE_FUNCTIONS]
    .map(functionName => path.join(root, 'supabase/functions', functionName, 'index.ts'));
  const inspected = new Set();
  const sharedFiles = new Set();
  const importPattern = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)(["'])(\.\.?\/[^"']+)\1/g;
  while (pending.length > 0) {
    const sourceFile = pending.pop();
    if (inspected.has(sourceFile)) continue;
    inspected.add(sourceFile);
    const source = fs.readFileSync(sourceFile, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const importedFile = path.resolve(path.dirname(sourceFile), match[2]);
      const relativeToShared = path.relative(sharedRoot, importedFile);
      if (relativeToShared.startsWith('..') || path.isAbsolute(relativeToShared)) continue;
      assert.ok(fs.statSync(importedFile).isFile(), `Shared import must resolve to a file: ${importedFile}`);
      const relativeToRoot = path.relative(root, importedFile).replaceAll(path.sep, '/');
      sharedFiles.add(relativeToRoot);
      pending.push(importedFile);
    }
  }
  return [...sharedFiles].sort();
}

function createFixture(platform = 'meta') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fabsy-readiness-control-'));
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.email', 'fixture@fabsy.invalid');
  git(root, 'config', 'user.name', 'Fabsy fixture');
  fs.writeFileSync(path.join(root, 'source.txt'), 'deployed source\n');
  for (const migration of EXPECTED_MIGRATIONS) {
    const migrationPath = path.join(root, 'supabase', 'migrations', migration);
    fs.mkdirSync(path.dirname(migrationPath), { recursive: true });
    fs.writeFileSync(migrationPath, `-- fixture ${migration}\n`);
  }
  for (const functionName of [...EXPECTED_CORE_FUNCTIONS, ...EXPECTED_SEPARATE_FUNCTIONS]) {
    const functionPath = path.join(root, 'supabase', 'functions', functionName, 'index.ts');
    fs.mkdirSync(path.dirname(functionPath), { recursive: true });
    fs.writeFileSync(functionPath, `// fixture ${functionName}\n`);
  }
  for (const sharedFile of EXPECTED_SHARED_FUNCTION_FILES) {
    const sharedPath = path.join(root, sharedFile);
    fs.mkdirSync(path.dirname(sharedPath), { recursive: true });
    fs.writeFileSync(sharedPath, `// fixture ${path.basename(sharedFile)}\n`);
  }
  git(root, 'add', 'source.txt', 'supabase');
  git(root, 'commit', '--quiet', '-m', 'fixture source');
  const sourceCommit = git(root, 'rev-parse', 'HEAD');
  const deployedGitRef = 'refs/tags/paid-acquisition-fixture';
  git(root, 'tag', '-a', deployedGitRef.replace('refs/tags/', ''), '-m', 'fixture deployment', sourceCommit);

  const evidenceDir = path.join(root, 'evidence');
  fs.mkdirSync(evidenceDir);
  fs.writeFileSync(path.join(evidenceDir, 'bundle.js'), 'production bundle bytes\n');
  writeJson(path.join(evidenceDir, 'gate-support.json'), {
    kind: 'production-gate-support',
    capturedAt: '2026-09-04T13:45:00Z',
    result: 'PASS',
  });
  const gateEvidence = new Map();
  for (const gateId of Array.from({ length: 21 }, (_, index) => index + 1)) {
    const receiptRelative = `evidence/gate-${String(gateId).padStart(2, '0')}.json`;
    const artifacts = ['evidence/gate-support.json'];
    writeJson(path.join(root, receiptRelative), {
      schemaVersion: 1,
      kind: 'paid-acquisition-gate-evidence',
      gateId,
      result: 'PASS',
      sourceCommit,
      capturedAt: '2026-09-04T13:45:00Z',
      artifactPaths: artifacts,
    });
    gateEvidence.set(gateId, [receiptRelative, ...artifacts]);
  }
  writeJson(path.join(evidenceDir, 'phone.json'), { kind: 'phone-test', result: 'PASS' });
  writeJson(path.join(evidenceDir, 'notifications.json'), { kind: 'notification-test', result: 'PASS' });
  writeJson(path.join(evidenceDir, 'stripe.json'), { kind: 'stripe-branding', result: 'PASS' });
  writeJson(path.join(evidenceDir, 'trusted-edge-ip.json'), {
    schemaVersion: 1,
    kind: 'trusted-cf-connecting-ip-verification',
    sourceCommit,
    capturedAt: '2026-09-04T13:40:00Z',
    headerName: 'cf-connecting-ip',
    functions: [...EXPECTED_TRUSTED_IP_FUNCTIONS],
    environments: [
      {
        name: 'staging',
        projectRef: 'fabsy-staging',
        endpointOrigin: 'https://fabsy-staging.supabase.co',
        testedAt: '2026-09-04T13:35:00Z',
        trustedHeaderObserved: true,
        xForwardedForIgnored: true,
        xRealIpIgnored: true,
        missingHeaderUsesUnknownBucket: true,
        publicTrafficPausedDuringTest: true,
      },
      {
        name: 'production',
        projectRef: 'fabsy-production',
        endpointOrigin: 'https://fabsy-production.supabase.co',
        testedAt: '2026-09-04T13:40:00Z',
        trustedHeaderObserved: true,
        xForwardedForIgnored: true,
        xRealIpIgnored: true,
        missingHeaderUsesUnknownBucket: true,
        publicTrafficPausedDuringTest: true,
      },
    ],
  });
  writeJson(path.join(evidenceDir, 'unlisted.json'), { kind: 'not-in-manifest' });

  const deploymentOrder = {
    migrationFiles: [...EXPECTED_MIGRATIONS],
    coreFunctions: [...EXPECTED_CORE_FUNCTIONS],
    sharedFunctionFiles: [...EXPECTED_SHARED_FUNCTION_FILES],
    migrationsAppliedAt: '2026-09-04T12:00:00Z',
    coreFunctionsDeployedAt: '2026-09-04T12:10:00Z',
    webhookDeployedAt: '2026-09-04T12:20:00Z',
    webhookVerifiedAt: '2026-09-04T12:30:00Z',
    createPaymentDeployedAt: '2026-09-04T12:40:00Z',
    cleanupManualVerifiedAt: '2026-09-04T12:50:00Z',
    cleanupScheduleEnabledAt: '2026-09-04T13:00:00Z',
    frontendDeployedAt: '2026-09-04T13:10:00Z',
  };
  const isMeta = platform === 'meta';
  const provider = {
    platform,
    accountId: isMeta ? '1102946998970411' : '938-501-7797',
    campaignId: isMeta ? '120249563224850687' : 'google-campaign-1',
    adGroupId: isMeta ? '120249563224870687' : 'google-ad-group-1',
    adIds: isMeta
      ? ['120249563224860687', '120249564456910687', '120249564456920687']
      : ['google-ad-1'],
    objective: 'SALES',
    optimizationGoal: 'PURCHASE',
    datasetId: isMeta ? '123456789012345' : null,
    datasetRestriction: isMeta ? 'UNRESTRICTED' : 'NOT_APPLICABLE',
    optimizationEligibility: 'ELIGIBLE',
    conversionActionIds: isMeta ? [] : ['7740835320'],
    destinationUrls: isMeta
      ? [
          'https://fabsy.ca/rapid-resolution?utm_source=meta&utm_medium=paid_social&utm_campaign=rr_ab_en_creative_20260831&utm_content=rr_relief_v1',
          'https://fabsy.ca/rapid-resolution?utm_source=meta&utm_medium=paid_social&utm_campaign=rr_ab_en_creative_20260831&utm_content=rr_flat_fee_v1',
          'https://fabsy.ca/rapid-resolution?utm_source=meta&utm_medium=paid_social&utm_campaign=rr_ab_en_creative_20260831&utm_content=rr_client_control_v1',
        ]
      : [
          'https://fabsy.ca/rapid-resolution?utm_source=google&utm_medium=cpc&utm_campaign=rr-pilot-alberta-202608&utm_content={adgroupid}_{creative}&utm_term={keyword}',
        ],
    campaignStatus: 'PAUSED',
    readBackAt: '2026-09-04T13:30:00Z',
    identityEvidencePath: 'evidence/provider.json',
    objectiveEvidencePath: 'evidence/provider.json',
    datasetRestrictionEvidencePath: 'evidence/provider.json',
    readbackEvidencePath: 'evidence/provider.json',
  };
  writeJson(path.join(evidenceDir, 'provider.json'), {
    schemaVersion: 1,
    kind: 'paid-acquisition-provider-readback',
    capturedAt: provider.readBackAt,
    sourceCommit,
    platform: provider.platform,
    accountId: provider.accountId,
    campaignId: provider.campaignId,
    adGroupId: provider.adGroupId,
    adIds: provider.adIds,
    objective: provider.objective,
    optimizationGoal: provider.optimizationGoal,
    datasetId: provider.datasetId,
    datasetRestriction: provider.datasetRestriction,
    optimizationEligibility: provider.optimizationEligibility,
    conversionActionIds: provider.conversionActionIds,
    destinationUrls: provider.destinationUrls,
    campaignStatus: provider.campaignStatus,
  });

  const bundleSha256 = sha256(path.join(evidenceDir, 'bundle.js'));
  writeJson(path.join(evidenceDir, 'deployment.json'), {
    schemaVersion: 1,
    kind: 'paid-acquisition-production-deployment',
    sourceCommit,
    deployedGitRef,
    deploymentId: 'pages-production-fixture',
    productionUrl: 'https://fabsy.ca/rapid-resolution',
    bundleUrl: 'https://fabsy.ca/assets/index-fixture.js',
    bundleSha256,
    deployedAt: deploymentOrder.frontendDeployedAt,
    bundleFetchedAt: '2026-09-04T13:15:00Z',
    deploymentOrder,
  });

  const manifestFiles = [
    'evidence/bundle.js',
    'evidence/deployment.json',
    'evidence/gate-support.json',
    ...Array.from({ length: 21 }, (_, index) => `evidence/gate-${String(index + 1).padStart(2, '0')}.json`),
    'evidence/notifications.json',
    'evidence/phone.json',
    'evidence/provider.json',
    'evidence/stripe.json',
    'evidence/trusted-edge-ip.json',
  ];
  fs.writeFileSync(path.join(evidenceDir, 'manifest.sha256'), `${manifestFiles
    .map(relative => `${sha256(path.join(root, relative))}  ${relative}`)
    .join('\n')}\n`);

  git(root, 'add', 'evidence');
  git(root, 'commit', '--quiet', '-m', 'fixture evidence');

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
    approvedBy: 'Economics Owner',
    approvedById: 'owner.brett',
    approvedAt: '2026-09-04T11:00:00Z',
  };
  const limits = calculateAcquisitionLimits(economics);
  assert.ok(limits);
  const record = {
    schemaVersion: 2,
    decision: 'GO',
    release: {
      sourceCommit,
      deployedGitRef,
      deploymentId: 'pages-production-fixture',
      productionUrl: 'https://fabsy.ca/rapid-resolution',
      bundlePath: '/assets/index-fixture.js',
      bundleSha256,
      bundleEvidencePath: 'evidence/bundle.js',
      deploymentEvidencePath: 'evidence/deployment.json',
      evidenceDirectory: 'evidence',
      evidenceManifestPath: 'evidence/manifest.sha256',
      deployedAt: deploymentOrder.frontendDeployedAt,
      bundleFetchedAt: '2026-09-04T13:15:00Z',
    },
    deploymentOrder,
    economics: {
      ...economics,
      approvedMaximumCacCad: Number(limits.maximumCacCad.toFixed(2)),
      approvedMaximumCplCad: Number(limits.maximumCplCad.toFixed(2)),
      approvedBreakEvenCpcCad: Number(limits.breakEvenCpcCad.toFixed(2)),
    },
    operations: {
      weeklyCaseCapacity: 100,
      maximumMediaLossCad: 130,
      maximumSpendWithoutLeadCad: 40,
      maximumSpendWithoutPurchaseCad: 130,
      maximumMediaLossApprovedBy: 'Economics Owner',
      maximumMediaLossApprovedById: 'owner.brett',
      maximumMediaLossApprovedAt: '2026-09-04T11:05:00Z',
      noCrossPlatformOverlapStageOne: true,
      phoneTestEvidence: 'evidence/phone.json',
      notificationTestEvidence: 'evidence/notifications.json',
      stripeBrandingEvidence: 'evidence/stripe.json',
      trustedCfConnectingIpEvidence: 'evidence/trusted-edge-ip.json',
    },
    provider,
    gates: Array.from({ length: 21 }, (_, index) => ({
      id: index + 1,
      status: 'PASS',
      evidence: gateEvidence.get(index + 1),
    })),
    review: {
      releaseOwner: 'Release Engineer',
      releaseOwnerId: 'release.engineer',
      independentReviewer: 'Independent Reviewer',
      independentReviewerId: 'review.fable',
      reviewedAt: '2026-09-04T14:00:00Z',
      providerStatusBeforeLaunch: 'PAUSED',
      oneClickPauseSeconds: 9,
      goApprovedBy: 'Economics Owner',
      goApprovedById: 'owner.brett',
      goApprovedAt: '2026-09-04T14:15:00Z',
    },
    spendAuthorization: {
      platform,
      dailyCapCad: 25,
      totalCapCad: 130,
      startAt: '2026-09-05T09:00:00Z',
      endAt: '2026-09-12T09:00:00Z',
      taxesAdditional: true,
      authorizedBy: 'Finance Authorizer',
      authorizedById: 'finance.authorizer',
      authorizedAt: '2026-09-04T14:30:00Z',
    },
  };
  return { root, record };
}

const { root, record: valid } = createFixture();
const evaluate = candidate => evaluatePaidAcquisitionReadiness(candidate, { root, now: NOW });
const validResult = evaluate(valid);
assert.deepEqual(validResult.failures, []);
assert.equal(validResult.ready, true);
assert.equal(validResult.ciValid, true);

function blocked(label, mutate, expected) {
  const candidate = structuredClone(valid);
  const cleanup = mutate(candidate);
  try {
    const result = evaluate(candidate);
    assert.equal(result.ready, false, `${label} unexpectedly yielded GO`);
    assert.ok(result.failures.some(message => message.includes(expected)),
      `${label} did not report ${JSON.stringify(expected)}:\n${result.failures.join('\n')}`);
  } finally {
    if (typeof cleanup === 'function') cleanup();
  }
}

blocked('nonexistent evidence', candidate => {
  candidate.gates[0].evidence = ['evidence/does-not-exist.json'];
}, 'does not resolve');
blocked('empty generic gate receipt', candidate => {
  const receiptPath = path.join(root, candidate.gates[0].evidence[0]);
  const original = fs.readFileSync(receiptPath);
  writeJson(receiptPath, {});
  return () => fs.writeFileSync(receiptPath, original);
}, 'Gate 1 receipt keys do not match schema');
blocked('gate receipt reused for another gate', candidate => {
  candidate.gates[1].evidence = [...candidate.gates[0].evidence];
}, 'gate-specific receipt that is not reused');
blocked('gate receipt identifies a different gate', candidate => {
  const receiptPath = path.join(root, candidate.gates[0].evidence[0]);
  const original = fs.readFileSync(receiptPath);
  const receipt = parseJsonWithoutDuplicateKeys(fs.readFileSync(receiptPath, 'utf8'));
  receipt.gateId = 21;
  writeJson(receiptPath, receipt);
  return () => fs.writeFileSync(receiptPath, original);
}, 'must identify gate 1 with result PASS');
blocked('gate receipt omits its supporting artifact', candidate => {
  const receiptPath = path.join(root, candidate.gates[0].evidence[0]);
  const original = fs.readFileSync(receiptPath);
  const receipt = parseJsonWithoutDuplicateKeys(fs.readFileSync(receiptPath, 'utf8'));
  receipt.artifactPaths = [];
  writeJson(receiptPath, receipt);
  return () => fs.writeFileSync(receiptPath, original);
}, 'artifactPaths must exactly list');
blocked('unlisted evidence', candidate => {
  candidate.gates[0].evidence = ['evidence/unlisted.json'];
}, 'not listed');
blocked('evidence prose instead of a path', candidate => {
  candidate.gates[0].evidence = ['verified in production (no artifact)'];
}, 'does not resolve');
blocked('path traversal', candidate => {
  candidate.gates[0].evidence = ['../outside.json'];
}, 'normalized repository-relative path');
blocked('fake commit', candidate => {
  candidate.release.sourceCommit = 'a'.repeat(40);
}, 'does not exist in this repository');
blocked('fake deployed ref', candidate => {
  candidate.release.deployedGitRef = 'refs/tags/paid-acquisition-does-not-exist';
}, 'does not resolve');
blocked('fake bundle hash', candidate => {
  candidate.release.bundleSha256 = 'b'.repeat(64);
}, 'does not match the captured production bundle bytes');
for (const [label, bundlePath] of [
  ['protocol-relative bundle path', '//attacker.invalid/assets/index.js'],
  ['bundle path traversal', '/assets/../index.js'],
  ['encoded bundle path', '/assets/%69ndex.js'],
  ['bundle path query', '/assets/index.js?cache=1'],
  ['bundle path fragment', '/assets/index.js#fragment'],
  ['bundle path backslash', '/assets\\index.js'],
  ['nested bundle path', '/assets/nested/index.js'],
]) {
  blocked(label, candidate => {
    candidate.release.bundlePath = bundlePath;
  }, 'canonical root-relative /assets/*.js path');
}
blocked('wrong production origin', candidate => {
  candidate.release.productionUrl = 'https://example.invalid/rapid-resolution';
}, 'must be the canonical https://fabsy.ca/rapid-resolution');
blocked('wrong production landing path', candidate => {
  candidate.release.productionUrl = 'https://fabsy.ca/submit-ticket';
}, 'must be the canonical https://fabsy.ca/rapid-resolution');
blocked('noncanonical empty production query', candidate => {
  candidate.release.productionUrl = 'https://fabsy.ca/rapid-resolution?';
}, 'must be the canonical https://fabsy.ca/rapid-resolution');
blocked('provider destination leaves released landing', candidate => {
  candidate.provider.destinationUrls = ['https://fabsy.ca/submit-ticket?utm_source=meta'];
}, 'exact canonical https://fabsy.ca/rapid-resolution');
blocked('provider destination contains a fragment', candidate => {
  candidate.provider.destinationUrls = ['https://fabsy.ca/rapid-resolution?utm_source=meta#checkout'];
}, 'exact canonical https://fabsy.ca/rapid-resolution');
blocked('provider destination uses a noncanonical default port', candidate => {
  candidate.provider.destinationUrls[0] = candidate.provider.destinationUrls[0].replace('https://fabsy.ca/', 'https://fabsy.ca:443/');
}, 'exact canonical https://fabsy.ca/rapid-resolution');
blocked('provider destination uses noncanonical origin casing', candidate => {
  candidate.provider.destinationUrls[0] = candidate.provider.destinationUrls[0].replace('https://fabsy.ca/', 'https://FABSY.ca/');
}, 'exact canonical https://fabsy.ca/rapid-resolution');
blocked('provider destination omits required UTM', candidate => {
  candidate.provider.destinationUrls[0] = 'https://fabsy.ca/rapid-resolution?utm_source=meta&utm_medium=paid_social&utm_campaign=rr_ab_en_creative_20260831';
}, 'must contain exactly');
blocked('provider destination repeats a query key', candidate => {
  candidate.provider.destinationUrls[0] = 'https://fabsy.ca/rapid-resolution?utm_source=meta&utm_source=meta&utm_medium=paid_social&utm_campaign=rr_ab_en_creative_20260831&utm_content=rr_relief_v1';
}, 'must not repeat query parameter utm_source');
blocked('provider destination uses wrong platform source', candidate => {
  candidate.provider.destinationUrls[0] = 'https://fabsy.ca/rapid-resolution?utm_source=google&utm_medium=paid_social&utm_campaign=rr_ab_en_creative_20260831&utm_content=rr_relief_v1';
}, 'must use utm_source=meta and utm_medium=paid_social');
blocked('provider destination adds an unreviewed query', candidate => {
  candidate.provider.destinationUrls[0] = `${candidate.provider.destinationUrls[0]}&utm_term=traffic_ticket`;
}, 'and no other query parameters');
blocked('provider destination uses encoded confusable UTM value', candidate => {
  candidate.provider.destinationUrls[0] = 'https://fabsy.ca/rapid-resolution?utm_source=m%65ta&utm_medium=paid_social&utm_campaign=rr_ab_en_creative_20260831&utm_content=rr_relief_v1';
}, 'must not contain encoded');
blocked('provider destination uses unreviewed campaign', candidate => {
  candidate.provider.destinationUrls[0] = 'https://fabsy.ca/rapid-resolution?utm_source=meta&utm_medium=paid_social&utm_campaign=rr_unreviewed&utm_content=rr_relief_v1';
}, 'reviewed meta utm_campaign/utm_content pair');
blocked('provider destination uses unreviewed content', candidate => {
  candidate.provider.destinationUrls[0] = 'https://fabsy.ca/rapid-resolution?utm_source=meta&utm_medium=paid_social&utm_campaign=rr_ab_en_creative_20260831&utm_content=rr_unreviewed_v1';
}, 'reviewed meta utm_campaign/utm_content pair');
blocked('provider destinations reuse a campaign/content pair', candidate => {
  candidate.provider.destinationUrls[1] = 'https://fabsy.ca/rapid-resolution?utm_content=rr_relief_v1&utm_campaign=rr_ab_en_creative_20260831&utm_medium=paid_social&utm_source=meta';
}, 'unique reviewed utm_campaign/utm_content pairs');
blocked('future evidence', candidate => {
  candidate.review.reviewedAt = '2099-01-01T00:00:00Z';
}, 'cannot be in the future');
blocked('stale evidence', candidate => {
  candidate.review.reviewedAt = '2026-08-20T14:00:00Z';
}, 'older than the seven-day');
blocked('name aliasing', candidate => {
  candidate.spendAuthorization.authorizedBy = ' release-engineer ';
}, 'distinct after name normalization');
blocked('stable-ID aliasing', candidate => {
  candidate.spendAuthorization.authorizedById = candidate.review.releaseOwnerId;
}, 'four distinct stable actor IDs');
blocked('review and GO ordering', candidate => {
  candidate.review.goApprovedAt = '2026-09-04T13:59:00Z';
}, 'written GO must occur after independent review');
blocked('backend deployment ordering', candidate => {
  candidate.deploymentOrder.createPaymentDeployedAt = '2026-09-04T12:21:00Z';
}, 'create-payment deployment must occur after signed webhook verification');
blocked('missing first migration', candidate => {
  candidate.deploymentOrder.migrationFiles = candidate.deploymentOrder.migrationFiles.slice(1);
}, 'required backend-first sequence');
blocked('missing required shared source inventory entry', candidate => {
  candidate.deploymentOrder.sharedFunctionFiles = candidate.deploymentOrder.sharedFunctionFiles.slice(1);
}, 'conservative shared-source inventory');
blocked('required migration has uncommitted source drift', candidate => {
  const migrationPath = path.join(root, 'supabase/migrations', EXPECTED_MIGRATIONS[0]);
  const original = fs.readFileSync(migrationPath);
  fs.appendFileSync(migrationPath, '-- unreviewed drift\n');
  return () => fs.writeFileSync(migrationPath, original);
}, 'uncommitted source drift');
blocked('required Edge Function source is missing', candidate => {
  const functionPath = path.join(root, 'supabase/functions', EXPECTED_CORE_FUNCTIONS[0], 'index.ts');
  const heldPath = `${functionPath}.held`;
  fs.renameSync(functionPath, heldPath);
  return () => fs.renameSync(heldPath, functionPath);
}, 'must resolve to a regular tracked source file');
blocked('required shared source changed after release tag', candidate => {
  const originalHead = git(root, 'rev-parse', 'HEAD');
  const sharedFile = EXPECTED_SHARED_FUNCTION_FILES[0];
  fs.appendFileSync(path.join(root, sharedFile), '// committed after release tag\n');
  git(root, 'add', '--', sharedFile);
  git(root, 'commit', '--quiet', '-m', 'unreviewed shared source drift');
  return () => git(root, 'reset', '--hard', originalHead);
}, 'changed after release.sourceCommit');
blocked('required shared source has uncommitted drift', candidate => {
  const sharedPath = path.join(root, EXPECTED_SHARED_FUNCTION_FILES[1]);
  const original = fs.readFileSync(sharedPath);
  fs.appendFileSync(sharedPath, '// uncommitted shared source drift\n');
  return () => fs.writeFileSync(sharedPath, original);
}, 'uncommitted source drift');
blocked('missing campaign ID', candidate => {
  candidate.provider.campaignId = null;
}, 'provider.campaignId');
blocked('unknown provider platform fails closed', candidate => {
  candidate.provider.platform = '__proto__';
}, 'provider.platform must be meta or google');
blocked('missing objective', candidate => {
  candidate.provider.objective = null;
}, 'provider.objective');
blocked('missing Meta dataset restriction', candidate => {
  candidate.provider.datasetRestriction = 'NOT_APPLICABLE';
}, 'actual dataset restriction');
blocked('provider receipt mismatch', candidate => {
  candidate.provider.optimizationGoal = 'LINK_CLICKS';
}, 'Provider receipt optimizationGoal does not match');
blocked('untyped trusted proxy evidence', candidate => {
  candidate.operations.trustedCfConnectingIpEvidence = 'evidence/gate-support.json';
}, 'trusted proxy receipt keys do not match schema');
blocked('trusted proxy missing production proof', candidate => {
  const receiptPath = path.join(root, candidate.operations.trustedCfConnectingIpEvidence);
  const original = fs.readFileSync(receiptPath);
  const receipt = parseJsonWithoutDuplicateKeys(fs.readFileSync(receiptPath, 'utf8'));
  receipt.environments = receipt.environments.slice(0, 1);
  writeJson(receiptPath, receipt);
  return () => fs.writeFileSync(receiptPath, original);
}, 'exactly staging and production');
blocked('unexpected schema field', candidate => {
  candidate.release.unreviewed = true;
}, 'unexpected unreviewed');

const noGo = structuredClone(valid);
noGo.decision = 'NO_GO';
noGo.gates[2] = { id: 3, status: 'PRODUCTION_OPEN', evidence: [] };
noGo.spendAuthorization = null;
const noGoResult = evaluate(noGo);
assert.equal(noGoResult.ready, false);
assert.equal(noGoResult.ciValid, true, noGoResult.failures.join('\n'));

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
assert.deepEqual(
  transitiveSharedFunctionSources(projectRoot),
  [...EXPECTED_SHARED_FUNCTION_FILES].sort(),
  'The exact shared-function inventory must cover every transitive local _shared import used by the release functions.',
);
const committedNoGo = parseJsonWithoutDuplicateKeys(fs.readFileSync(
  path.join(projectRoot, 'docs/paid-acquisition/2026-09-03-restart-readiness.json'),
  'utf8',
));
const committedNoGoResult = evaluatePaidAcquisitionReadiness(committedNoGo, { root: projectRoot, now: NOW });
assert.equal(committedNoGoResult.ready, false);
assert.equal(committedNoGoResult.ciValid, true, committedNoGoResult.failures.join('\n'));

const { root: googleRoot, record: validGoogle } = createFixture('google');
const evaluateGoogle = candidate => evaluatePaidAcquisitionReadiness(candidate, { root: googleRoot, now: NOW });
const validGoogleResult = evaluateGoogle(validGoogle);
assert.deepEqual(validGoogleResult.failures, []);
assert.equal(validGoogleResult.ready, true);
for (const [label, destination, expected] of [
  [
    'Google source/medium mismatch',
    'https://fabsy.ca/rapid-resolution?utm_source=meta&utm_medium=cpc&utm_campaign=rr-pilot-alberta-202608&utm_content={adgroupid}_{creative}&utm_term={keyword}',
    'utm_source=google and utm_medium=cpc',
  ],
  [
    'Google unreviewed campaign',
    'https://fabsy.ca/rapid-resolution?utm_source=google&utm_medium=cpc&utm_campaign=rr-search-unreviewed&utm_content={adgroupid}_{creative}&utm_term={keyword}',
    'reviewed google utm_campaign/utm_content pair',
  ],
  [
    'Google unreviewed ValueTrack content',
    'https://fabsy.ca/rapid-resolution?utm_source=google&utm_medium=cpc&utm_campaign=rr-pilot-alberta-202608&utm_content={creative}&utm_term={keyword}',
    'reviewed google utm_campaign/utm_content pair',
  ],
  [
    'Google unreviewed ValueTrack term',
    'https://fabsy.ca/rapid-resolution?utm_source=google&utm_medium=cpc&utm_campaign=rr-pilot-alberta-202608&utm_content={adgroupid}_{creative}&utm_term={searchterm}',
    'reviewed google utm_term={keyword}',
  ],
]) {
  const candidate = structuredClone(validGoogle);
  candidate.provider.destinationUrls = [destination];
  const result = evaluateGoogle(candidate);
  assert.equal(result.ready, false, `${label} unexpectedly yielded GO`);
  assert.ok(result.failures.some(message => message.includes(expected)),
    `${label} did not report ${JSON.stringify(expected)}:\n${result.failures.join('\n')}`);
}

const buildWorkflow = fs.readFileSync(path.join(projectRoot, '.github/workflows/build.yml'), 'utf8');
const prerenderWorkflow = fs.readFileSync(path.join(projectRoot, '.github/workflows/prerender-refresh.yml'), 'utf8');
const cleanupWorkflow = fs.readFileSync(path.join(projectRoot, '.github/workflows/ticket-intake-draft-cleanup.yml'), 'utf8');
const runbook = fs.readFileSync(path.join(projectRoot, 'docs/paid-acquisition/2026-09-03-paid-acquisition-restart-runbook.md'), 'utf8');
const manualDeployCondition = "github.ref == 'refs/heads/main' && github.event_name == 'workflow_dispatch' && inputs.deploy_frontend == true";
const gateIndex = buildWorkflow.indexOf('- name: Verify backend-first frontend deployment gate');
const deployIndex = buildWorkflow.indexOf('- name: Deploy to Cloudflare Pages');
assert.ok(gateIndex >= 0 && deployIndex > gateIndex, 'The backend-first gate must precede the only Pages deployment.');
assert.equal((buildWorkflow.match(/cloudflare\/wrangler-action@v3/g) || []).length, 1,
  'build.yml must contain exactly one Pages deployment action.');
assert.match(buildWorkflow.slice(gateIndex, deployIndex), new RegExp(`if: ${manualDeployCondition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
assert.match(buildWorkflow.slice(deployIndex), new RegExp(`if: ${manualDeployCondition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
assert.match(buildWorkflow, /test "\$REQUESTED_COMMIT" = "\$GITHUB_SHA"/);
assert.match(buildWorkflow, /test "\$PINNED_DEPLOYABLE_COMMIT" = "\$GITHUB_SHA"/);
assert.match(buildWorkflow, /test "\$CONFIRMATION" = "BACKEND_READY_FRONTEND_LAST"/);
assert.doesNotMatch(prerenderWorkflow, /cloudflare\/wrangler-action|pages deploy|submit-indexnow/,
  'Prerender refresh must never deploy or announce frontend bytes.');
assert.doesNotMatch(prerenderWorkflow, /git pull(?:\s|[^\n])*--rebase/,
  'Prerender refresh must not rebase stale generated output onto newer source.');
assert.match(prerenderWorkflow, /- name: Commit refreshed snapshots\n\s+if: github\.ref == 'refs\/heads\/main'/,
  'Only a run checked out from main may commit generated snapshots back to main.');
assert.match(prerenderWorkflow, /git fetch --no-tags origin main/);
assert.match(prerenderWorkflow, /test "\$\(git rev-parse refs\/remotes\/origin\/main\)" = "\$GITHUB_SHA"/,
  'The prerender writer must abort when main moved after generation.');
assert.match(cleanupWorkflow,
  /if: github\.event_name == 'workflow_dispatch' \|\| \(github\.event_name == 'schedule' && vars\.TICKET_INTAKE_CLEANUP_SCHEDULE_ENABLED == 'true'\)/,
  'Scheduled cleanup must remain disabled until its repository gate is explicitly enabled.');
for (const functionName of [
  '_shared/meta-capi.ts', '_shared/meta-purchase.ts', 'create-payment', 'idr-payment-webhook',
  'meta-capi-worker', ...EXPECTED_CORE_FUNCTIONS,
]) {
  assert.ok(buildWorkflow.includes(functionName), `build.yml Deno check is missing ${functionName}.`);
  assert.ok(prerenderWorkflow.includes(functionName), `prerender-refresh.yml Deno check is missing ${functionName}.`);
}
let previousMigrationIndex = -1;
for (const migration of EXPECTED_MIGRATIONS) {
  const migrationIndex = runbook.indexOf(migration);
  assert.ok(migrationIndex > previousMigrationIndex, `Runbook migration is missing or out of order: ${migration}.`);
  previousMigrationIndex = migrationIndex;
}
assert.match(runbook, /staging and production, prove Supabase Edge supplies the trusted `cf-connecting-ip` header/);
assert.match(runbook, /if the trusted header is absent, all callers share the conservative `unknown` rate-limit bucket and public traffic stays paused/);

assert.throws(
  () => parseJsonWithoutDuplicateKeys('{"decision":"NO_GO","decision":"GO"}'),
  /Duplicate JSON key: decision/,
);
assert.throws(
  () => parseJsonWithoutDuplicateKeys('{"review":{"name":"one","name":"two"}}'),
  /Duplicate JSON key: review.name/,
);

fs.rmSync(root, { recursive: true, force: true });
fs.rmSync(googleRoot, { recursive: true, force: true });
console.log('Paid-acquisition readiness control: repository-backed GO passes; fabricated evidence, commit, bundle, timestamps, role aliases, provider claims and ordering fail closed; honest NO-GO remains CI-valid.');
