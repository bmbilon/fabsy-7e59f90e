// Local QA only: every non-local request is blocked or fulfilled from synthetic
// data, including Supabase reads/mutations. No real accounts or contacts are used.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const base = process.env.INTAKE_FOLLOW_UP_QA_URL || 'http://127.0.0.1:4187';
const origin = new URL(base).origin;
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('QA requires localhost');
const out = 'reports/intake-follow-up-status';
await mkdir(out, { recursive: true });
const now = Date.now();
const timestamp = new Date(now - 600000).toISOString();
const user = { id: '10000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'staff@example.test', app_metadata: {}, user_metadata: {}, created_at: timestamp };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp: Math.floor(now / 1000) + 3600, role: 'authenticated' })}.fixture`;
const session = { access_token: token, refresh_token: 'local-fixture-only', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(now / 1000) + 3600, user };
const lead = (id, email, changed = {}) => ({
  id, email, phone: '+18255550100', deleted_at: null, preferred_locale: 'en',
  current_step: 5, completed_step: 4, status: 'active', converted_submission_id: null,
  ticket_document_path: 'synthetic/ticket.jpg', ticket_document_content_type: 'image/jpeg', ticket_document_size_bytes: 16400,
  ticket_uploaded_at: timestamp, updated_at: timestamp, expires_at: '2099-01-01T00:00:00Z',
  resume_delivery_status: 'sent', resume_delivery_channel: 'email', resume_delivery_sent_at: timestamp,
  resume_delivery_attempt_count: 1, resume_delivery_failure_code: null, staff_follow_up_status: 'open',
  staff_follow_up_updated_at: null, staff_follow_up_updated_by: null,
  follow_up_email_sent_at: null, follow_up_email_sent_by: null,
  follow_up_phone_called_at: null, follow_up_phone_called_by: null, ...changed,
});
const leads = [
  lead('20000000-0000-4000-8000-000000000001', 'new-ticket@example.test'),
  lead('20000000-0000-4000-8000-000000000002', 'email-complete@example.test', { follow_up_email_sent_at: timestamp }),
  lead('20000000-0000-4000-8000-000000000003', 'both-complete@example.test', { staff_follow_up_status: 'contacted', follow_up_email_sent_at: timestamp, follow_up_email_sent_by: user.id, follow_up_phone_called_at: timestamp, follow_up_phone_called_by: user.id }),
  lead('20000000-0000-4000-8000-000000000004', 'historic-contact@example.test', { staff_follow_up_status: 'contacted', staff_follow_up_updated_at: timestamp, staff_follow_up_updated_by: user.id }),
];
const results = { fixture_data_only: true, external_requests_forwarded: 0, recorded_actions: [], blocked_external_origins: [], checks: [], screenshots: [] };
const browser = await chromium.launch({ headless: true, ...(existsSync('/Applications/Google Chrome.app') ? { channel: 'chrome' } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const errors = [];
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Range': '0-0/0' }, body: JSON.stringify(value) });
    if (url.hostname.endsWith('.supabase.co') || url.hostname === 'supabase-configuration-missing.invalid') {
      if (request.method() === 'OPTIONS') return json({});
      if (url.pathname.startsWith('/auth/v1/')) return json(url.pathname.endsWith('/user') ? user : session);
      if (url.pathname.endsWith('/rpc/idr_staff_role')) return json('admin');
      if (url.pathname.endsWith('/rpc/ate_first_twenty_metrics')) return json({ cohort_count: 0, resolved_count: 0, pending_count: 0, median_reduction_cad: null, below_40: null, cohort_complete: false });
      if (url.pathname.endsWith('/rpc/record_ticket_intake_follow_up')) {
        const args = request.postDataJSON();
        assert.equal(request.method(), 'POST');
        assert.ok(['email', 'phone'].includes(args.p_channel));
        const target = leads.find(item => item.id === args.p_id);
        assert.ok(target, 'Only synthetic leads may be updated');
        assert.equal(args.p_expected_status, target.staff_follow_up_status);
        const prefix = args.p_channel === 'email' ? 'follow_up_email_sent' : 'follow_up_phone_called';
        target[`${prefix}_at`] ||= new Date().toISOString();
        target[`${prefix}_by`] ||= user.id;
        target.staff_follow_up_status = 'contacted';
        target.staff_follow_up_updated_at = new Date().toISOString();
        target.staff_follow_up_updated_by = user.id;
        results.recorded_actions.push(args.p_channel);
        return json([{
          draft_id: target.id, follow_up_status: target.staff_follow_up_status,
          follow_up_updated_at: target.staff_follow_up_updated_at, follow_up_updated_by: user.id,
          follow_up_email_sent_at: target.follow_up_email_sent_at, follow_up_email_sent_by: target.follow_up_email_sent_by,
          follow_up_phone_called_at: target.follow_up_phone_called_at, follow_up_phone_called_by: target.follow_up_phone_called_by,
        }]);
      }
      if (url.pathname.endsWith('/ticket_intake_drafts')) return json(leads);
      if (url.pathname.endsWith('/disclosure_automation_state')) return json({ delivery_enabled: false, routing_configured: false, last_worker_at: null, last_webhook_at: null, last_worker_error: null });
      if (url.pathname.startsWith('/rest/v1/') && request.method() === 'GET') return json([]);
      // Unknown mutations, Edge Functions and file access are never forwarded.
      return json({ message: 'Not available in synthetic QA' }, 403);
    }
    if (url.origin === origin) {
      if (url.pathname.startsWith('/api/')) return json({});
      assert.equal(request.method(), 'GET', 'Only local static/app reads are allowed');
      return route.continue();
    }
    if (!results.blocked_external_origins.includes(url.origin)) results.blocked_external_origins.push(url.origin);
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket('**/*', socket => {
    const url = new URL(socket.url());
    if (['localhost', '127.0.0.1'].includes(url.hostname) && url.port === new URL(base).port) socket.connectToServer();
    else socket.close();
  });
  await context.addInitScript(value => {
    localStorage.setItem('sb-gcasbisxfrssonllpqrw-auth-token', JSON.stringify(value));
    localStorage.setItem('sb-supabase-configuration-missing-auth-token', JSON.stringify(value));
  }, session);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/admin/cases`);
  await page.getByRole('heading', { name: 'Incomplete ticket intakes', exact: true }).waitFor();
  await page.getByRole('link', { name: 'new-ticket@example.test', exact: true }).waitFor();
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  const row = email => page.locator('div.rounded-lg.border').filter({ has: page.getByRole('link', { name: email, exact: true }) }).last();
  const badge = (scope, label) => scope.locator('div.rounded-full').filter({ hasText: new RegExp(`^${label}$`) });
  assert.equal(await badge(row('new-ticket@example.test'), 'Email sent').count(), 0, 'Resume email is separate from follow-up email');
  await row('new-ticket@example.test').getByText(/^Resume link:/).waitFor();
  assert.equal(await badge(row('email-complete@example.test'), 'Email sent').count(), 1);
  assert.equal(await row('email-complete@example.test').getByRole('button', { name: 'Record email sent', exact: true }).count(), 0);
  assert.equal(await badge(row('both-complete@example.test'), 'Phone call made').count(), 1);
  assert.equal(await badge(row('historic-contact@example.test'), 'Contacted').count(), 1);
  results.checks.push('Separate channel statuses, automatic email receipt, legacy Contacted, and resume-link distinction render');
  await page.evaluate(() => {
    const notice = document.createElement('div');
    notice.textContent = 'LOCAL DESIGN PREVIEW · SYNTHETIC CONTACTS';
    notice.style.cssText = 'padding:9px;background:#173e37;color:white;font:600 11px system-ui;text-align:center;letter-spacing:1.5px';
    document.body.prepend(notice);
  });
  for (const [width, height, name] of [[1440, 1080, 'desktop'], [390, 844, 'mobile']]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name}: no horizontal page overflow`);
    const screenshot = `${out}/fixture-${name}.png`;
    await page.screenshot({ path: screenshot, fullPage: true });
    results.screenshots.push(screenshot);
    results.checks.push(`${name}: all statuses and actions render without horizontal page overflow`);
  }
  await row('new-ticket@example.test').getByRole('button', { name: 'Record email sent', exact: true }).click();
  await badge(row('new-ticket@example.test'), 'Email sent').waitFor();
  await row('new-ticket@example.test').getByRole('button', { name: 'Phone call made', exact: true }).click();
  await badge(row('new-ticket@example.test'), 'Phone call made').waitFor();
  assert.equal(await badge(row('new-ticket@example.test'), 'Email sent').count(), 1);
  assert.deepEqual(results.recorded_actions, ['email', 'phone']);
  await page.getByRole('button', { name: 'Refresh queue', exact: true }).click();
  await badge(row('new-ticket@example.test'), 'Phone call made').waitFor();
  assert.equal(await badge(row('new-ticket@example.test'), 'Email sent').count(), 1);
  results.checks.push('Manual contact recording updates both badges and survives queue refresh without sending or calling');
  assert.deepEqual(errors, []);
  results.checks.push('No browser runtime errors; all external traffic intercepted');
  await context.close();
  await writeFile(`${out}/browser-checks.json`, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
