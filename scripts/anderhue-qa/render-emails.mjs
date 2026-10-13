// Renders every AnderHue client update and staff alert with sample data so the
// templates can be reviewed and approved once (standing approval policy).
//   node scripts/anderhue-qa/render-emails.mjs [outDir]
// Writes one HTML file per email plus index.html, a gallery of all of them.
// Uses only fixture data; nothing is sent.
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const outDir = path.resolve(process.argv[2] || 'email-previews');
fs.mkdirSync(outDir, { recursive: true });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'anderhue-emails-'));
async function load(relative) {
  const outfile = path.join(temporary, `${path.basename(relative, '.ts')}.mjs`);
  await build({ entryPoints: [relative], outfile, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}
const notices = await load('supabase/functions/_shared/practice-notices.ts');
const catalog = await load('supabase/functions/_shared/practice-catalog.ts');

const siteUrl = process.env.ANDERHUE_EMAIL_SITE_URL || 'https://anderhue.ca';
const practice = {
  id: 'anderhue-paralegal', name: 'AnderHue Paralegal Professional Corporation', displayName: 'AnderHue Paralegal',
  licenseeName: 'Don Anderson', phone: '(289) 985-0166', publicEmail: 'hello@anderhue.ca', siteUrl,
  clientEmailFrom: 'AnderHue Paralegal <files@anderhue.ca>', clientReplyTo: 'hello@anderhue.ca', noticeFrom: null,
};
const client = {
  id: '11111111-1111-4111-8111-111111111111', firstName: 'Priya', lastName: 'Sharma', organizationName: null,
  email: 'priya@example.com', phone: '(905) 555-0100',
};
const files = {
  ltb: {
    area: 'ltb', id: '33333333-3333-4333-8333-333333333333', number: 'LTB-2026-0042', issue: 'arrears', ticketType: null,
    category: null, city: 'Hamilton', keyDates: { noticeTerminationDate: '2026-10-07', hearingDate: '2026-11-12' },
  },
  traffic: {
    area: 'traffic', id: '22222222-2222-4222-8222-222222222222', number: 'TKT-2026-0118', issue: null, ticketType: 'speeding',
    category: null, city: 'Mississauga',
    keyDates: { optionDeadline: '2026-10-12', offenceDate: '2026-09-27', meetingDate: '2026-10-20', trialDate: '2026-12-03' },
  },
  general: {
    area: 'general', id: '44444444-4444-4444-8444-444444444444', number: 'MAT-2026-0009', issue: null, ticketType: null,
    category: 'small_claims', city: 'Burlington', keyDates: { deadlineDate: '2026-10-30' },
  },
};
const fileSnapshot = (area, extra = {}) => ({
  stage: 'new_intake', outcome: null, createdAt: '2026-09-28T14:00:00Z', reviewStatus: 'ready', documentCount: 2,
  clientNotes: null, request: null, ...files[area], ...extra,
});
const notice = (kind, area, extra = {}) => {
  const staff = kind.startsWith('staff_');
  return {
    id: `preview-${kind}-${area || 'portal'}-${extra.file?.stage || ''}`, claim_id: 'preview', kind,
    audience: staff ? 'staff' : 'client', practice_id: practice.id, area: area || null,
    case_id: area ? files[area].id : null, client_id: client.id, detail: extra.detail || {},
    created_at: '2026-10-01T15:04:05Z',
    recipients: staff ? ['hello@anderhue.ca'] : [client.email],
    snapshot: {
      practice: { ...practice, ...(staff ? { noticeFrom: 'AnderHue Case Desk <files@anderhue.ca>' } : {}) },
      client: staff ? client : { ...client, phone: undefined },
      file: area ? fileSnapshot(area, { ...(staff ? { clientNotes: 'I drive for work and cannot afford the points.', reviewNotes: 'Statute section read with low confidence.', returningClient: false } : {}), ...extra.file }) : null,
    },
  };
};

const samples = [];
const MESSAGE = {
  ltb: 'I have prepared the N4 for your signature. Please review it tonight if you can.',
  traffic: 'The prosecutor offered to reduce the charge to 15 km/h over. Call me when you can and we will go through it.',
  general: 'I have drafted the claim and will file it once you confirm the amounts.',
};
for (const area of ['ltb', 'traffic', 'general']) {
  samples.push([`${area}: file received`, notice('intake_received', area)]);
  for (const stage of catalog.STAGES[area].filter(stage => stage.notify)) {
    const outcome = stage.value === 'closed' ? catalog.OUTCOMES[area][0].value : stage.value === 'declined' ? 'declined' : null;
    const detail = { stage: stage.value, outcome, message: stage.value === 'quoted' || stage.value === 'offer_received' ? MESSAGE[area] : null };
    samples.push([`${area}: ${stage.staffLabel}`, notice('stage_changed', area, { detail, file: { stage: stage.value, outcome } })]);
  }
  samples.push([`${area}: documents requested`, notice('documents_requested', area, {
    detail: { message: 'Please upload the front and back of your ticket and any court notice you received.' },
    file: { request: { message: 'Please upload the front and back of your ticket and any court notice you received.', at: '2026-09-30T15:00:00Z' } },
  })]);
  samples.push([`${area}: document shared`, notice('document_shared', area, { detail: { documentName: 'Fee quote and next steps.pdf' } })]);
  samples.push([`${area}: upload invite`, notice('upload_invite', area)]);
  samples.push([`${area}: staff alert, new file`, notice('staff_new_intake', area)]);
  samples.push([`${area}: staff alert, client upload`, notice('staff_client_uploaded', area, { detail: { count: 2, note: 'Here is the signed lease and the ledger.' } })]);
}
samples.push(['portal link', notice('portal_link', null)]);

const cards = [];
for (const [index, [label, item]] of samples.entries()) {
  const email = await notices.renderPracticeNotice(item, { signingSecret: 'preview-signing-secret-preview-signing-secret' });
  const name = `${String(index + 1).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.html`;
  fs.writeFileSync(path.join(outDir, name), email.html);
  const escape = value => String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
  cards.push(`<section><h2>${escape(label)}</h2><p><b>From</b> ${escape(email.from)}${email.reply_to ? ` · <b>Reply to</b> ${escape(email.reply_to)}` : ''}<br><b>Subject</b> ${escape(email.subject)}</p><iframe src="${name}" loading="lazy" title="${escape(label)}"></iframe></section>`);
}
fs.writeFileSync(path.join(outDir, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>AnderHue email templates</title>
<style>body{font-family:system-ui,sans-serif;background:#efe6d8;margin:0;padding:24px;color:#261d2c}h1{font-weight:500}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(640px,1fr));gap:24px}section{background:#fff;border:1px solid #ded3c8;border-radius:6px;padding:16px}h2{font-size:16px;margin:0 0 6px}p{font-size:13px;margin:0 0 10px;color:#54465d}iframe{width:100%;height:900px;border:1px solid #ded3c8;border-radius:4px;background:#f7f1e8}</style>
</head><body><h1>AnderHue client updates and staff alerts (${samples.length} templates)</h1><main>${cards.join('\n')}</main></body></html>`);
console.log(`Rendered ${samples.length} emails into ${outDir}`);
