#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseCsv } from "./score-content-consolidation.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..");
const QUERY_FILE = path.join(
  REPOSITORY_ROOT,
  "docs/seo-research/citation-benchmark-queries.csv",
);
const TEMPLATE_FILE = path.join(
  REPOSITORY_ROOT,
  "docs/seo-research/citation-benchmark-observations-template.csv",
);
const DEFAULT_OUTPUT_DIRECTORY = path.join(
  REPOSITORY_ROOT,
  "docs/seo-research/citation-benchmark-runs",
);

const EXPECTED_TEMPLATE_HEADERS = [
  "run_id",
  "run_date",
  "benchmark_id",
  "platform",
  "interface_or_product",
  "model_or_index",
  "web_search_enabled",
  "location",
  "personalization_state",
  "observation_status",
  "result_position",
  "fabsy_mentioned",
  "fabsy_cited",
  "first_fabsy_url",
  "first_commercial_domain",
  "top_source_type",
  "authority_sources_cited",
  "answer_factually_safe",
  "legal_error_flags",
  "commercial_fact_accuracy",
  "evidence_capture_path",
  "evidence_sha256",
  "reviewer",
  "notes",
  "result_url",
];

const PLATFORM_PROFILES = Object.freeze({
  google: {
    platform: "Google",
    interfaceOrProduct: "organic-web-search",
    webSearchEnabled: "yes",
  },
  bing: {
    platform: "Bing",
    interfaceOrProduct: "organic-web-search",
    webSearchEnabled: "yes",
  },
  perplexity: {
    platform: "Perplexity",
    interfaceOrProduct: "Search",
    webSearchEnabled: "yes",
  },
  chatgpt: {
    platform: "ChatGPT",
    interfaceOrProduct: "web-search-enabled",
    webSearchEnabled: "yes",
  },
  claude: {
    platform: "Claude",
    interfaceOrProduct: "web-search-enabled",
    webSearchEnabled: "yes",
  },
});

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(headers, rows) {
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n") + "\n";
}

function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function cleanMetadata(name, value, fallback = "not_recorded") {
  const normalized = String(value ?? fallback).trim();
  if (!normalized) return fallback;
  if (/[\r\n]/.test(normalized)) {
    throw new Error(`${name} must be a single line`);
  }
  if (normalized.length > 250) {
    throw new Error(`${name} must be 250 characters or fewer`);
  }
  return normalized;
}

function loadBenchmarkInputs() {
  const queries = parseCsv(fs.readFileSync(QUERY_FILE, "utf8"));
  const template = parseCsv(fs.readFileSync(TEMPLATE_FILE, "utf8"));

  if (queries.records.length !== 30) {
    throw new Error(`Expected 30 fixed benchmark prompts, found ${queries.records.length}`);
  }
  if (new Set(queries.records.map((row) => row.benchmark_id)).size !== 30) {
    throw new Error("Benchmark IDs must be unique");
  }
  if (queries.records.some((row) => row.row_status !== "fixed_prompt")) {
    throw new Error("Every benchmark query must retain row_status=fixed_prompt");
  }
  if (template.records.length !== 0) {
    throw new Error("The observation template must remain header-only");
  }
  if (JSON.stringify(template.headers) !== JSON.stringify(EXPECTED_TEMPLATE_HEADERS)) {
    throw new Error("The observation template headers no longer match the run generator");
  }

  return { queries: queries.records, headers: template.headers };
}

export function buildCitationBenchmarkRun({
  platform,
  date,
  repetition = 1,
  interfaceOrProduct,
  modelOrIndex,
  webSearchEnabled,
  location,
  personalizationState,
  reviewer = "",
} = {}) {
  const platformKey = String(platform ?? "").trim().toLowerCase();
  const profile = PLATFORM_PROFILES[platformKey];
  if (!profile) {
    throw new Error(
      `--platform must be one of: ${Object.keys(PLATFORM_PROFILES).join(", ")}`,
    );
  }
  if (!isCalendarDate(String(date ?? ""))) {
    throw new Error("--date must be a real calendar date in YYYY-MM-DD form");
  }

  const repetitionNumber = Number(repetition);
  if (!Number.isSafeInteger(repetitionNumber) || repetitionNumber < 1) {
    throw new Error("--repetition must be a positive integer");
  }

  const normalizedWebSearch = cleanMetadata(
    "web search status",
    webSearchEnabled,
    profile.webSearchEnabled,
  );
  if (!new Set(["yes", "no", "not_recorded"]).has(normalizedWebSearch)) {
    throw new Error("--web-search must be yes, no, or not_recorded");
  }

  const runId = `${platformKey}-${date}-r${repetitionNumber}`;
  const { queries, headers } = loadBenchmarkInputs();
  const rows = queries.map((query) => ({
    run_id: runId,
    run_date: date,
    benchmark_id: query.benchmark_id,
    platform: profile.platform,
    interface_or_product: cleanMetadata(
      "interface",
      interfaceOrProduct,
      profile.interfaceOrProduct,
    ),
    model_or_index: cleanMetadata("model or index", modelOrIndex),
    web_search_enabled: normalizedWebSearch,
    location: cleanMetadata("location", location),
    personalization_state: cleanMetadata(
      "personalization state",
      personalizationState,
    ),
    observation_status: "planned_not_run",
    result_position: "",
    fabsy_mentioned: "not_recorded",
    fabsy_cited: "not_recorded",
    first_fabsy_url: "",
    first_commercial_domain: "not_recorded",
    top_source_type: "not_recorded",
    authority_sources_cited: "not_recorded",
    answer_factually_safe: "not_reviewed",
    legal_error_flags: "not_reviewed",
    commercial_fact_accuracy: "not_reviewed",
    evidence_capture_path: "",
    evidence_sha256: "",
    reviewer: cleanMetadata("reviewer", reviewer, ""),
    notes: "",
    result_url: "",
  }));

  return {
    runId,
    date,
    platformKey,
    rows,
    csv: rowsToCsv(headers, rows),
  };
}

export function createCitationBenchmarkRun({ outDirectory, ...options } = {}) {
  const run = buildCitationBenchmarkRun(options);
  const baseDirectory = path.resolve(outDirectory ?? DEFAULT_OUTPUT_DIRECTORY);
  const datedDirectory = path.join(baseDirectory, run.date);
  const outputPath = path.join(
    datedDirectory,
    `citation-benchmark-${run.runId}.csv`,
  );

  fs.mkdirSync(datedDirectory, { recursive: true });
  try {
    fs.writeFileSync(outputPath, run.csv, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`Refusing to overwrite existing benchmark artifact: ${outputPath}`);
    }
    throw error;
  }

  return { ...run, outputPath };
}

function parseArgs(argv) {
  const options = {};
  const valueOptions = new Map([
    ["--platform", "platform"],
    ["--date", "date"],
    ["--repetition", "repetition"],
    ["--interface", "interfaceOrProduct"],
    ["--model", "modelOrIndex"],
    ["--web-search", "webSearchEnabled"],
    ["--location", "location"],
    ["--personalization", "personalizationState"],
    ["--reviewer", "reviewer"],
    ["--out-dir", "outDirectory"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    const optionName = valueOptions.get(argument);
    if (!optionName) throw new Error(`Unknown argument: ${argument}`);
    if (argv[index + 1] === undefined || argv[index + 1].startsWith("--")) {
      throw new Error(`${argument} requires a value`);
    }
    options[optionName] = argv[++index];
  }

  return options;
}

function usage() {
  return `Usage:
  node scripts/seo-evidence/create-citation-benchmark-run.mjs \\
    --platform <google|bing|perplexity|chatgpt|claude> \\
    --date <YYYY-MM-DD> [--repetition <positive integer>] [options]

Options:
  --interface <name>        Exact interface or product used
  --model <name>            Visible model/index, or not_recorded
  --web-search <status>     yes, no, or not_recorded
  --location <name>         Observed location, or not_recorded
  --personalization <name>  Observed session/personalization state
  --reviewer <name>         Human reviewer recorded in each row
  --out-dir <path>          Base output directory
  --help                    Show this help

The output name is deterministic: <out-dir>/<date>/citation-benchmark-<platform>-<date>-rN.csv.
The file is created exclusively and an existing run is never overwritten. Generated rows
are planning rows (planned_not_run), not observations.
`;
}

export function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(usage());
    return null;
  }
  const result = createCitationBenchmarkRun(options);
  process.stdout.write(
    `Created ${result.outputPath} (${result.rows.length} planned rows; no observations inferred)\n`,
  );
  return result;
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`citation benchmark run creation failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
