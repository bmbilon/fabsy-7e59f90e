type JsonRecord = Record<string, unknown>;

interface PdfLine {
  text: string;
  size: number;
  bold: boolean;
  color: string;
  gapAfter: number;
  indent: number;
}

interface PlacedLine extends PdfLine {
  y: number;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 48;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function ascii(value: unknown) {
  return String(value ?? "")
    .replaceAll("\u2013", "-")
    .replaceAll("\u2014", "-")
    .replaceAll("\u2018", "'")
    .replaceAll("\u2019", "'")
    .replaceAll("\u201c", '"')
    .replaceAll("\u201d", '"')
    .replaceAll("\u2022", "-")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pdfString(value: unknown) {
  return ascii(value).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function formatMoney(cents: unknown) {
  const numeric = Number(cents);
  if (!Number.isFinite(numeric)) return "Unavailable";
  return `$${Math.round(numeric / 100).toLocaleString("en-CA")} CAD`;
}

function formatDate(value: unknown) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text || "Unavailable";
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${text}T12:00:00Z`));
}

function wrapText(value: string, size: number, indent = 0) {
  const maxCharacters = Math.max(24, Math.floor((PAGE_WIDTH - MARGIN * 2 - indent) / (size * 0.52)));
  const words = ascii(value).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharacters || !current) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function reportLines(report: JsonRecord): PdfLine[] {
  const lines: PdfLine[] = [];
  const add = (
    text: string,
    options: Partial<Omit<PdfLine, "text">> = {},
  ) => {
    const size = options.size || 10;
    const indent = options.indent || 0;
    for (const wrapped of wrapText(text, size, indent)) {
      lines.push({
        text: wrapped,
        size,
        bold: options.bold || false,
        color: options.color || "0.12 0.14 0.18",
        gapAfter: options.gapAfter ?? 3,
        indent,
      });
    }
  };
  const section = (title: string) => {
    lines.push({ text: title, size: 15, bold: true, color: "0.35 0.13 0.65", gapAfter: 11, indent: 0 });
  };

  const verification = record(report.verification);
  section("1. Abstract verification");
  add(`Status: ${String(verification.status || "review-required").replaceAll("-", " ")}. Convictions checked: ${verification.checkedConvictions ?? 0}. Ticket match: ${String(verification.ticketMatch || "not-checked").replaceAll("-", " ")}.`);
  for (const issue of Array.isArray(verification.issues) ? verification.issues : []) {
    add(`Review item: ${String(issue)}`, { indent: 12 });
  }

  const ticketScenario = record(report.ticketScenario);
  if (Object.keys(ticketScenario).length > 0) {
    section(String(ticketScenario.label || "Current-ticket conviction scenario"));
    add(
      `Mode: ${String(ticketScenario.mode || "unavailable")}. Status: ${String(ticketScenario.status || "review-required").replaceAll("-", " ")}.`,
      { bold: true },
    );
    if (ticketScenario.convictionClass) {
      add(`Class: ${ticketScenario.convictionClass}.`);
    }
    if (ticketScenario.assumedConvictionDate) {
      add(`${ticketScenario.status === "projected" ? "Assumed" : "Matched"} conviction date: ${formatDate(ticketScenario.assumedConvictionDate)}.`);
    }
    add(String(ticketScenario.basis || "No scenario basis was supplied."));
    add(
      ticketScenario.appliedAsAdditionalConviction
        ? "Applied as one additional conviction in the projection."
        : "Not added as another conviction in the projection.",
    );
  }

  const convictions = records(report.convictions);
  section("2. Conviction aging timeline");
  if (!convictions.length) add("No convictions were transcribed from the uploaded abstract.");
  for (const conviction of convictions) {
    add(`${conviction.offence || "Conviction"}${conviction.section ? `, section ${conviction.section}` : ""}`, { bold: true, gapAfter: 1 });
    add(`Convicted: ${formatDate(conviction.convictionDate)} | Class: ${conviction.convictionClass || "unavailable"} | Three-year exit: ${formatDate(conviction.threeYearExitDate)}`, { indent: 12 });
    if (conviction.applicableExitDate && conviction.applicableExitDate !== conviction.threeYearExitDate) {
      add(`Sourced applicable lookback exit: ${formatDate(conviction.applicableExitDate)}`, { indent: 12 });
    }
    const lookbackSource = record(conviction.applicableLookbackSource);
    if (lookbackSource.url) {
      add(`Applicable lookback source: ${lookbackSource.publisher || "Public source"}, ${lookbackSource.title || "source"}, ${lookbackSource.url}`, { indent: 12 });
    }
  }

  const estimate = record(report.estimatedThreeYearPremiumImpact);
  const range = record(estimate.range);
  section("3. Estimated premium exposure");
  if (estimate.status === "estimated" && Object.keys(range).length) {
    add(`Estimated 3-year impact range: ${formatMoney(range.minimumCents)} to ${formatMoney(range.maximumCents)}.`, { bold: true });
    add("Estimated range, not an insurance quote.", { bold: true });
  } else {
    add("A reliable estimated range is unavailable from the verified inputs.", { bold: true });
  }
  add(String(estimate.basis || "No estimate basis was supplied."));
  const baseline = record(estimate.baseline);
  if (baseline.annualPremiumCents !== undefined && baseline.annualPremiumCents !== null) {
    add(`Annual premium baseline: ${formatMoney(baseline.annualPremiumCents)} (${String(baseline.basis || "supplied baseline").replaceAll("-", " ")}).`);
  }
  for (const source of records(estimate.sources)) {
    if (source.url) add(`Estimate source: ${source.publisher || "Public source"}, ${source.title || "source"}, ${source.url}`);
  }
  const benchmark = record(report.gridBenchmark);
  add(`Public Grid benchmark: ${benchmark.status === "calculated" ? `${formatMoney(benchmark.annualPremiumCents)} annually` : String(benchmark.status || "unavailable").replaceAll("-", " ")}. ${benchmark.basis || ""}`);
  const gridSource = record(benchmark.source);
  if (gridSource.url) add(`Grid source: ${gridSource.publisher || "Public source"}, ${gridSource.title || "source"}, ${gridSource.url}`);
  for (const limitation of Array.isArray(benchmark.limitations) ? benchmark.limitations : []) {
    add(`Grid limitation: ${String(limitation)}`, { indent: 12 });
  }

  const callList = record(report.carrierCallList);
  const carriers = records(callList.entries);
  section("4. Carriers worth calling");
  add(String(callList.framing || "Confirm eligibility and pricing directly with each carrier or a licensed broker."));
  if (!carriers.length) add("No carrier met the current verified rule and contact criteria.");
  for (const carrier of carriers) {
    add(`${carrier.rank || ""}. ${carrier.carrierName || "Carrier"}`, { bold: true, gapAfter: 1 });
    add(String(carrier.reason || "Confirm current underwriting eligibility directly."), { indent: 12, gapAfter: 1 });
    add(`Contact: ${carrier.phone || carrier.quoteUrl || "Unavailable"}`, { indent: 12, gapAfter: 1 });
    for (const source of records(carrier.researchSources)) {
      if (source.url) {
        add(`Research source: ${source.publisher || "Public source"}, ${source.title || "source"}, ${source.url}`, { indent: 12 });
      }
    }
  }

  section("5. Renewal reminders");
  const renewals = records(report.renewalSchedule);
  if (!renewals.length) add("No policy renewal date was supplied.");
  for (const renewal of renewals) {
    const reminderDates = records(renewal.reminderDates).map((item) => formatDate(item.reminderDate));
    add(`Renewal: ${formatDate(renewal.renewalDate)}. Reminders: ${reminderDates.join(", ") || "none scheduled"}.`);
  }

  section("Important consumer research disclaimer");
  add(String(report.disclaimer || ""), { bold: true });
  return lines;
}

function layout(lines: PdfLine[]) {
  const pages: PlacedLine[][] = [[]];
  let pageIndex = 0;
  let y = 570;
  const height = (line: PdfLine) => line.size * 1.35 + line.gapAfter;
  const isSection = (line: PdfLine) => line.bold && line.size >= 15;
  const isCarrierHeading = (line: PdfLine) =>
    line.bold && line.size < 15 && /^\d+[.]\s/.test(line.text);
  const keepHeight = (lineIndex: number) => {
    const line = lines[lineIndex];
    if (isSection(line)) {
      return height(line) + (lines[lineIndex + 1] ? height(lines[lineIndex + 1]) : 0);
    }
    if (!isCarrierHeading(line)) return height(line);

    let total = height(line);
    for (let nextIndex = lineIndex + 1; nextIndex < lines.length; nextIndex += 1) {
      const next = lines[nextIndex];
      if (isSection(next) || isCarrierHeading(next)) break;
      total += height(next);
    }
    return total;
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (pages[pageIndex].length && y - keepHeight(lineIndex) < 60) {
      pages.push([]);
      pageIndex += 1;
      y = 730;
    }
    const lineHeight = height(line);
    if (y - lineHeight < 60) {
      pages.push([]);
      pageIndex += 1;
      y = 730;
    }
    pages[pageIndex].push({ ...line, y });
    y -= lineHeight;
  }
  return pages;
}

function contentStream(lines: PlacedLine[], pageIndex: number, pageCount: number, clientName: string, reportDate: string) {
  const commands: string[] = [];
  if (pageIndex === 0) {
    commands.push("0.07 0.09 0.15 rg 0 616 612 176 re f");
    commands.push(`BT /F2 12 Tf 0.77 0.56 0.96 rg 48 742 Td (FABSY) Tj ET`);
    commands.push(`BT /F2 25 Tf 1 1 1 rg 48 702 Td (Insurance Damage Report) Tj ET`);
    commands.push(`BT /F1 13 Tf 0.88 0.90 0.94 rg 48 671 Td (${pdfString(clientName)}) Tj ET`);
    commands.push(`BT /F1 10 Tf 0.72 0.75 0.80 rg 48 648 Td (Prepared ${pdfString(formatDate(reportDate))}) Tj ET`);
  }
  for (const line of lines) {
    commands.push(`BT /${line.bold ? "F2" : "F1"} ${line.size} Tf ${line.color} rg ${MARGIN + line.indent} ${line.y.toFixed(1)} Td (${pdfString(line.text)}) Tj ET`);
  }
  commands.push("0.75 0.77 0.81 RG 0.5 w 48 42 m 564 42 l S");
  commands.push(`BT /F1 8 Tf 0.40 0.43 0.48 rg 48 26 Td (Fabsy IDR | Page ${pageIndex + 1} of ${pageCount}) Tj ET`);
  return commands.join("\n");
}

export function buildIdrPdf(report: JsonRecord, clientName: string) {
  const pages = layout(reportLines(report));
  const objects: string[] = ["", "", "", "", ""];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  const pageIds: number[] = [];
  pages.forEach((pageLines, index) => {
    const pageId = objects.length;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    const stream = contentStream(pageLines, index, pages.length, clientName, String(report.asOfDate || ""));
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`);
  });
  objects[2] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;

  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = new TextEncoder().encode(output).length;
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = new TextEncoder().encode(output).length;
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(output);
}
