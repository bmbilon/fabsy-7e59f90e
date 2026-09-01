#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildCitationBenchmarkRun,
  createCitationBenchmarkRun,
} from "./create-citation-benchmark-run.mjs";
import { parseCsv } from "./score-content-consolidation.mjs";

const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "fabsy-citation-benchmark-"),
);

try {
  const first = createCitationBenchmarkRun({
    platform: "perplexity",
    date: "2026-09-30",
    repetition: 1,
    modelOrIndex: "not disclosed",
    location: "Alberta, Canada",
    personalizationState: "anonymous-incognito",
    reviewer: "test reviewer",
    outDirectory: temporaryDirectory,
  });

  assert.equal(
    first.outputPath,
    path.join(
      temporaryDirectory,
      "2026-09-30",
      "citation-benchmark-perplexity-2026-09-30-r1.csv",
    ),
  );
  const parsed = parseCsv(fs.readFileSync(first.outputPath, "utf8"));
  assert.equal(parsed.records.length, 30);
  assert.deepEqual(
    parsed.records.map((row) => row.benchmark_id),
    Array.from({ length: 30 }, (_, index) => `B${String(index + 1).padStart(3, "0")}`),
  );
  assert.ok(parsed.records.every((row) => row.run_id === "perplexity-2026-09-30-r1"));
  assert.ok(parsed.records.every((row) => row.run_date === "2026-09-30"));
  assert.ok(parsed.records.every((row) => row.observation_status === "planned_not_run"));
  assert.ok(parsed.records.every((row) => row.fabsy_cited === "not_recorded"));
  assert.ok(parsed.records.every((row) => row.answer_factually_safe === "not_reviewed"));

  const firstBytes = fs.readFileSync(first.outputPath);
  assert.throws(
    () =>
      createCitationBenchmarkRun({
        platform: "perplexity",
        date: "2026-09-30",
        repetition: 1,
        outDirectory: temporaryDirectory,
      }),
    /Refusing to overwrite existing benchmark artifact/,
  );
  assert.deepEqual(fs.readFileSync(first.outputPath), firstBytes);

  const second = createCitationBenchmarkRun({
    platform: "perplexity",
    date: "2026-09-30",
    repetition: 2,
    outDirectory: temporaryDirectory,
  });
  assert.notEqual(second.outputPath, first.outputPath);
  assert.ok(fs.existsSync(second.outputPath));

  assert.throws(
    () => buildCitationBenchmarkRun({ platform: "unknown", date: "2026-09-30" }),
    /--platform must be one of/,
  );
  assert.throws(
    () => buildCitationBenchmarkRun({ platform: "google", date: "2026-02-30" }),
    /real calendar date/,
  );
  assert.throws(
    () =>
      buildCitationBenchmarkRun({
        platform: "google",
        date: "2026-09-30",
        repetition: 0,
      }),
    /positive integer/,
  );
  assert.throws(
    () =>
      buildCitationBenchmarkRun({
        platform: "google",
        date: "2026-09-30",
        webSearchEnabled: "sometimes",
      }),
    /yes, no, or not_recorded/,
  );

  process.stdout.write(
    "citation benchmark run generator tests passed (30 planned rows; exclusive writes verified)\n",
  );
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
