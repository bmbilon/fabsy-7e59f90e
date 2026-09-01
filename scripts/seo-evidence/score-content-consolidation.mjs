#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ORIGIN = "https://fabsy.ca";

export const CITY_SLUGS = [
  "airdrie",
  "banff",
  "brooks",
  "calgary",
  "camrose",
  "canmore",
  "cochrane",
  "cold-lake",
  "edmonton",
  "fort-mcmurray",
  "grande-prairie",
  "hinton",
  "jasper",
  "lacombe",
  "leduc",
  "lethbridge",
  "lloydminster",
  "medicine-hat",
  "okotoks",
  "red-deer",
  "spruce-grove",
  "stony-plain",
  "sylvan-lake",
  "wetaskiwin",
].sort((a, b) => b.length - a.length);

export const MODIFIER_SLUGS = [
  "commercial-driver",
  "first-time-offender",
  "multiple-tickets",
  "new-driver",
  "officer-error",
  "out-of-province",
  "photo-radar",
  "weather-conditions",
].sort((a, b) => b.length - a.length);

const RECOMMENDATIONS = new Set([
  "KEEP",
  "ENRICH",
  "REVIEW",
  "MERGE_CANDIDATE",
]);

const CSV_COLUMNS = [
  "slug",
  "url",
  "recommendation",
  "confidence",
  "preservation_score",
  "manual_review_required",
  "manifest_source",
  "is_curated",
  "content_shape",
  "offense_family",
  "city",
  "modifier",
  "possible_merge_target",
  "gsc_evidence_status",
  "gsc_clicks",
  "gsc_impressions",
  "gsc_ctr_percent",
  "gsc_average_position",
  "gsc_ai_evidence_status",
  "gsc_ai_impressions",
  "reason",
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function findHeader(headers, candidates) {
  const byNormalizedName = new Map(
    headers.map((header) => [normalizeHeader(header), header]),
  );

  for (const candidate of candidates) {
    const match = byNormalizedName.get(normalizeHeader(candidate));
    if (match) return match;
  }

  return null;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("CSV ended inside a quoted field");

  if (field !== "" || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    if (row.some((value) => value !== "")) rows.push(row);
  }

  if (rows.length === 0) return { headers: [], records: [] };

  const headers = rows[0].map((header) => header.trim());
  const records = rows.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
  );

  return { headers, records };
}

function parseMetric(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePercent(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).replace("%", "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeContentSlug(rawUrl, expectedOrigin) {
  const trimmed = String(rawUrl ?? "").trim();
  if (!trimmed) return null;

  let pathname;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const parsed = new URL(trimmed);
      const expected = new URL(expectedOrigin);
      if (parsed.hostname !== expected.hostname) return null;
      pathname = parsed.pathname;
    } else {
      pathname = new URL(trimmed, expectedOrigin).pathname;
    }
  } catch {
    return null;
  }

  const match = pathname.replace(/\/+$/, "").match(/^\/content\/([^/]+)$/);
  if (!match) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function readGscPageExport(text, options = {}) {
  const origin = options.origin ?? DEFAULT_ORIGIN;
  const { headers, records } = parseCsv(text);
  const pageHeader = findHeader(headers, [
    "Top pages",
    "Page",
    "Pages",
    "Landing page",
    "URL",
  ]);
  const clicksHeader = findHeader(headers, ["Clicks"]);
  const impressionsHeader = findHeader(headers, ["Impressions"]);
  const ctrHeader = findHeader(headers, ["CTR", "Click through rate"]);
  const positionHeader = findHeader(headers, [
    "Position",
    "Average position",
    "Avg position",
  ]);

  if (!pageHeader || !clicksHeader || !impressionsHeader) {
    throw new Error(
      "GSC CSV must be a Pages export with page/URL, Clicks, and Impressions columns",
    );
  }

  const bySlug = new Map();
  let ignoredNonContentRows = 0;
  let duplicateNormalizedRows = 0;

  for (const record of records) {
    const slug = normalizeContentSlug(record[pageHeader], origin);
    if (!slug) {
      ignoredNonContentRows += 1;
      continue;
    }

    const clicks = parseMetric(record[clicksHeader]) ?? 0;
    const impressions = parseMetric(record[impressionsHeader]) ?? 0;
    const ctrPercent = ctrHeader ? parsePercent(record[ctrHeader]) : null;
    const position = positionHeader ? parseMetric(record[positionHeader]) : null;
    const existing = bySlug.get(slug);

    if (!existing) {
      bySlug.set(slug, {
        clicks,
        impressions,
        ctrPercent,
        position,
        sourceRows: 1,
      });
      continue;
    }

    duplicateNormalizedRows += 1;
    const combinedImpressions = existing.impressions + impressions;
    const combinedClicks = existing.clicks + clicks;
    const weightedPosition =
      combinedImpressions > 0 && existing.position !== null && position !== null
        ? (existing.position * existing.impressions + position * impressions) /
          combinedImpressions
        : existing.position ?? position;

    bySlug.set(slug, {
      clicks: combinedClicks,
      impressions: combinedImpressions,
      ctrPercent:
        combinedImpressions > 0 ? (combinedClicks / combinedImpressions) * 100 : null,
      position: weightedPosition,
      sourceRows: existing.sourceRows + 1,
    });
  }

  return {
    bySlug,
    profile: {
      sourceRows: records.length,
      contentRows: records.length - ignoredNonContentRows,
      uniqueContentUrls: bySlug.size,
      ignoredNonContentRows,
      duplicateNormalizedRows,
      dimensionalClicks: [...bySlug.values()].reduce(
        (sum, row) => sum + row.clicks,
        0,
      ),
      dimensionalImpressions: [...bySlug.values()].reduce(
        (sum, row) => sum + row.impressions,
        0,
      ),
    },
  };
}

export function readGscAiPageExport(text, options = {}) {
  const origin = options.origin ?? DEFAULT_ORIGIN;
  const { headers, records } = parseCsv(text);
  const pageHeader = findHeader(headers, [
    "Top pages",
    "Page",
    "Pages",
    "Landing page",
    "URL",
  ]);
  const impressionsHeader = findHeader(headers, ["Impressions"]);

  if (!pageHeader || !impressionsHeader) {
    throw new Error(
      "Generative AI CSV must be a Pages export with page/URL and Impressions columns",
    );
  }

  const bySlug = new Map();
  let ignoredNonContentRows = 0;
  let duplicateNormalizedRows = 0;

  for (const record of records) {
    const slug = normalizeContentSlug(record[pageHeader], origin);
    if (!slug) {
      ignoredNonContentRows += 1;
      continue;
    }

    const impressions = parseMetric(record[impressionsHeader]) ?? 0;
    const existing = bySlug.get(slug);
    if (existing) duplicateNormalizedRows += 1;
    bySlug.set(slug, {
      impressions: (existing?.impressions ?? 0) + impressions,
      sourceRows: (existing?.sourceRows ?? 0) + 1,
    });
  }

  return {
    bySlug,
    profile: {
      sourceRows: records.length,
      contentRows: records.length - ignoredNonContentRows,
      uniqueContentUrls: bySlug.size,
      ignoredNonContentRows,
      duplicateNormalizedRows,
      dimensionalImpressions: [...bySlug.values()].reduce(
        (sum, row) => sum + row.impressions,
        0,
      ),
    },
  };
}

export function classifySlug(slug) {
  let base = slug;
  const modifier = MODIFIER_SLUGS.find((candidate) =>
    base.endsWith(`-${candidate}`),
  );
  if (modifier) base = base.slice(0, -(modifier.length + 1));

  const city = CITY_SLUGS.find((candidate) => base.endsWith(`-${candidate}`));
  if (city) base = base.slice(0, -(city.length + 1));

  const provinceBase = !city && base.endsWith("-alberta");
  if (provinceBase) base = base.slice(0, -"-alberta".length);

  let contentShape = "other";
  if (modifier && city) contentShape = "scenario_variant";
  else if (modifier) contentShape = "modifier_variant";
  else if (city) contentShape = "city_base";
  else if (provinceBase) contentShape = "province_base";

  return {
    contentShape,
    offenseFamily: base,
    city: city ?? "",
    modifier: modifier ?? "",
    provinceBase,
  };
}

function preservationScore({ isCurated, shape, gsc, aiGsc }) {
  let score = 45;

  if (isCurated) score += 45;
  if (shape.provinceBase) score += 12;
  if (shape.contentShape === "city_base") score += 4;
  if (shape.modifier) score -= 18;

  if (gsc) {
    if (gsc.clicks > 0) score += Math.min(35, 15 + Math.log10(gsc.clicks + 1) * 12);
    else if (gsc.impressions === 0) score -= 8;

    if (gsc.impressions >= 1000) score += 18;
    else if (gsc.impressions >= 100) score += 12;
    else if (gsc.impressions >= 10) score += 6;
    else if (gsc.impressions > 0) score += 1;
  }

  if (aiGsc?.impressions > 0) score += 30;

  return Math.round(clamp(score, 0, 100));
}

function recommendationFor({ isCurated, shape, gsc, aiGsc, mergeTarget }) {
  if (isCurated) {
    return {
      recommendation: "KEEP",
      confidence: "high",
      reason: "Curated source in the manifest; preserve as an intentional page.",
    };
  }

  if (aiGsc?.impressions > 0) {
    return {
      recommendation: "KEEP",
      confidence: "high",
      reason:
        "Observed in the first-party GSC Generative AI Features page report; preserve pending page-level review.",
    };
  }

  // Any observed click is a hard preservation guardrail. A candidate with clicks
  // must never be proposed for merging by this tool.
  if (gsc?.clicks > 0) {
    return {
      recommendation: "KEEP",
      confidence: "high",
      reason: "Observed at least one GSC click; preserve pending page-level review.",
    };
  }

  if (gsc?.impressions >= 1000) {
    return {
      recommendation: "KEEP",
      confidence: "medium",
      reason: "Observed at least 1,000 GSC impressions even without a click; preserve and diagnose CTR/intent.",
    };
  }

  if (shape.provinceBase) {
    return {
      recommendation: "ENRICH",
      confidence: gsc ? "medium" : "low",
      reason: "Province-wide base page is a likely consolidation destination; improve differentiation and sourcing.",
    };
  }

  if (gsc?.impressions >= 10) {
    return {
      recommendation: "ENRICH",
      confidence: "medium",
      reason: "Observed search visibility without clicks; inspect query fit, title, and unique value before consolidation.",
    };
  }

  if (shape.modifier && mergeTarget) {
    return {
      recommendation: "MERGE_CANDIDATE",
      confidence: gsc ? "medium" : "low",
      reason: gsc
        ? "Scenario/persona variant has no clicks and fewer than 10 observed impressions; review against the existing province-wide page."
        : "Scenario/persona variant has an existing province-wide page, but no page-level GSC row was supplied; evidence is incomplete, so review only.",
    };
  }

  if (shape.contentShape === "city_base" && mergeTarget) {
    return {
      recommendation: "REVIEW",
      confidence: gsc ? "medium" : "low",
      reason: "City base overlaps an existing province-wide page; retain unless manual review finds no genuinely local value.",
    };
  }

  return {
    recommendation: "REVIEW",
    confidence: gsc ? "medium" : "low",
    reason: gsc
      ? "Low observed signal, but no safe structural merge target was identified."
      : "No page-level GSC evidence was supplied and no safe automatic conclusion is possible.",
  };
}

export function scoreManifest(manifest, options = {}) {
  const origin = options.origin ?? DEFAULT_ORIGIN;
  const gscBySlug = options.gscBySlug ?? null;
  const aiBySlug = options.aiBySlug ?? null;
  const manifestSlugs = Array.isArray(manifest.dbSlugs)
    ? manifest.dbSlugs
    : manifest.slugs;

  if (!Array.isArray(manifestSlugs)) {
    throw new Error("Manifest must contain a dbSlugs or slugs array");
  }

  const duplicateSlugs = manifestSlugs.filter(
    (slug, index) => manifestSlugs.indexOf(slug) !== index,
  );
  if (duplicateSlugs.length > 0) {
    throw new Error(`Manifest contains duplicate slugs: ${[...new Set(duplicateSlugs)].join(", ")}`);
  }

  const slugSet = new Set(manifestSlugs);
  const curatedSet = new Set(manifest.curatedSlugs ?? []);
  const rows = manifestSlugs.map((slug) => {
    const shape = classifySlug(slug);
    const candidateTarget = `${shape.offenseFamily}-alberta`;
    const mergeTarget =
      candidateTarget !== slug && slugSet.has(candidateTarget)
        ? `/content/${candidateTarget}`
        : "";
    const gsc = gscBySlug?.get(slug) ?? null;
    const aiGsc = aiBySlug?.get(slug) ?? null;
    const isCurated = curatedSet.has(slug);
    const decision = recommendationFor({
      isCurated,
      shape,
      gsc,
      aiGsc,
      mergeTarget,
    });

    return {
      slug,
      url: new URL(`/content/${slug}`, origin).toString(),
      recommendation: decision.recommendation,
      confidence: decision.confidence,
      preservation_score: preservationScore({ isCurated, shape, gsc, aiGsc }),
      manual_review_required: decision.recommendation === "KEEP" ? "no" : "yes",
      manifest_source: isCurated ? "curated" : "fallback",
      is_curated: isCurated ? "yes" : "no",
      content_shape: shape.contentShape,
      offense_family: shape.offenseFamily,
      city: shape.city,
      modifier: shape.modifier,
      possible_merge_target: mergeTarget,
      gsc_evidence_status: gsc
        ? "observed_page_row"
        : gscBySlug
          ? "not_present_in_export"
          : "not_supplied",
      gsc_clicks: gsc?.clicks ?? "",
      gsc_impressions: gsc?.impressions ?? "",
      gsc_ctr_percent:
        gsc?.impressions > 0 ? ((gsc.clicks / gsc.impressions) * 100).toFixed(4) : "",
      gsc_average_position: gsc?.position ?? "",
      gsc_ai_evidence_status: aiGsc
        ? "observed_ai_page_row"
        : aiBySlug
          ? "not_present_in_ai_export"
          : "not_supplied",
      gsc_ai_impressions: aiGsc?.impressions ?? "",
      reason: decision.reason,
    };
  });

  for (const row of rows) {
    if (!RECOMMENDATIONS.has(row.recommendation)) {
      throw new Error(`Unexpected recommendation for ${row.slug}: ${row.recommendation}`);
    }
    if (row.recommendation === "MERGE_CANDIDATE" && Number(row.gsc_clicks) > 0) {
      throw new Error(`Safety invariant failed: clicked URL proposed for merge: ${row.slug}`);
    }
    if (
      row.recommendation === "MERGE_CANDIDATE" &&
      Number(row.gsc_ai_impressions) > 0
    ) {
      throw new Error(
        `Safety invariant failed: AI-visible URL proposed for merge: ${row.slug}`,
      );
    }
    if (row.recommendation === "MERGE_CANDIDATE" && !row.possible_merge_target) {
      throw new Error(`Safety invariant failed: merge candidate has no target: ${row.slug}`);
    }
  }

  return rows;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rowsToCsv(rows) {
  return [
    CSV_COLUMNS.join(","),
    ...rows.map((row) => CSV_COLUMNS.map((column) => csvEscape(row[column])).join(",")),
  ].join("\n") + "\n";
}

function parseArgs(argv) {
  const options = {
    manifest: "public/prerendered/content-manifest.json",
    origin: DEFAULT_ORIGIN,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--manifest") options.manifest = argv[++index];
    else if (argument === "--gsc") options.gsc = argv[++index];
    else if (argument === "--gsc-ai") options.gscAi = argv[++index];
    else if (argument === "--out") options.out = argv[++index];
    else if (argument === "--summary") options.summary = argv[++index];
    else if (argument === "--origin") options.origin = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function usage() {
  return `Usage:
  node scripts/seo-evidence/score-content-consolidation.mjs [options]

Options:
  --manifest <path>  Manifest JSON (default: public/prerendered/content-manifest.json)
  --gsc <path>       Optional Google Search Console Pages.csv export
  --gsc-ai <path>    Optional GSC Generative AI Features Pages.csv export
  --out <path>       Write the candidate CSV here; otherwise print CSV to stdout
  --summary <path>   Optional JSON summary output
  --origin <url>     Site origin used to normalize URLs (default: https://fabsy.ca)
  --help             Show this help

The script is advisory. It never edits routes, redirects, source content, or snapshots,
and MERGE_CANDIDATE always requires manual review before any implementation.
`;
}

function buildSummary({
  manifest,
  rows,
  gscProfile,
  gscBySlug,
  aiProfile,
  aiBySlug,
  options,
}) {
  const recommendationCounts = Object.fromEntries(
    [...RECOMMENDATIONS].map((recommendation) => [
      recommendation,
      rows.filter((row) => row.recommendation === recommendation).length,
    ]),
  );
  const matchedGscRows = rows.filter(
    (row) => row.gsc_evidence_status === "observed_page_row",
  );
  const gscSlugsNotInManifest = gscBySlug
    ? [...gscBySlug.keys()].filter(
        (slug) => !rows.some((row) => row.slug === slug),
      )
    : [];
  const aiSlugsNotInManifest = aiBySlug
    ? [...aiBySlug.keys()].filter(
        (slug) => !rows.some((row) => row.slug === slug),
      )
    : [];

  return {
    generatedAt: new Date().toISOString(),
    advisoryOnly: true,
    destructiveActionsPerformed: false,
    inputs: {
      manifest: path.resolve(options.manifest),
      manifestVersion: manifest.version ?? null,
      manifestGeneratedAt: manifest.generatedAt ?? null,
      manifestSlugCount: rows.length,
      declaredDbSourceCount: manifest.dbSourceCount ?? null,
      declaredCuratedCount: manifest.curatedCount ?? null,
      declaredFallbackCount: manifest.fallbackCount ?? null,
      gscPagesExport: options.gsc ? path.resolve(options.gsc) : null,
      gscScope: options.gsc
        ? "page-dimensional evidence only; absence from the export is unknown, not zero"
        : "not supplied",
      gscGenerativeAiPagesExport: options.gscAi
        ? path.resolve(options.gscAi)
        : null,
      gscGenerativeAiScope: options.gscAi
        ? "Generative AI Features page-dimensional evidence; page rows are non-additive against the UI chart total"
        : "not supplied",
    },
    gscProfile: gscProfile
      ? {
          ...gscProfile,
          matchedManifestUrls: matchedGscRows.length,
          contentUrlsNotInManifest: gscSlugsNotInManifest.length,
          contentUrlsNotInManifestExamples: gscSlugsNotInManifest.slice(0, 10),
          caveat:
            "Dimensional row sums can differ from Search Console chart totals; use the separately verified aggregate snapshot for overall KPIs.",
        }
      : null,
    gscGenerativeAiProfile: aiProfile
      ? {
          ...aiProfile,
          matchedManifestUrls: rows.filter(
            (row) => row.gsc_ai_evidence_status === "observed_ai_page_row",
          ).length,
          contentUrlsNotInManifest: aiSlugsNotInManifest.length,
          contentUrlsNotInManifestExamples: aiSlugsNotInManifest.slice(0, 10),
          caveat:
            "Do not sum page rows as the report total; preserve the separately observed chart total as the KPI.",
        }
      : null,
    recommendationCounts,
    safetyChecks: {
      outputRowsEqualManifestRows: rows.length === (manifest.dbSlugs ?? manifest.slugs).length,
      mergeCandidatesWithClicks: rows.filter(
        (row) =>
          row.recommendation === "MERGE_CANDIDATE" && Number(row.gsc_clicks) > 0,
      ).length,
      mergeCandidatesWithoutExistingTarget: rows.filter(
        (row) => row.recommendation === "MERGE_CANDIDATE" && !row.possible_merge_target,
      ).length,
      mergeCandidatesWithAiImpressions: rows.filter(
        (row) =>
          row.recommendation === "MERGE_CANDIDATE" &&
          Number(row.gsc_ai_impressions) > 0,
      ).length,
      reminder:
        "No recommendation authorizes deletion, noindex, redirect, or canonical changes without URL-level review.",
    },
  };
}

export function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  if (!options.manifest) throw new Error("--manifest requires a path");

  const manifest = JSON.parse(fs.readFileSync(options.manifest, "utf8"));
  let gscBySlug = null;
  let gscProfile = null;
  let aiBySlug = null;
  let aiProfile = null;

  if (options.gsc) {
    const parsed = readGscPageExport(fs.readFileSync(options.gsc, "utf8"), {
      origin: options.origin,
    });
    gscBySlug = parsed.bySlug;
    gscProfile = parsed.profile;
  }

  if (options.gscAi) {
    const parsed = readGscAiPageExport(fs.readFileSync(options.gscAi, "utf8"), {
      origin: options.origin,
    });
    aiBySlug = parsed.bySlug;
    aiProfile = parsed.profile;
  }

  const rows = scoreManifest(manifest, {
    origin: options.origin,
    gscBySlug,
    aiBySlug,
  });
  const csv = rowsToCsv(rows);
  const summary = buildSummary({
    manifest,
    rows,
    gscProfile,
    gscBySlug,
    aiProfile,
    aiBySlug,
    options,
  });

  if (options.out) {
    fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
    fs.writeFileSync(options.out, csv);
  } else {
    process.stdout.write(csv);
  }

  if (options.summary) {
    fs.mkdirSync(path.dirname(path.resolve(options.summary)), { recursive: true });
    fs.writeFileSync(options.summary, `${JSON.stringify(summary, null, 2)}\n`);
  }

  if (options.out) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`content consolidation scorer failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
