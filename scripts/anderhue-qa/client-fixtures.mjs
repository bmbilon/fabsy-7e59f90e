// Playwright fixtures and QA flow for the AnderHue client app (/start and /files).
//
// Everything runs against local fixtures: the three function endpoints
// (ltb-intake, practice-intake, practice-portal), the signed storage upload and
// download URLs on the supabase.co host, and Google Fonts (served from a local
// copy when AH_QA_FONTS_DIR exists, otherwise an empty stylesheet). Nothing
// reaches Supabase, sends email or touches real files.
//
// Exports (for scripts/verify-anderhue-browser.mjs or any other runner):
//   launchChromium(options)            chromium.launch with a fallback to locally installed builds
//   createFixtureFiles(dir)            small PNG and PDF documents plus invalid ones, as Playwright file payloads
//   mockClientApi(context, options)    routes and records every request; returns a controller
//   FIXTURE_TOKENS, FIXTURE_IDS        portal tokens (multi, single, expired) and file ids
//   portalUrl(origin, path, token)     /files...#t=token
//   trackConsole(page)                 console and page errors, with per-scenario allowances
//   runClientQa({ browser, origin, screenshotDir })   the full flow, both viewports, with assertions
//
// Run directly against a build:
//   node scripts/anderhue-qa/client-fixtures.mjs [buildDir] [screenshotDir]
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { chromium } from 'playwright';
import { startAnderhueServer } from './serve.mjs';
import { makePdf } from './pdf.mjs';
export { makePdf } from './pdf.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const siteConfig = JSON.parse(readFileSync(path.join(here, '../../ontario/anderhue-paralegal-site/site-config.json'), 'utf8'));
export const SUPABASE_ORIGIN = siteConfig.supabaseUrl;
export const ANON_KEY = siteConfig.supabaseAnonKey;
export const PRACTICE_ID = siteConfig.practiceId;
const DEFAULT_FONTS_DIR = process.env.AH_QA_FONTS_DIR || '/tmp/claude-0/ah-client-fonts/files';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXTENSIONS = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

/** Launches headless Chromium; falls back to builds under PLAYWRIGHT_BROWSERS_PATH when the pinned one is missing. */
export async function launchChromium(options = {}) {
  try {
    return await chromium.launch({ headless: true, ...options });
  } catch (error) {
    const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    const candidates = [
      process.env.AH_QA_CHROMIUM,
      ...['chromium_headless_shell-1194', 'chromium_headless_shell-1193'].map(dir => path.join(root, dir, 'chrome-linux/headless_shell')),
      path.join(root, 'chromium'),
    ].filter(Boolean);
    for (const executablePath of candidates) {
      if (existsSync(executablePath)) return chromium.launch({ headless: true, ...options, executablePath });
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Fixture documents
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

/** Minimal RGB PNG encoder; `paint(x, y)` returns [r, g, b]. */
export function makePng(width, height, paint) {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const offset = y * stride + 1 + x * 3;
      raw[offset] = r; raw[offset + 1] = g; raw[offset + 2] = b;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A ticket-like photo: pale card, dark header band, boxed fields and text lines. */
function ticketPhoto(accent) {
  return makePng(480, 300, (x, y) => {
    if (x < 6 || y < 6 || x > 473 || y > 293) return [120, 112, 104];
    if (y < 52) return accent;
    const inBox = (x > 24 && x < 228 && y > 76 && y < 132) || (x > 252 && x < 456 && y > 76 && y < 132) || (x > 24 && x < 456 && y > 156 && y < 262);
    const border = inBox && (x % 204 < 2 || y === 77 || y === 131 || y === 157 || y === 261);
    if (border) return [70, 78, 92];
    if (inBox && (y % 18 < 3) && x % 120 < 96) return [64, 64, 72];
    return [242, 239, 228];
  });
}

/** A ledger page: paper, ruled lines, a header and short text bars. */
function ledgerPhoto() {
  return makePng(360, 480, (x, y) => {
    if (y > 40 && y < 64 && x > 28 && x < 230) return [46, 40, 60];
    if (y > 90 && y % 28 === 0) return [196, 204, 220];
    if (y > 96 && y % 28 > 8 && y % 28 < 15 && x > 32 && x < 32 + ((y * 37) % 200) + 60) return [88, 84, 96];
    if (x === 250 && y > 90) return [210, 120, 120];
    return [250, 248, 242];
  });
}

/**
 * Writes fixture documents to `dir` and returns Playwright file payloads
 * ({ name, mimeType, buffer }) with their paths.
 */
export function createFixtureFiles(dir) {
  mkdirSync(dir, { recursive: true });
  const files = {
    leasePdf: { name: 'Lease - 41 Elm Street.pdf', mimeType: 'application/pdf', buffer: makePdf('Residential Tenancy Agreement', ['Landlord: Example Holdings Inc.', 'Tenant: Sample Tenant', 'Rent: $2,400 per month, due on the 1st', 'Unit: 41 Elm Street, Unit 3, Hamilton ON']) },
    ledgerPng: { name: 'rent-ledger.png', mimeType: 'image/png', buffer: ledgerPhoto() },
    ticketFront: { name: 'ticket-front.png', mimeType: 'image/png', buffer: ticketPhoto([43, 58, 85]) },
    ticketBackFail: { name: 'ticket-back-will-fail.png', mimeType: 'image/png', buffer: ticketPhoto([92, 60, 40]) },
    // Empty type: exercises the extension fallback (and the thumbnail fallback, since this is not a real HEIC).
    noticeHeic: { name: 'n4-notice.heic', mimeType: '', buffer: ledgerPhoto() },
    requestedPdf: { name: 'N4 notice and certificate of service.pdf', mimeType: 'application/pdf', buffer: makePdf('N4 Notice to End your Tenancy', ['Termination date: see page 1', 'Certificate of Service attached']) },
    bigPdf: { name: 'scan-whole-file.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(11 * 1024 * 1024, 32) },
    wordDoc: { name: 'my-notes.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('PK fixture') },
  };
  for (const file of Object.values(files)) {
    file.path = path.join(dir, file.name);
    if (file.buffer.length < 1024 * 1024) writeFileSync(file.path, file.buffer);
  }
  return files;
}

export const payload = file => ({ name: file.name, mimeType: file.mimeType, buffer: file.buffer });

// ---------------------------------------------------------------------------
// Portal fixture data
// ---------------------------------------------------------------------------

const CLIENT_ID = '5f0c6c1e-8a43-4c5e-9d0a-2b7f6f3c9a11';
const SINGLE_CLIENT_ID = '0b6d3f5a-1c2e-4f8a-9b7c-3d4e5f6a7b8c';
export const FIXTURE_IDS = {
  ltb: 'b3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  traffic: 'c4a2d3e5-6f70-4b8c-9dae-1f2a3b4c5d6e',
  general: 'd5b3e4f6-7081-4c9d-8ebf-2a3b4c5d6e7f',
  singleTraffic: 'e6c4f5a7-8192-4dae-9fc0-3b4c5d6e7f80',
};

function makeToken(clientId, iatOffsetDays, expOffsetDays) {
  const now = Math.floor(Date.now() / 1000);
  const iat = now + iatOffsetDays * 86400;
  const exp = now + expOffsetDays * 86400;
  return `ahp1.${clientId}.${iat}.${exp}.${randomBytes(32).toString('base64url')}`;
}

export const FIXTURE_TOKENS = {
  multi: makeToken(CLIENT_ID, -1, 29),
  /** A newer link for the same client as `multi`. */
  multiRenewed: makeToken(CLIENT_ID, 0, 30),
  single: makeToken(SINGLE_CLIENT_ID, -2, 28),
  expired: makeToken(CLIENT_ID, -45, -14),
};

export function portalUrl(origin, pathname = '/files', token = FIXTURE_TOKENS.multi) {
  return `${origin}${pathname}${token ? `#t=${token}` : ''}`;
}

function isoDays(days) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return new Date(Date.parse(`${today}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

function isoAgo(days, hour = 15, minute = 0) {
  const date = new Date(Date.now() - days * 86400000);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

const PRACTICE = {
  name: 'AnderHue Paralegal Professional Corporation',
  displayName: 'AnderHue Paralegal',
  phone: '(289) 985-0166',
  publicEmail: 'hello@anderhue.ca',
  siteUrl: 'https://anderhue.ca',
};

function doc(name, contentType, sizeBytes, uploadedAt, from, kindLabel) {
  return { id: randomUUID(), name, contentType, sizeBytes, uploadedAt, from, kindLabel };
}

function createPortalState() {
  const files = {
    [FIXTURE_IDS.ltb]: {
      owner: CLIENT_ID,
      file: {
        area: 'ltb', id: FIXTURE_IDS.ltb, number: 'LTB-2026-0042', title: 'Unpaid rent', areaLabel: 'Landlord and Tenant Board file',
        stage: 'under_review', stageLabel: 'Under review', phase: 'received', closed: false, outcomeLabel: null,
        clientNext: 'Don is reviewing your documents and dates. If anything is missing, we will ask for it here.',
        createdAt: isoAgo(3, 14, 12), updatedAt: isoAgo(1, 19, 40),
        keyDates: [{ label: 'Earliest termination date', date: isoDays(6) }, { label: 'Hearing date', date: isoDays(42) }],
        request: { message: 'Please upload the N4 notice you served, both pages, and the certificate of service. A clear photo of each page is fine.', at: isoAgo(1, 19, 40), answered: false },
        documents: [
          doc('Lease - 41 Elm Street.pdf', 'application/pdf', 482113, isoAgo(3, 14, 13), 'you', 'Lease'),
          doc('rent-ledger-2026.png', 'image/png', 913204, isoAgo(3, 14, 13), 'you', 'Rent ledger'),
          doc('Fee quote and next steps.pdf', 'application/pdf', 120332, isoAgo(1, 19, 41), 'practice', 'Other'),
        ],
        history: [
          { at: isoAgo(3, 14, 12), label: 'File opened' },
          { at: isoAgo(3, 14, 13), label: 'You added 2 documents' },
          { at: isoAgo(2, 15, 5), label: 'Under review' },
          { at: isoAgo(1, 19, 40), label: 'Documents requested' },
          { at: isoAgo(1, 19, 41), label: 'New document from the practice' },
        ],
        canUpload: true, limits: { maxFiles: 6, maxBytes: 10 * 1024 * 1024 },
      },
    },
    [FIXTURE_IDS.traffic]: {
      owner: CLIENT_ID,
      file: {
        area: 'traffic', id: FIXTURE_IDS.traffic, number: 'TKT-2026-0117', title: 'Speeding', areaLabel: 'Traffic ticket',
        stage: 'quoted', stageLabel: 'Options and fee ready', phase: 'engaged', closed: false, outcomeLabel: null,
        clientNext: 'Your fee quote is ready. Reply to this email or call to go ahead, and we will send your written retainer. No work starts before it is signed.',
        createdAt: isoAgo(6, 13, 2), updatedAt: isoAgo(0, 13, 30),
        keyDates: [{ label: 'Response deadline (estimate)', date: isoDays(9) }, { label: 'Offence date', date: isoDays(-6) }],
        request: null,
        documents: [
          doc('ticket-front.jpg', 'image/jpeg', 1832210, isoAgo(6, 13, 3), 'you', 'Ticket'),
          doc('ticket-back.jpg', 'image/jpeg', 1610552, isoAgo(6, 13, 3), 'you', 'Ticket'),
          doc('Your options and fee.pdf', 'application/pdf', 88211, isoAgo(0, 13, 30), 'practice', 'Correspondence'),
        ],
        history: [
          { at: isoAgo(6, 13, 2), label: 'File opened' },
          { at: isoAgo(6, 13, 3), label: 'You added 2 documents' },
          { at: isoAgo(4, 16, 20), label: 'Under review' },
          { at: isoAgo(0, 13, 30), label: 'Options and fee ready' },
        ],
        canUpload: true, limits: { maxFiles: 6, maxBytes: 10 * 1024 * 1024 },
      },
    },
    [FIXTURE_IDS.general]: {
      owner: CLIENT_ID,
      file: {
        area: 'general', id: FIXTURE_IDS.general, number: 'MAT-2026-0008', title: 'Small Claims Court', areaLabel: 'Paralegal matter',
        stage: 'closed', stageLabel: 'File closed', phase: 'done', closed: true, outcomeLabel: 'Settled',
        clientNext: 'Your file is closed. Thank you for trusting us with it.',
        createdAt: isoAgo(80, 15, 0), updatedAt: isoAgo(12, 17, 45),
        keyDates: [{ label: 'Deadline', date: isoDays(-20) }],
        request: null,
        documents: [
          doc('Plaintiff claim.pdf', 'application/pdf', 302114, isoAgo(80, 15, 2), 'you', 'Notice or claim'),
          doc('Signed settlement.pdf', 'application/pdf', 204551, isoAgo(12, 17, 40), 'practice', 'Court or tribunal document'),
        ],
        history: [
          { at: isoAgo(80, 15, 0), label: 'File opened' },
          { at: isoAgo(70, 10, 0), label: 'Retained' },
          { at: isoAgo(12, 17, 45), label: 'File closed' },
        ],
        canUpload: false, limits: { maxFiles: 6, maxBytes: 10 * 1024 * 1024 },
      },
    },
    [FIXTURE_IDS.singleTraffic]: {
      owner: SINGLE_CLIENT_ID,
      file: {
        area: 'traffic', id: FIXTURE_IDS.singleTraffic, number: 'TKT-2026-0120', title: 'Handheld device / distracted', areaLabel: 'Traffic ticket',
        stage: 'new_intake', stageLabel: 'Ticket received', phase: 'received', closed: false, outcomeLabel: null,
        clientNext: 'We have your ticket. Don will review it and reply with your options and the fee.',
        createdAt: isoAgo(0, 12, 5), updatedAt: isoAgo(0, 12, 5),
        keyDates: [{ label: 'Response deadline (estimate)', date: isoDays(13) }],
        request: null,
        documents: [doc('IMG_2041.jpg', 'image/jpeg', 2210331, isoAgo(0, 12, 6), 'you', null)],
        history: [{ at: isoAgo(0, 12, 5), label: 'File opened' }, { at: isoAgo(0, 12, 6), label: 'You added 1 document' }],
        canUpload: true, limits: { maxFiles: 6, maxBytes: 10 * 1024 * 1024 },
      },
    },
  };
  const clients = {
    [CLIENT_ID]: { firstName: 'Priya', displayName: 'Priya Sharma', email: 'priya.sharma@example.com' },
    [SINGLE_CLIENT_ID]: { firstName: 'Marc', displayName: 'Marc Tremblay', email: 'marc.tremblay@example.com' },
  };
  return { files, clients };
}

function summary(file) {
  const { area, id, number, title, stage, stageLabel, phase, closed, updatedAt, createdAt } = file;
  return { area, id, number, title, stage, stageLabel, phase, closed, requestOpen: Boolean(file.request && !file.request.answered), updatedAt, createdAt };
}

// ---------------------------------------------------------------------------
// Network mocks
// ---------------------------------------------------------------------------

function corsHeaders(request) {
  return {
    'access-control-allow-origin': request.headers().origin || '*',
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-upsert',
    'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
    vary: 'Origin',
  };
}

function fulfillJson(route, body, status = 200) {
  return route.fulfill({
    status, contentType: 'application/json',
    headers: { ...corsHeaders(route.request()), 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  });
}

function fontCss(fontsDir) {
  const face = (family, file, weight, format = 'woff2') => existsSync(path.join(fontsDir, file))
    ? `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(https://fonts.gstatic.com/s/qa/${file}) format('${format}');}`
    : '';
  return [
    face('Newsreader', 'newsreader-latin-opsz-normal.woff2', '200 800', 'woff2-variations'),
    ...[400, 500, 600, 700].map(weight => face('Public Sans', `public-sans-latin-${weight}-normal.woff2`, weight)),
    ...[400, 500].map(weight => face('IBM Plex Mono', `ibm-plex-mono-latin-${weight}-normal.woff2`, weight)),
  ].join('\n');
}

/**
 * Routes the client app's network and records it. Options:
 *   uploadDelayMs   time each signed upload takes (default 900) so progress is visible
 *   failUploads     RegExp on the original file name; matching uploads fail with 500 every time
 *   fontsDir        local woff2 files for Google Fonts (empty stylesheet when missing)
 *   simulateProgress  emit XHR upload progress paced to uploadDelayMs (default true); intercepted
 *                   requests report none, so without it every bar would jump from 0 to done
 * The returned controller exposes `requests`, `uploads`, `downloads`, `unexpected`,
 * `queue(name, response)` to force the next response of a function ({status, body},
 * or 'abort' for a network failure), and `actions(name, action)`.
 */
export async function mockClientApi(context, options = {}) {
  const settings = { uploadDelayMs: 900, failUploads: /will-fail/i, fontsDir: DEFAULT_FONTS_DIR, ...options };
  const portalState = createPortalState();
  const controller = {
    requests: [],
    uploads: [],
    downloads: [],
    unexpected: [],
    intakes: new Map(),
    targets: new Map(),
    stored: new Set(),
    next: { 'ltb-intake': [], 'practice-intake': [], 'practice-portal': [] },
    portal: portalState,
    counters: { ltb: 43, traffic: 118, general: 9 },
    queue(name, response) { this.next[name].push(response); },
    actions(name, action) { return this.requests.filter(entry => entry.name === name && (!action || entry.action === action)); },
  };

  const createTargets = (bucket, ownerId, files, extra = {}) => (files || []).map((file, index) => {
    const documentId = randomUUID();
    const extension = EXTENSIONS[file.contentType] || 'bin';
    const objectPath = `${ownerId}/${documentId}.${extension}`;
    const key = `${bucket}/${objectPath}`;
    controller.targets.set(key, { documentId, name: file.name, spec: file, fail: settings.failUploads?.test(file.name) || false, stored: false, ...extra });
    const signedUrl = `${SUPABASE_ORIGIN}/storage/v1/object/upload/sign/${key}?token=${randomBytes(24).toString('base64url')}`;
    return { documentId, index, path: objectPath, signedUrl, contentType: file.contentType };
  });

  const checkFiles = files => {
    if (!Array.isArray(files) || files.length > 6) return 'Attach up to 6 files.';
    for (const file of files) {
      if (!EXTENSIONS[file?.contentType] || !Number.isInteger(file.size) || file.size <= 0 || file.size > 10 * 1024 * 1024) {
        return 'Attach photos or PDFs, 10 MB or smaller each.';
      }
    }
    return null;
  };

  const intakeAction = (name, body) => {
    const area = name === 'ltb-intake' ? 'ltb' : body.area;
    if (body.action === 'submit') {
      const invalid = [];
      if (!String(body.name || '').trim()) invalid.push('name');
      if (!EMAIL.test(String(body.email || '').trim())) invalid.push('email');
      const digits = String(body.phone || '').replace(/\D/g, '');
      if (body.phone && (digits.length < 7 || digits.length > 15)) invalid.push('phone');
      if (area === 'general' && String(body.notes || '').trim().length < 10) invalid.push('notes');
      if (area === 'traffic' && body.ticketReceivedOn && !/^\d{4}-\d{2}-\d{2}$/.test(body.ticketReceivedOn)) invalid.push('ticketReceivedOn');
      if (name === 'practice-intake' && area !== 'traffic' && area !== 'general') return [400, { error: 'Unknown practice area.' }];
      if (invalid.length) return [422, { error: `Check these fields: ${invalid.join(', ')}.` }];
      const fileProblem = checkFiles(body.files || []);
      if (fileProblem) return [400, { error: fileProblem }];
      if (String(body.company || '') !== '' || !(Number(body.elapsedMs) >= 2500)) {
        return [200, area === 'ltb'
          ? { ok: true, caseId: null, caseNumber: null, intakeToken: null, uploads: [] }
          : { ok: true, matterId: null, matterNumber: null, intakeToken: null, uploads: [] }];
      }
      const id = randomUUID();
      const intakeToken = randomBytes(32).toString('hex');
      const prefix = { ltb: 'LTB', traffic: 'TKT', general: 'MAT' }[area];
      const number = `${prefix}-2026-${String(controller.counters[area]++).padStart(4, '0')}`;
      const uploads = createTargets(area === 'ltb' ? 'ltb-documents' : 'practice-documents', id, body.files);
      controller.intakes.set(id, { area, intakeToken, number, uploads, finalized: null });
      return [200, area === 'ltb'
        ? { ok: true, caseId: id, caseNumber: number, intakeToken, uploads }
        : { ok: true, matterId: id, matterNumber: number, intakeToken, uploads }];
    }
    if (body.action === 'finalize') {
      const id = name === 'ltb-intake' ? body.caseId : body.matterId;
      const intake = controller.intakes.get(id);
      if (!intake || intake.intakeToken !== body.intakeToken) return [403, { error: 'File authorization is invalid.' }];
      const claimed = Array.isArray(body.uploaded) ? body.uploaded : [];
      intake.finalized = claimed;
      return [200, { ok: true, received: claimed.filter(documentId => controller.stored.has(documentId)).length }];
    }
    return [400, { error: 'Unknown intake action.' }];
  };

  const ownerOf = token => {
    if (typeof token !== 'string' || !token.startsWith('ahp1.')) return null;
    const [, clientId, , exp] = token.split('.');
    if (!(Number(exp) * 1000 > Date.now())) return null;
    return portalState.clients[clientId] ? clientId : null;
  };

  const portalAction = body => {
    const expired = { error: 'This link has expired. Enter your email and we will send a fresh one.' };
    if (body.action === 'request_link') {
      if (!EMAIL.test(String(body.email || '').trim())) return [422, { error: 'Enter a valid email address.' }];
      return [200, { ok: true }];
    }
    const owner = ownerOf(body.token);
    if (!owner) return [401, expired];
    const mine = Object.values(portalState.files).filter(entry => entry.owner === owner).map(entry => entry.file);
    if (body.action === 'session') {
      const [, , , exp] = body.token.split('.');
      const files = [...mine].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).map(summary);
      return [200, { ok: true, client: portalState.clients[owner], practice: PRACTICE, files, expiresAt: new Date(Number(exp) * 1000).toISOString() }];
    }
    const entry = portalState.files[body.id];
    if (!entry || entry.owner !== owner || entry.file.area !== body.area) return [404, { error: 'We could not find that file.' }];
    const file = entry.file;
    if (body.action === 'file') return [200, { ok: true, file }];
    if (body.action === 'download') {
      const document = file.documents.find(item => item.id === body.documentId);
      if (!document) return [404, { error: 'We could not find that document.' }];
      const bucket = file.area === 'ltb' ? 'ltb-documents' : 'practice-documents';
      const url = settings.downloadOrigin
        ? `${settings.downloadOrigin}/__qa__/download.pdf?name=${encodeURIComponent(document.name)}`
        : `${SUPABASE_ORIGIN}/storage/v1/object/sign/${bucket}/${file.id}/${document.id}.${EXTENSIONS[document.contentType] || 'bin'}?token=${randomBytes(24).toString('base64url')}&download=${encodeURIComponent(document.name)}`;
      return [200, { ok: true, url, name: document.name }];
    }
    if (body.action === 'prepare_upload') {
      if (!file.canUpload) return [409, { error: 'This file is closed.' }];
      const problem = checkFiles(body.files);
      if (problem) return [422, { error: problem }];
      const uploads = createTargets(file.area === 'ltb' ? 'ltb-documents' : 'practice-documents', file.id, body.files, { fileId: file.id })
        .map(({ documentId, index, signedUrl, contentType }) => ({ documentId, index, signedUrl, contentType }));
      return [200, { ok: true, uploads }];
    }
    if (body.action === 'confirm_upload') {
      const ids = Array.isArray(body.documentIds) ? body.documentIds : [];
      const arrived = [...controller.targets.values()].filter(target => ids.includes(target.documentId) && target.stored && target.fileId === file.id);
      const now = new Date().toISOString();
      for (const target of arrived) {
        file.documents.push({ id: target.documentId, name: target.name, contentType: target.spec?.contentType || 'application/pdf', sizeBytes: target.spec?.size || 0, uploadedAt: now, from: 'you', kindLabel: null });
      }
      if (arrived.length) {
        file.history.push({ at: now, label: `You added ${arrived.length} document${arrived.length === 1 ? '' : 's'}` });
        if (file.request) file.request = { ...file.request, answered: true };
        file.updatedAt = now;
      }
      return [200, { ok: true, received: arrived.length }];
    }
    return [400, { error: 'Unknown portal action.' }];
  };

  // Intercepted requests never report upload progress, so the browser would only ever see 0% then done.
  // Emit progress events on the XHR paced to the mocked upload time, as a slow network would.
  if (settings.simulateProgress !== false) {
    await context.addInitScript(({ durationMs }) => {
      const open = XMLHttpRequest.prototype.open;
      const send = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
        this.__ahQaUpload = String(url).includes('/storage/v1/object/upload/sign/');
        return open.call(this, method, url, ...rest);
      };
      XMLHttpRequest.prototype.send = function patchedSend(body) {
        if (this.__ahQaUpload) {
          let total = 0;
          if (body instanceof FormData) for (const value of body.values()) total += value instanceof Blob ? value.size : String(value).length;
          const started = performance.now();
          const timer = setInterval(() => {
            if (this.readyState === 4) return clearInterval(timer);
            const fraction = Math.min(0.97, Math.pow((performance.now() - started) / durationMs, 0.85));
            this.upload.dispatchEvent(new ProgressEvent('progress', { lengthComputable: true, loaded: Math.round(total * fraction), total }));
          }, 100);
          this.addEventListener('loadend', () => clearInterval(timer));
        }
        return send.call(this, body);
      };
    }, { durationMs: settings.uploadDelayMs });
  }

  // Lowest priority: everything not matched below. Local app files pass; anything else is recorded and blocked.
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === settings.downloadOrigin && url.pathname === '/__qa__/download.pdf') {
      controller.downloads.push(url.href);
      return route.continue();
    }
    // WebKit exposes local object-URL thumbnail reads to routing; Chromium does not.
    if (url.protocol === 'blob:' && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url.origin)) return route.continue();
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    controller.unexpected.push(`${route.request().method()} ${url.href}`);
    return route.abort('blockedbyclient');
  });

  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({
    status: 200, contentType: 'text/css', headers: { 'access-control-allow-origin': '*' }, body: fontCss(settings.fontsDir),
  }));
  await context.route('https://fonts.gstatic.com/**', route => {
    const file = path.join(settings.fontsDir, path.basename(new URL(route.request().url()).pathname));
    if (!existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: readFileSync(file) });
  });

  for (const name of ['ltb-intake', 'practice-intake', 'practice-portal']) {
    await context.route(`**/functions/v1/${name}`, async route => {
      const request = route.request();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders(request) });
      let body = null;
      try { body = request.postDataJSON(); } catch { body = null; }
      controller.requests.push({ name, action: body?.action, body, headers: request.headers(), at: Date.now() });
      const forced = controller.next[name].shift();
      if (forced === 'abort') return route.abort('failed');
      if (forced) {
        if (forced.delayMs) await sleep(forced.delayMs);
        return fulfillJson(route, forced.body ?? { error: 'Forced failure.' }, forced.status ?? 500);
      }
      await sleep(250);
      const [status, response] = name === 'practice-portal' ? portalAction(body || {}) : intakeAction(name, body || {});
      return fulfillJson(route, response, status);
    });
  }

  await context.route(`${SUPABASE_ORIGIN}/storage/v1/object/upload/sign/**`, async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders(request) });
    const url = new URL(request.url());
    const key = decodeURIComponent(url.pathname.replace('/storage/v1/object/upload/sign/', ''));
    const target = controller.targets.get(key);
    const body = request.postDataBuffer();
    const record = { key, method: request.method(), headers: request.headers(), bytes: body ? body.length : 0, name: target?.name, documentId: target?.documentId, status: 0 };
    controller.uploads.push(record);
    await sleep(settings.uploadDelayMs + Math.round(Math.random() * 250));
    if (!target) {
      record.status = 400;
      return fulfillJson(route, { statusCode: '400', error: 'InvalidSignature', message: 'Invalid upload signature' }, 400);
    }
    if (target.fail) {
      record.status = 500;
      return fulfillJson(route, { statusCode: '500', error: 'internal', message: 'Simulated storage failure' }, 500);
    }
    if (target.stored) {
      record.status = 400;
      return fulfillJson(route, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' }, 400);
    }
    target.stored = true;
    controller.stored.add(target.documentId);
    record.status = 200;
    return fulfillJson(route, { Key: key }, 200);
  });

  await context.route(`${SUPABASE_ORIGIN}/storage/v1/object/sign/**`, route => {
    const request = route.request();
    const url = new URL(request.url());
    controller.downloads.push(url.href);
    const name = url.searchParams.get('download') || 'document.pdf';
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${name.replace(/"/g, '')}"` },
      body: makePdf(name, ['Fixture download']),
    });
  });

  return controller;
}

// ---------------------------------------------------------------------------
// Console tracking
// ---------------------------------------------------------------------------

/** Collects console errors and page errors. `allow(pattern)` permits expected messages (failed uploads, forced 4xx). */
export function trackConsole(page) {
  const errors = [];
  const allowed = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  return {
    errors,
    allow(pattern) { allowed.push(pattern); },
    unexpected() { return errors.filter(text => !allowed.some(pattern => pattern.test(text))); },
  };
}

// ---------------------------------------------------------------------------
// QA flow
// ---------------------------------------------------------------------------

export const VIEWPORTS = {
  mobile: { tag: 'm', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  desktop: { tag: 'd', viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
  narrow: { tag: 'n', viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true },
};

const HTTP_ERROR = /Failed to load resource: the server responded with a status of (4\d\d|5\d\d)/;
const NETWORK_ERROR = /Failed to load resource: net::ERR_FAILED/;

async function openPage(ctx, kind, mockOptions = {}) {
  const device = VIEWPORTS[kind];
  const context = await ctx.browser.newContext({
    viewport: device.viewport,
    // Firefox supports touch and narrow layouts, but not Playwright's mobile viewport emulation.
    ...(ctx.browser.browserType().name() === 'firefox' ? {} : { isMobile: device.isMobile }),
    hasTouch: device.hasTouch, deviceScaleFactor: 1,
    serviceWorkers: 'block', acceptDownloads: true, locale: 'en-CA', timezoneId: 'America/Toronto',
  });
  const api = await mockClientApi(context, { downloadOrigin: ctx.origin, ...mockOptions });
  const page = await context.newPage();
  const consoleLog = trackConsole(page);
  return {
    context, page, api, console: consoleLog, device,
    async close() {
      assert.deepEqual(consoleLog.unexpected(), [], `${kind}: unexpected console errors`);
      assert.deepEqual(api.unexpected, [], `${kind}: unexpected external requests`);
      await context.close();
    },
  };
}

async function settle(page) {
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await page.waitForTimeout(120);
}

async function checkPage(page, label) {
  const metrics = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  assert.ok(metrics.scroll <= metrics.inner, `${label}: horizontal overflow (${metrics.scroll} > ${metrics.inner})`);
  const text = await page.locator('body').innerText();
  assert.doesNotMatch(text, /\u2014/, `${label}: em dash in visible copy`);
  assert.doesNotMatch(text, /fabsy/i, `${label}: vendor name in client copy`);
  // Receipt and link emails can be held for review: no promise of when they arrive.
  assert.doesNotMatch(text, /have emailed|on its way|take a few minutes to arrive|in a few minutes\?/i, `${label}: email timing promise`);
}

// Playwright's fullPage capture drops Chromium's touch emulation (pointer: coarse turns false for the
// rest of the page's life), so tall pages are captured by growing the viewport instead.
async function capture(page, file) {
  const size = page.viewportSize();
  const height = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
  const grow = height > size.height;
  if (grow) await page.setViewportSize({ width: size.width, height: Math.min(height, 12000) });
  await page.waitForTimeout(80);
  await page.screenshot({ path: file });
  if (grow) await page.setViewportSize(size);
}

async function shot(ctx, session, name, { fold = false } = {}) {
  await settle(session.page);
  await checkPage(session.page, name);
  if (!ctx.screenshotDir) return;
  if (fold && session.device.isMobile) {
    const foldFile = path.join(ctx.screenshotDir, `${session.device.tag}-${name}-fold.png`);
    await session.page.screenshot({ path: foldFile });
    ctx.results.screenshots.push(foldFile);
  }
  const file = path.join(ctx.screenshotDir, `${session.device.tag}-${name}.png`);
  await capture(session.page, file);
  ctx.results.screenshots.push(file);
}

function expectAnonHeaders(headers, label) {
  assert.equal(headers.apikey, ANON_KEY, `${label}: apikey header`);
  assert.equal(headers.authorization, `Bearer ${ANON_KEY}`, `${label}: authorization header`);
}

const continueButton = page => page.getByRole('button', { name: /^(Continue|Skip for now)$/ });

async function landlordFlow(ctx, kind) {
  const s = await openPage(ctx, kind);
  const { page, api } = s;
  const files = ctx.fixtures;
  await page.goto(`${ctx.origin}/start`);
  await page.getByRole('heading', { name: 'What can we help with?' }).waitFor();
  assert.match(await page.title(), /Start a file \| AnderHue Paralegal/);
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex, nofollow');
  assert.ok(await page.locator('header img[src="/crest-mark.webp"]').evaluate(image => image.complete && image.naturalWidth > 0), 'crest loads');
  await shot(ctx, s, '01-start-chooser');

  await page.getByRole('link', { name: /Landlord/ }).click();
  await page.waitForURL(/\/start\?area=landlord$/);
  await page.getByRole('heading', { name: 'Add your documents' }).waitFor();
  if (s.device.hasTouch) assert.ok(await page.getByRole('button', { name: 'Take a photo' }).isVisible(), 'camera button on touch');
  else assert.equal(await page.getByRole('button', { name: 'Take a photo' }).count(), 0, 'no camera button on desktop');
  assert.equal(await page.locator('input[data-picker="camera"]').getAttribute('capture'), 'environment');
  assert.equal(await continueButton(page).innerText(), 'Skip for now');
  await shot(ctx, s, '02-ltb-documents-empty', { fold: true });

  await page.locator('input[data-picker="browse"]').setInputFiles([payload(files.leasePdf), payload(files.ledgerPng), payload(files.noticeHeic), payload(files.bigPdf), payload(files.wordDoc)]);
  await page.getByText('Some files were not added').waitFor();
  assert.equal(await page.locator('.ahc-file').count(), 3, 'three valid files kept');
  await page.locator('.ahc-alert').getByText(/scan-whole-file\.pdf is 11 MB/).waitFor();
  await page.locator('.ahc-alert').getByText(/my-notes\.docx is not a file type we can accept/).waitFor();
  await shot(ctx, s, '03-ltb-documents-files', { fold: true });
  await page.getByRole('button', { name: 'Remove n4-notice.heic' }).click();
  assert.equal(await page.locator('.ahc-file').count(), 2);
  assert.equal(await continueButton(page).innerText(), 'Continue');
  await continueButton(page).click();

  await page.waitForURL(/step=details/);
  await page.getByRole('heading', { name: 'About the tenancy' }).waitFor();
  await continueButton(page).click();
  await page.getByText('Choose the closest match.', { exact: false }).waitFor();
  await page.waitForFunction(() => document.activeElement?.id === 'f-issue');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'f-issue', 'focus moves to the first problem');
  await shot(ctx, s, '04-ltb-details-error');
  await page.getByLabel('What is the issue?').selectOption('arrears');
  await page.locator('label[for="f-served-yes"]').click();
  await page.getByLabel('Approximate rent owed').fill('2,400');
  await page.getByLabel('Rental unit city').fill('Hamilton');
  await page.getByLabel('Anything we should know?').fill('Tenant has paid nothing since August. N4 served by hand on September 22.');
  await shot(ctx, s, '05-ltb-details-filled');
  await continueButton(page).click();

  await page.waitForURL(/step=contact/);
  await page.getByLabel('Full name').fill('Dana Whitfield');
  await page.getByLabel('Email').fill('dana.whitfield@gmial.com');
  await page.getByLabel(/^Phone/).fill('905 555 0142');
  await page.getByLabel(/^Phone/).focus();
  await page.getByText('Did you mean').waitFor();
  await shot(ctx, s, '06-ltb-contact');
  await page.getByRole('button', { name: 'dana.whitfield@gmail.com' }).click();
  assert.equal(await page.getByLabel('Email').inputValue(), 'dana.whitfield@gmail.com');
  await page.getByLabel(/^Phone/).press('Enter');

  await page.waitForURL(/step=review/);
  await page.getByRole('heading', { name: 'Review and send' }).waitFor();
  await page.getByText('Sending this does not create a retainer. We reply with your next step and the fee in writing.').waitFor();
  await shot(ctx, s, '07-ltb-review', { fold: true });

  // Back and forward keep everything.
  await page.goBack();
  await page.waitForURL(/step=contact/);
  assert.equal(await page.getByLabel('Full name').inputValue(), 'Dana Whitfield');
  await page.goForward();
  await page.waitForURL(/step=review/);

  await page.getByRole('button', { name: 'Send my file' }).click();
  await page.getByRole('heading', { name: 'Sending your file' }).waitFor();
  await page.locator('.ahc-file[data-status="uploading"]').first().waitFor();
  await shot(ctx, s, '08-ltb-sending', { fold: true });
  await page.getByRole('heading', { name: 'Your file is open' }).waitFor({ timeout: 20000 });
  const number = await page.getByTestId('file-number').innerText();
  assert.match(number, /^LTB-2026-\d{4}$/);
  await page.getByText('dana.whitfield@gmail.com').waitFor();
  assert.match(await page.locator('#sent-title + p + div + p').innerText(), /^We will email a secure link to dana\.whitfield@gmail\.com so you can follow your file and add documents\.$/);
  await page.getByText('If you do not see it, check your spam or junk folder.', { exact: false }).waitFor();
  await page.getByText('We have your file. We will review your documents and reply with your next deadline and the fee that applies.').waitFor();
  await shot(ctx, s, '09-ltb-success', { fold: true });

  const [submit] = api.actions('ltb-intake', 'submit');
  assert.ok(submit, 'landlord submit sent to ltb-intake');
  expectAnonHeaders(submit.headers, 'ltb submit');
  assert.equal(submit.headers['content-type'], 'application/json');
  const sent = submit.body;
  assert.equal(sent.practiceId, PRACTICE_ID);
  assert.equal(sent.name, 'Dana Whitfield');
  assert.equal(sent.email, 'dana.whitfield@gmail.com');
  assert.equal(sent.phone, '905 555 0142');
  assert.equal(sent.city, 'Hamilton');
  assert.equal(sent.issue, 'arrears');
  assert.equal(sent.served, 'yes');
  assert.equal(sent.owed, '$2,400');
  assert.equal(sent.company, '');
  assert.ok(sent.elapsedMs >= 2500, 'elapsedMs reflects time on page');
  assert.deepEqual(sent.files.map(file => [file.name, file.contentType]), [['Lease - 41 Elm Street.pdf', 'application/pdf'], ['rent-ledger.png', 'image/png']]);
  assert.equal(api.uploads.length, 2);
  for (const upload of api.uploads) {
    assert.equal(upload.method, 'PUT');
    assert.equal(upload.headers['x-upsert'], 'false');
    expectAnonHeaders(upload.headers, 'signed upload');
    assert.match(upload.headers['content-type'], /^multipart\/form-data/);
    assert.ok(upload.key.startsWith('ltb-documents/'));
  }
  const [finalize] = api.actions('ltb-intake', 'finalize');
  assert.ok(finalize, 'finalize called');
  const intake = [...api.intakes.values()][0];
  assert.equal(finalize.body.caseId, [...api.intakes.keys()][0]);
  assert.equal(finalize.body.intakeToken, intake.intakeToken);
  assert.deepEqual(finalize.body.uploaded, intake.uploads.map(upload => upload.documentId));
  assert.equal(await page.evaluate(() => sessionStorage.getItem('anderhue.start.v1.ltb')), null, 'draft cleared');

  await page.getByRole('button', { name: 'Start another file' }).click();
  await page.waitForURL(/\/start$/);
  await s.close();
}

async function trafficFlow(ctx, kind) {
  const s = await openPage(ctx, kind, { uploadDelayMs: 1400 });
  s.console.allow(HTTP_ERROR);
  const { page, api } = s;
  await page.goto(`${ctx.origin}/start?area=traffic`);
  await page.getByRole('heading', { name: 'Add your documents' }).waitFor();
  await page.getByText('The front of the ticket').waitFor();
  await page.locator('input[data-picker="browse"]').setInputFiles([payload(ctx.fixtures.ticketFront), payload(ctx.fixtures.ticketBackFail)]);
  await continueButton(page).click();
  await page.getByLabel('What is the ticket for?').selectOption('speeding');
  const received = await page.evaluate(() => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return new Date(Date.parse(`${today}T00:00:00Z`) - 4 * 86400000).toISOString().slice(0, 10);
  });
  await page.getByLabel(/^Date you got it/).fill(received);
  await page.getByText(/Estimated response date:/).waitFor();
  await page.getByText('That is 11 days from today.', { exact: false }).waitFor();
  await page.getByLabel(/^City where it was issued/).fill('Mississauga');
  await page.getByLabel('Requested a trial').check();
  await shot(ctx, s, '10-traffic-details-estimate', { fold: true });

  // Draft survives a reload; files do not, and the page says so.
  await page.reload();
  await page.getByLabel('What is the ticket for?').waitFor();
  assert.equal(await page.getByLabel('What is the ticket for?').inputValue(), 'speeding');
  assert.equal(await page.getByLabel(/^City where it was issued/).inputValue(), 'Mississauga');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByText('files are not saved when the page reloads', { exact: false }).waitFor();
  await shot(ctx, s, '11-traffic-draft-restored');
  await page.locator('input[data-picker="browse"]').setInputFiles([payload(ctx.fixtures.ticketFront), payload(ctx.fixtures.ticketBackFail)]);
  await continueButton(page).click();
  await continueButton(page).click();
  await page.getByLabel('Full name').fill('Marc Tremblay');
  await page.getByLabel('Email').fill('marc.tremblay@example.com');
  await continueButton(page).click();
  await page.getByRole('button', { name: 'Send my file' }).click();
  await page.getByRole('heading', { name: 'Sending your file' }).waitFor();
  await page.locator('.ahc-file[data-status="uploading"]').first().waitFor();
  await page.waitForTimeout(600);
  await shot(ctx, s, '12-traffic-sending');
  await page.getByRole('heading', { name: 'Your file is open' }).waitFor({ timeout: 20000 });
  await page.getByText('One document did not upload').waitFor();
  await page.getByText('ticket-back-will-fail.png').waitFor();
  await shot(ctx, s, '13-traffic-success-partial');

  const [submit] = api.actions('practice-intake', 'submit');
  assert.equal(submit.body.area, 'traffic');
  assert.equal(submit.body.ticketType, 'speeding');
  assert.equal(submit.body.ticketReceivedOn, received);
  assert.equal(submit.body.ticketCity, 'Mississauga');
  assert.equal(submit.body.optionChosen, 'trial');
  expectAnonHeaders(submit.headers, 'practice submit');
  const failing = api.uploads.filter(upload => upload.name === 'ticket-back-will-fail.png');
  assert.equal(failing.length, 2, 'a failed upload is retried once');
  const [finalize] = api.actions('practice-intake', 'finalize');
  const front = [...api.targets.values()].find(target => target.name === 'ticket-front.png');
  assert.deepEqual(finalize.body.uploaded, [front.documentId], 'finalize lists only the uploads that arrived');
  assert.equal(finalize.body.matterId, [...api.intakes.keys()][0]);
  await s.close();
}

async function unsupportedArea(ctx, kind) {
  const s = await openPage(ctx, kind);
  for (const query of ['', '?area=other', '?area=general&step=contact', '?area=other&step=sent']) {
    await s.page.goto(`${ctx.origin}/start${query}`);
    await s.page.getByRole('heading', { name: 'What can we help with?' }).waitFor();
    const choices = s.page.getByRole('list', { name: 'Kinds of matter' });
    assert.equal(await choices.getByRole('link').count(), 2);
    assert.equal(await choices.getByRole('link', { name: /Something else|Other/ }).count(), 0);
  }
  assert.equal(s.api.actions('practice-intake', 'submit').length, 0);
  await s.close();
}

async function intakeErrors(ctx, kind) {
  const s = await openPage(ctx, kind);
  s.console.allow(HTTP_ERROR);
  s.console.allow(NETWORK_ERROR);
  // Firefox describes the deliberately aborted practice-intake request as CORS.
  s.console.allow(/Cross-Origin Request Blocked:.*\/functions\/v1\/practice-intake\. \(Reason: CORS request did not succeed\)\. Status code: \(null\)/);
  const { page, api } = s;
  await page.goto(`${ctx.origin}/start?area=traffic`);
  await continueButton(page).click();
  await page.getByLabel('What is the ticket for?').selectOption('speeding');
  await continueButton(page).click();
  await page.getByLabel('Full name').fill('Sam Ortiz');
  await page.getByLabel('Email').fill('sam.ortiz@example.com');
  await continueButton(page).click();

  api.queue('practice-intake', { status: 422, body: { error: 'Check these fields: email.' } });
  await page.getByRole('button', { name: 'Send my file' }).click();
  await page.waitForURL(/step=contact/);
  await page.getByText('We could not accept your email address. Please check and try again.').waitFor();
  await page.getByText('Check your email address.').waitFor();
  assert.equal(await page.getByLabel('Email').inputValue(), 'sam.ortiz@example.com', 'typed fields survive a 422');
  await shot(ctx, s, '17-error-422-contact');
  await continueButton(page).click();

  api.queue('practice-intake', { status: 429, body: { error: 'Too many submissions. Please try again later or call the office.' } });
  await page.getByRole('button', { name: 'Send my file' }).click();
  await page.getByText('Please wait a few minutes').waitFor();
  await page.getByRole('link', { name: '(289) 985-0166' }).first().waitFor();
  await shot(ctx, s, '18-error-429');

  api.queue('practice-intake', { status: 403, body: { error: 'Origin not allowed.' } });
  await page.getByRole('button', { name: 'Send my file' }).click();
  await page.getByText('We can open your file for you instead.', { exact: false }).waitFor();

  api.queue('practice-intake', 'abort');
  await page.getByRole('button', { name: 'Send my file' }).click();
  await page.getByText('We could not reach our server.', { exact: false }).waitFor();
  await shot(ctx, s, '19-error-network');
  await page.getByRole('button', { name: 'Send my file' }).click();
  await page.getByRole('heading', { name: 'Your file is open' }).waitFor({ timeout: 20000 });
  assert.equal(api.actions('practice-intake', 'submit').length, 5);
  await s.close();
}

async function portalSignIn(ctx, kind) {
  const s = await openPage(ctx, kind);
  s.console.allow(HTTP_ERROR);
  const { page, api } = s;
  await page.goto(`${ctx.origin}/files`);
  await page.getByRole('heading', { name: 'Open your file' }).waitFor();
  assert.match(await page.title(), /Open your file \| AnderHue Paralegal/);
  await shot(ctx, s, '20-portal-signin');
  await page.getByRole('button', { name: 'Email me a secure link' }).click();
  await page.getByText('Enter the email address you used for your file.').waitFor();
  await page.getByLabel('Email').fill('priya.sharma@example');
  await page.getByRole('button', { name: 'Email me a secure link' }).click();
  await page.getByText('Enter an email address like name@example.com.').waitFor();
  await shot(ctx, s, '21-portal-signin-error');
  await page.getByLabel('Email').fill('priya.sharma@example.com');
  await page.getByRole('button', { name: 'Email me a secure link' }).click();
  await page.getByRole('heading', { name: 'Check your email' }).waitFor();
  await page.getByRole('button', { name: /Resend link in \d:\d\d/ }).waitFor();
  assert.ok(await page.getByRole('button', { name: /Resend link in/ }).isDisabled());
  await shot(ctx, s, '22-portal-check-email');
  const [link] = api.actions('practice-portal', 'request_link');
  assert.equal(link.body.practiceId, PRACTICE_ID);
  assert.equal(link.body.email, 'priya.sharma@example.com');
  assert.equal(link.body.company, '');
  assert.ok(link.body.elapsedMs >= 2500);
  expectAnonHeaders(link.headers, 'request_link');

  // Expired link: 401 clears the token and asks for a fresh link.
  await page.goto(portalUrl(ctx.origin, '/files', FIXTURE_TOKENS.expired));
  await page.getByText('That link has expired. Enter your email and we will send a fresh one.').waitFor();
  assert.equal(new URL(page.url()).hash, '', 'token removed from the address bar');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('anderhue.portal.v1')), null, '401 clears the session token');
  assert.equal(await page.evaluate(() => localStorage.getItem('anderhue.portal.v1')), null);
  await shot(ctx, s, '23-portal-expired');
  await s.close();
}

async function portalFiles(ctx, kind) {
  const s = await openPage(ctx, kind, { uploadDelayMs: 1300 });
  const { page, api } = s;
  await page.goto(portalUrl(ctx.origin, '/files', FIXTURE_TOKENS.multi));
  await page.getByRole('heading', { name: 'Hello, Priya' }).waitFor();
  assert.equal(new URL(page.url()).hash, '', 'token removed from the address bar');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('anderhue.portal.v1')), FIXTURE_TOKENS.multi);
  assert.equal(await page.evaluate(() => localStorage.getItem('anderhue.portal.v1')), null, 'not remembered by default');
  assert.equal(await page.locator('.ahc-filecard').count(), 3);
  await page.getByText('Action needed').first().waitFor();
  await shot(ctx, s, '24-portal-list', { fold: true });

  await page.getByRole('link', { name: /LTB-2026-0042/ }).click();
  await page.waitForURL(new RegExp(`/files/ltb/${FIXTURE_IDS.ltb}$`));
  await page.getByRole('heading', { name: 'We need a document from you' }).waitFor();
  await page.getByText('Please upload the N4 notice you served', { exact: false }).waitFor();
  assert.ok(await page.getByRole('link', { name: 'All files' }).isVisible());
  assert.match(await page.locator('li[aria-current="step"]').first().innerText(), /^Received/);
  await shot(ctx, s, '25-portal-detail-request', { fold: true });

  // Download: download action, then the browser follows the signed URL.
  const downloadEvent = page.waitForEvent('download').catch(error => {
    throw new Error(`${error.message}\nURL: ${page.url()}\nDownloads: ${JSON.stringify(api.downloads)}\nConsole: ${JSON.stringify(s.console.unexpected())}`);
  });
  await page.getByRole('button', { name: 'Download Fee quote and next steps.pdf' }).click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), 'Fee quote and next steps.pdf');
  const [downloadCall] = api.actions('practice-portal', 'download');
  assert.equal(downloadCall.body.area, 'ltb');
  assert.equal(downloadCall.body.id, FIXTURE_IDS.ltb);
  assert.equal(api.downloads.length, 1);

  // Answer the request from the banner.
  await page.locator('section[aria-labelledby="request-title"] input[data-picker="browse"]').setInputFiles([payload(ctx.fixtures.requestedPdf), payload(ctx.fixtures.ledgerPng)]);
  await page.getByLabel(/^Add a note/).fill('Both pages of the N4 and the certificate of service.');
  await page.getByRole('button', { name: 'Send 2 documents' }).click();
  await page.locator('.ahc-file[data-status="uploading"]').first().waitFor();
  await shot(ctx, s, '26-portal-request-uploading');
  await page.getByText(/^Thanks, we received your documents on /).waitFor({ timeout: 20000 });
  await page.getByRole('heading', { name: 'Add documents' }).waitFor();
  await page.getByText('N4 notice and certificate of service.pdf').first().waitFor();
  await shot(ctx, s, '27-portal-request-answered');
  const [prepare] = api.actions('practice-portal', 'prepare_upload');
  assert.equal(prepare.body.token, FIXTURE_TOKENS.multi);
  assert.equal(prepare.body.area, 'ltb');
  assert.equal(prepare.body.id, FIXTURE_IDS.ltb);
  assert.deepEqual(prepare.body.files.map(file => file.name), ['N4 notice and certificate of service.pdf', 'rent-ledger.png']);
  const [confirm] = api.actions('practice-portal', 'confirm_upload');
  assert.equal(confirm.body.documentIds.length, 2);
  assert.equal(confirm.body.note, 'Both pages of the N4 and the certificate of service.');
  for (const upload of api.uploads) {
    assert.equal(upload.headers['x-upsert'], 'false');
    expectAnonHeaders(upload.headers, 'portal upload');
  }

  // Other files: traffic (no request) and a closed matter.
  await page.getByRole('link', { name: 'All files' }).click();
  await page.getByRole('link', { name: /TKT-2026-0117/ }).click();
  await page.getByRole('heading', { name: 'Options and fee ready' }).waitFor();
  await page.getByText('Response deadline (estimate)').filter({ visible: true }).first().waitFor();
  await shot(ctx, s, '28-portal-detail-traffic');
  await page.getByRole('link', { name: 'All files' }).click();
  await page.getByRole('link', { name: /MAT-2026-0008/ }).click();
  await page.getByText('This file is closed').waitFor();
  assert.equal(await page.locator('input[data-picker="browse"]').count(), 0, 'no uploads on a closed file');
  await page.getByText('Settled').first().waitFor();
  await shot(ctx, s, '29-portal-detail-closed');

  // Remember this device, then sign out.
  await page.getByLabel('Remember this device').check();
  assert.equal(await page.evaluate(() => localStorage.getItem('anderhue.portal.v1')), FIXTURE_TOKENS.multi);
  await page.reload();
  await page.getByRole('heading', { name: 'Small Claims Court' }).waitFor();
  assert.ok(await page.getByLabel('Remember this device').isChecked());
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByText('You have signed out on this device.').waitFor();
  assert.equal(await page.evaluate(() => sessionStorage.getItem('anderhue.portal.v1')), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('anderhue.portal.v1')), null);
  await shot(ctx, s, '30-portal-signed-out');

  // One file: straight to it, no "All files" link.
  await page.goto(portalUrl(ctx.origin, '/files', FIXTURE_TOKENS.single));
  await page.waitForURL(new RegExp(`/files/traffic/${FIXTURE_IDS.singleTraffic}$`));
  await page.getByRole('heading', { name: 'Ticket received' }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'All files' }).count(), 0);

  // Unknown paths inside the app.
  await page.goto(`${ctx.origin}/start/nowhere`);
  await page.waitForURL(/\/start$/);
  await page.goto(`${ctx.origin}/files/ltb`);
  await page.waitForURL(/\/files$/);
  await s.close();
}

/**
 * Security review L1: opening a link must not silently replace a link remembered
 * on this device for a different client. Same client: the remembered link is
 * renewed. Covers a fresh page load and a link pasted into an open tab (hashchange).
 */
async function portalTokenSwitch(ctx, kind) {
  const s = await openPage(ctx, kind);
  s.console.allow(HTTP_ERROR); // the expected 404 for another client's file
  const { page } = s;
  const stored = () => page.evaluate(() => ({
    session: sessionStorage.getItem('anderhue.portal.v1'),
    local: localStorage.getItem('anderhue.portal.v1'),
  }));
  const remember = page.getByLabel('Remember this device');

  await page.goto(portalUrl(ctx.origin, '/files', FIXTURE_TOKENS.multi));
  await page.getByRole('heading', { name: 'Hello, Priya' }).waitFor();
  await remember.check();
  assert.deepEqual(await stored(), { session: FIXTURE_TOKENS.multi, local: FIXTURE_TOKENS.multi });

  // Same client, newer link: the remembered link is replaced and stays remembered.
  await page.goto(portalUrl(ctx.origin, '/files', FIXTURE_TOKENS.multiRenewed));
  await page.getByRole('heading', { name: 'Hello, Priya' }).waitFor();
  assert.deepEqual(await stored(), { session: FIXTURE_TOKENS.multiRenewed, local: FIXTURE_TOKENS.multiRenewed }, 'same client renews the remembered link');
  assert.ok(await remember.isChecked(), 'still remembered for the same client');

  // Another client's link: the remembered link is removed, not overwritten; the new one stays in this tab only.
  await page.goto(portalUrl(ctx.origin, '/files', FIXTURE_TOKENS.single));
  await page.waitForURL(new RegExp(`/files/traffic/${FIXTURE_IDS.singleTraffic}$`));
  await page.getByRole('heading', { name: 'Ticket received' }).waitFor();
  assert.deepEqual(await stored(), { session: FIXTURE_TOKENS.single, local: null }, 'other client removes the remembered link');
  assert.equal(await remember.isChecked(), false, 'Remember this device starts unchecked for the other client');
  await page.getByText('marc.tremblay@example.com').waitFor();
  await shot(ctx, s, '31-portal-other-client-link');

  // A link pasted into an open tab (only the hash changes) follows the same rule. The tab is
  // signed in as the other client, so Priya's file is not found until her link arrives.
  await remember.check();
  assert.equal((await stored()).local, FIXTURE_TOKENS.single);
  await page.goto(`${ctx.origin}/files/ltb/${FIXTURE_IDS.ltb}`);
  await page.getByRole('heading', { name: 'We could not find that file' }).waitFor();
  await page.evaluate(token => { window.location.hash = `t=${token}`; }, FIXTURE_TOKENS.multi);
  await page.getByRole('heading', { name: 'We need a document from you' }).waitFor();
  assert.equal(new URL(page.url()).hash, '', 'token removed from the address bar');
  assert.deepEqual(await stored(), { session: FIXTURE_TOKENS.multi, local: null }, 'pasted link for another client removes the remembered link');
  assert.equal(await remember.isChecked(), false);
  await page.getByText('priya.sharma@example.com').first().waitFor();
  await s.close();
}

/** 360 px: every key state fits without horizontal scrolling. */
async function narrowChecks(ctx) {
  const s = await openPage(ctx, 'narrow');
  const { page } = s;
  await page.goto(`${ctx.origin}/start`);
  await page.getByRole('heading', { name: 'What can we help with?' }).waitFor();
  await shot(ctx, s, '01-start-chooser');
  await page.goto(`${ctx.origin}/start?area=traffic`);
  await page.locator('input[data-picker="browse"]').setInputFiles([payload(ctx.fixtures.ticketFront), payload(ctx.fixtures.leasePdf), payload(ctx.fixtures.bigPdf)]);
  await shot(ctx, s, '03-traffic-documents-files');
  await continueButton(page).click();
  await page.getByLabel('What is the ticket for?').selectOption('distracted');
  await page.getByLabel(/^Date you got it/).fill(isoDays(-3));
  await shot(ctx, s, '10-traffic-details');
  await continueButton(page).click();
  await page.getByLabel('Full name').fill('Alexandra Bergström-Nakamura');
  await page.getByLabel('Email').fill('alexandra.bergstrom.nakamura.longaddress@example-company.co.uk');
  await continueButton(page).click();
  await page.getByRole('heading', { name: 'Review and send' }).waitFor();
  await shot(ctx, s, '07-traffic-review');
  await page.getByRole('button', { name: 'Send my file' }).click();
  await page.getByRole('heading', { name: 'Your file is open' }).waitFor({ timeout: 20000 });
  await shot(ctx, s, '09-traffic-success');
  await page.goto(`${ctx.origin}/files`);
  await page.getByRole('heading', { name: 'Open your file' }).waitFor();
  await shot(ctx, s, '20-portal-signin');
  await page.goto(portalUrl(ctx.origin, '/files', FIXTURE_TOKENS.multi));
  await page.getByRole('heading', { name: 'Hello, Priya' }).waitFor();
  await shot(ctx, s, '24-portal-list');
  await page.getByRole('link', { name: /LTB-2026-0042/ }).click();
  await page.getByRole('heading', { name: 'We need a document from you' }).waitFor();
  await shot(ctx, s, '25-portal-detail-request');
  await s.close();
}

export const SCENARIOS = { landlordFlow, trafficFlow, unsupportedArea, intakeErrors, portalSignIn, portalFiles, portalTokenSwitch };

/**
 * Runs every scenario at 390x844 (touch) and 1440x900, then the 360 px checks.
 * Throws on the first failed assertion. Returns { screenshots }.
 */
export async function runClientQa({ browser, origin, screenshotDir = null, fixturesDir = null, log = () => {}, kinds = ['mobile', 'desktop'], scenarios = Object.keys(SCENARIOS), narrow = true }) {
  if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });
  const fixtures = createFixtureFiles(fixturesDir || path.join(screenshotDir || '/tmp', 'ah-client-fixture-files'));
  const ctx = { browser, origin, screenshotDir, fixtures, results: { screenshots: [] } };
  for (const kind of kinds) {
    for (const name of scenarios) {
      log(`${kind}: ${name}`);
      await SCENARIOS[name](ctx, kind);
    }
  }
  if (narrow) {
    log('narrow: 360 px checks');
    await narrowChecks(ctx);
  }
  return ctx.results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const buildDir = path.resolve(process.argv[2] || process.env.ANDERHUE_OUT_DIR || 'dist-anderhue');
  const screenshotDir = path.resolve(process.argv[3] || process.env.AH_QA_SCREENSHOTS || '/tmp/claude-0/ah-client');
  const only = process.env.AH_QA_ONLY ? process.env.AH_QA_ONLY.split(',') : undefined;
  const kinds = process.env.AH_QA_KINDS ? process.env.AH_QA_KINDS.split(',') : undefined;
  const server = await startAnderhueServer(buildDir);
  const browser = await launchChromium();
  const started = Date.now();
  try {
    const results = await runClientQa({
      browser, origin: server.origin, screenshotDir, log: message => console.log(`- ${message}`),
      ...(only ? { scenarios: only } : {}), ...(kinds ? { kinds } : {}), narrow: process.env.AH_QA_NARROW !== '0',
    });
    console.log(`client QA passed in ${Math.round((Date.now() - started) / 1000)}s, ${results.screenshots.length} screenshots in ${screenshotDir}`);
  } finally {
    await browser.close();
    await server.close();
  }
}
