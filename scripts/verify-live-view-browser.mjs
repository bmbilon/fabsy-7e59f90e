// Local QA only. All backend requests are intercepted with synthetic fixtures.
// This script never logs in to a real account or writes visitor data to Supabase.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const base = process.env.LIVE_VIEW_QA_URL || 'http://127.0.0.1:4187';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('QA requires localhost');
const out = 'reports/admin-live-view';
await mkdir(out, { recursive: true });
const now = Date.now();
const user = { id: '10000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {}, created_at: new Date(now).toISOString() };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp: Math.floor(now / 1000) + 3600, role: 'authenticated' })}.fixture`;
const session = { access_token: token, refresh_token: 'local-fixture-only', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(now / 1000) + 3600, user };
const locations = [
  { city: 'Calgary', region: 'Alberta', country: 'CA', latitude: 51, longitude: -114.1, count: 3 },
  { city: 'Edmonton', region: 'Alberta', country: 'CA', latitude: 53.5, longitude: -113.5, count: 2 },
  { city: 'Vancouver', region: 'British Columbia', country: 'CA', latitude: 49.3, longitude: -123.1, count: 1 },
  { city: null, region: null, country: null, latitude: null, longitude: null, count: 1 },
];
const visitorTemplate = { page: '/rapid-resolution', stage: 'browsing', source: 'Google', device: 'mobile', started_at: new Date(now - 180000).toISOString(), last_seen_at: new Date(now).toISOString() };
const visitors = locations.flatMap((location, i) => Array.from({ length: location.count }, (_, j) => ({ ...location, ...visitorTemplate, id: `${i + 1}0000000-0000-4000-8000-00000000000${j}`, ...(i === 1 ? { page: '/submit-ticket', stage: j ? 'review' : 'intake', source: 'Facebook', device: 'desktop' } : {}) })));
const fixture = { generated_at: new Date(now).toISOString(), collection_started_at: new Date(now - 3600000).toISOString(), window_seconds: 90, active: 7, sessions_today: 84, submissions_today: 9, paid_cases_today: 4, stages: { browsing: 5, intake: 1, review: 1 }, visitors, visitors_truncated: false, locations, pages: [{ page: '/rapid-resolution', count: 5 }, { page: '/submit-ticket', count: 2 }], sources: [{ source: 'Google', count: 5 }, { source: 'Facebook', count: 2 }], timeline: Array.from({ length: 30 }, (_, i) => ({ minute: new Date(now - (29 - i) * 60000).toISOString(), sessions: [0, 1, 0, 2, 1, 3, 0, 4, 1, 2][i % 10] })) };
const browser = await chromium.launch({ headless: true, ...(existsSync('/Applications/Google Chrome.app') ? { channel: 'chrome' } : {}) });
const results = { fixture_data_only: true, checks: [], screenshots: [] };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  let mode = 'live', requests = 0;
  page.on('pageerror', error => errors.push(error.message));
  await context.route(/https:\/\/[^/]+\.supabase\.co\/.*/, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route.request().url().includes('/auth/') ? user : []) }));
  await context.route(`${base}/api/live-view`, route => {
    assert.equal(route.request().method(), 'GET', 'Localhost must never collect visitors');
    requests++;
    if (mode === 'error' || mode === 'denied') return route.fulfill({ status: mode === 'denied' ? 403 : 503, body: '{}' });
    const data = mode === 'empty' ? { ...fixture, active: 0, visitors: [], locations: [], pages: [], sources: [], stages: { browsing: 0, intake: 0, review: 0 } } : fixture;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...data, generated_at: new Date().toISOString() }) });
  });
  await page.goto(`${base}/admin/live`);
  await page.getByRole('link', { name: 'Sign in', exact: true }).waitFor();
  assert.equal(requests, 0);
  results.checks.push('Signed-out users see sign-in and make no snapshot request');
  await page.evaluate(value => localStorage.setItem('sb-gcasbisxfrssonllpqrw-auth-token', JSON.stringify(value)), session);
  await page.reload();
  await page.getByText('Visitor 10000000', { exact: true }).first().waitFor();
  await page.evaluate(() => {
    const notice = document.createElement('div');
    notice.textContent = 'LOCAL DESIGN PREVIEW · SIMULATED VISITORS';
    notice.style.cssText = 'padding:9px;background:#173e37;color:white;font:600 11px system-ui;text-align:center;letter-spacing:1.5px';
    document.body.prepend(notice);
  });
  assert.equal(await page.title(), 'Live View | Fabsy Admin');
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex, nofollow');
  for (const [width, height, name] of [[1440, 1080, 'desktop'], [390, 844, 'mobile']]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.getByRole('link', { name: 'Call Fabsy at (825) 793-2279' }).count(), 0, 'Public call bar stays out of admin');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name}: no page overflow`);
    const screenshot = `${out}/fixture-${name}.png`;
    await page.screenshot({ path: screenshot, fullPage: true });
    results.screenshots.push(screenshot);
    results.checks.push(`${name} layout: no horizontal page overflow`);
  }
  await page.getByRole('button', { name: 'Show world map' }).click();
  await page.getByRole('button', { name: 'Show globe' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Rotate globe west' }).isDisabled(), true);
  await page.getByRole('button', { name: 'Show globe' }).click();
  await page.getByRole('button', { name: 'Rotate globe east' }).click();
  await page.getByRole('button', { name: 'Center globe on Alberta' }).click();
  results.checks.push('Globe/world map toggle and rotation controls work');
  await page.getByRole('textbox', { name: 'Filter visitors by page, location, source or device' }).fill('Edmonton');
  assert.equal(await page.locator('tbody tr').count(), 2);
  await page.getByRole('textbox').fill('no-such-location');
  await page.getByText('No visitors match this filter.').waitFor();
  await page.getByRole('textbox').fill('');
  results.checks.push('Visitor filtering and no-match state work');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const beforePause = requests;
  await page.waitForTimeout(16000);
  assert.equal(requests, beforePause);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.waitForTimeout(16000);
  assert.ok(requests > beforePause);
  results.checks.push('Pause stops polling; resume restores 15-second updates');
  mode = 'error';
  await page.getByRole('button', { name: 'Refresh Live View' }).click();
  await page.getByRole('alert').filter({ hasText: 'last successful snapshot' }).waitFor();
  await page.getByText('Connection interrupted', { exact: true }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 7);
  results.checks.push('Connection loss retains last snapshot with explicit stale status');
  mode = 'empty';
  await page.getByRole('button', { name: 'Refresh Live View' }).click();
  await page.getByText('No active visitors in the last 90 seconds.').waitFor();
  results.checks.push('Connected empty state is distinct from unavailable');
  mode = 'denied';
  await page.reload();
  await page.getByRole('alert').filter({ hasText: 'Administrator access is required' }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 0);
  results.checks.push('Non-admin API denial exposes no visitor data');
  assert.deepEqual(errors, []);
  results.checks.push('No browser runtime errors');
  await context.close();
  await writeFile(`${out}/browser-checks.json`, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
