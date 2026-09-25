// Exercise the built app with synthetic sessions. Never forward Supabase or
// other external traffic, and never create a real account or practice member.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const origin = new URL(process.env.LTB_ACCESS_QA_URL || 'http://127.0.0.1:4187').origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'QA requires localhost');
const fixtureId = '10000000-0000-4000-8000-000000000001';
const user = { id: fixtureId, aud: 'authenticated', role: 'authenticated', email: 'ltb-member@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const expires = Math.floor(Date.now() / 1000) + 3600;
const session = {
  access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp: expires, role: 'authenticated' })}.fixture`,
  refresh_token: 'local-fixture-only', token_type: 'bearer', expires_in: 3600, expires_at: expires, user,
};
const trafficRoutes = [...readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8').matchAll(/<Route path="(\/admin\/[^"\s]+)"/g)]
  .map(match => match[1]).filter(path => !path.startsWith('/admin/ltb'))
  .map(path => path.replace(/:[^/]+/g, fixtureId));
assert.ok(trafficRoutes.includes('/admin/cases') && trafficRoutes.includes('/admin/blog'));
const browser = await chromium.launch({ headless: true, ...(existsSync('/Applications/Google Chrome.app') ? { channel: 'chrome' } : {}) });

async function fixture({ role = null, signedIn = true, member = true, roleError = false, holdRole = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const requests = [];
  const errors = [];
  let releaseRole;
  const roleGate = holdRole ? new Promise(resolve => { releaseRole = resolve; }) : Promise.resolve();
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Range': '0-0/0' }, body: JSON.stringify(value) });
    if (url.hostname.endsWith('.supabase.co') || url.hostname === 'supabase-configuration-missing.invalid') {
      if (request.method() === 'OPTIONS') return json({});
      if (url.pathname.startsWith('/auth/v1/')) return json(url.pathname.endsWith('/user') ? user : session);
      requests.push(url.pathname);
      if (url.pathname.endsWith('/rpc/idr_staff_role')) {
        await roleGate;
        return roleError ? json({ message: 'Synthetic role lookup failure' }, 503) : json(role);
      }
      if (url.pathname.endsWith('/rpc/ltb_my_practices')) return json(member ? [{ practice_id: 'anderhue-paralegal', practice_name: 'Synthetic LTB practice', member_role: 'licensee' }] : []);
      if (url.pathname.endsWith('/rpc/admin_dashboard_queue')) return json({ items: [], total: 0, page_size: 8, counts: {} });
      if (url.pathname.startsWith('/rest/v1/') && request.method() === 'GET') return json([]);
      return json({ message: 'Not available in synthetic QA' }, 403);
    }
    if (url.origin === origin) {
      if (url.pathname.startsWith('/api/')) return json({});
      assert.equal(request.method(), 'GET', 'Only local app reads are allowed');
      return route.continue();
    }
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  if (signedIn) await context.addInitScript(value => {
    localStorage.setItem('sb-gcasbisxfrssonllpqrw-auth-token', JSON.stringify(value));
    localStorage.setItem('sb-supabase-configuration-missing-auth-token', JSON.stringify(value));
  }, session);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const onlyLtbRequests = () => assert.deepEqual(requests.filter(path =>
    path !== '/rest/v1/rpc/idr_staff_role' && !path.startsWith('/rest/v1/ltb_') && !path.startsWith('/rest/v1/rpc/ltb_')), [], 'LTB users must not request traffic data');
  return { page, requests, onlyLtbRequests, releaseRole, async close() { assert.deepEqual(errors, []); await context.close(); } };
}

try {
  const ltb = await fixture();
  for (const path of trafficRoutes) {
    await ltb.page.goto(`${origin}${path}`);
    await ltb.page.waitForURL(`${origin}/admin/ltb`);
    await ltb.page.getByRole('region', { name: 'LTB file stages, scroll horizontally' }).waitFor();
    const adminLinks = await ltb.page.locator('a[href^="/admin"]').evaluateAll(links => links.map(link => link.getAttribute('href')));
    assert.ok(adminLinks.length > 0);
    assert.ok(adminLinks.every(href => href === '/admin/ltb' || href.startsWith('/admin/ltb/')), path);
    ltb.onlyLtbRequests();
  }
  await ltb.page.getByRole('link', { name: 'Ontario LTB files home' }).click();
  assert.equal(new URL(ltb.page.url()).pathname, '/admin/ltb');
  await ltb.page.getByRole('button', { name: 'Search LTB tools' }).click();
  await ltb.page.getByRole('combobox').fill('ticket');
  await ltb.page.getByText('No matches.', { exact: true }).waitFor();
  assert.equal(await ltb.page.getByRole('option').count(), 0, 'Command search exposes no traffic tools');
  await ltb.page.keyboard.press('Escape');
  await ltb.page.setViewportSize({ width: 390, height: 844 });
  await ltb.page.getByRole('button', { name: 'Open admin navigation' }).click();
  assert.deepEqual(await ltb.page.getByRole('dialog').locator('a[href^="/admin"]').evaluateAll(links => links.map(link => link.getAttribute('href'))), ['/admin/ltb']);
  await ltb.page.keyboard.press('Escape');
  await ltb.page.goto(`${origin}/admin/ltb/cases/${fixtureId}`);
  await ltb.page.getByText('This file is not available to your account.', { exact: true }).waitFor();
  assert.equal(new URL(ltb.page.url()).pathname, `/admin/ltb/cases/${fixtureId}`, 'LTB detail URLs remain accessible');
  assert.ok(ltb.requests.includes('/rest/v1/ltb_case_documents'));
  ltb.onlyLtbRequests();
  await ltb.close();

  const pending = await fixture({ holdRole: true });
  await pending.page.goto(`${origin}/admin/blog`);
  await pending.page.getByRole('status').filter({ hasText: 'Checking access' }).waitFor();
  assert.equal(await pending.page.getByRole('navigation', { name: 'Admin navigation' }).count(), 0);
  assert.deepEqual(pending.requests.filter(path => path !== '/rest/v1/rpc/idr_staff_role'), [], 'No child data requests before role verification');
  pending.releaseRole();
  await pending.page.waitForURL(`${origin}/admin/ltb`);
  await pending.page.getByRole('heading', { name: 'Ontario LTB files', exact: true }).waitFor();
  await pending.close();

  const failed = await fixture({ roleError: true });
  await failed.page.goto(`${origin}/admin/blog`);
  await failed.page.getByRole('alert').filter({ hasText: 'Your access could not be verified' }).waitFor();
  assert.deepEqual(failed.requests.filter(path => path !== '/rest/v1/rpc/idr_staff_role'), [], 'Failed role lookup must not mount any child page');
  assert.equal(await failed.page.getByRole('button', { name: 'Retry access check' }).count(), 1);
  await failed.close();

  const nonmember = await fixture({ member: false });
  await nonmember.page.goto(`${origin}/admin/cases`);
  await nonmember.page.getByText('Your account does not have access to an Ontario practice. Ask a Fabsy admin to add you.', { exact: true }).waitFor();
  assert.ok(!nonmember.requests.includes('/rest/v1/ltb_cases'), 'Login alone must not grant LTB membership');
  nonmember.onlyLtbRequests();
  await nonmember.close();

  const signedOut = await fixture({ signedIn: false });
  await signedOut.page.goto(`${origin}/admin/ltb`);
  await signedOut.page.waitForURL(`${origin}/admin`);
  assert.deepEqual(signedOut.requests, [], 'Signed-out users must not fetch staff or practice data');
  await signedOut.close();

  for (const role of ['admin', 'case_manager']) {
    const staff = await fixture({ role });
    await staff.page.goto(`${origin}/admin/blog`);
    await staff.page.getByRole('link', { name: 'Fabsy admin overview' }).waitFor();
    assert.equal(new URL(staff.page.url()).pathname, '/admin/blog', `${role} retains traffic workspace access`);
    assert.ok(await staff.page.getByRole('link', { name: 'Case management', exact: true }).count());
    await staff.close();
  }
  console.log(`LTB access verified: ${trafficRoutes.length} direct traffic URLs blocked, LTB desktop/mobile navigation, search, nested routes, loading/error/anonymous/nonmember denial, and existing staff access. All external requests intercepted.`);
} finally {
  await browser.close();
}
