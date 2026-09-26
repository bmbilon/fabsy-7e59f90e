// All authentication and file requests use local fixtures. No real accounts,
// emails, membership changes or production file reads are made by this test.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve('dist-anderhue');
const server = createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const target = pathname.startsWith('/assets/') ? path.join(root, 'assets', path.basename(pathname)) : path.join(root, 'portal.html');
  if (!existsSync(target)) { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : 'text/html');
  response.end(readFileSync(target));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const user = { id: '10000000-0000-4000-8000-000000000001', email: 'member@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600;
const session = { access_token: `${encode({ alg: 'HS256' })}.${encode({ sub: user.id, exp, role: 'authenticated' })}.fixture`, refresh_token: 'fixture', expires_in: 3600, expires_at: exp, token_type: 'bearer', user };
const browser = await chromium.launch({ headless: true, ...(existsSync('/Applications/Google Chrome.app') ? { channel: 'chrome' } : {}) });

async function fixture({ signedIn = true, practice = 'anderhue-paralegal', fail = false, hold = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const requests = [];
  let release;
  const gate = hold ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (url.origin === origin) return route.continue();
    if (!url.hostname.endsWith('.supabase.co')) return route.abort();
    requests.push(url);
    if (url.pathname.endsWith('/signup')) return json({ user, session: null });
    if (url.pathname.startsWith('/auth/v1/')) return json(url.pathname.endsWith('/user') ? user : session);
    if (url.pathname.endsWith('/rpc/idr_staff_role')) return json(null);
    if (url.pathname.endsWith('/rpc/ltb_my_practices')) {
      await gate;
      return fail ? json({ message: 'Fixture access failure' }, 503) : json([{ practice_id: practice, practice_name: 'AnderHue Paralegal', member_role: 'licensee' }]);
    }
    assert.ok(url.pathname.startsWith('/rest/v1/ltb_'), `Unexpected data request ${url.pathname}`);
    assert.equal(url.searchParams.get('practice_id'), 'eq.anderhue-paralegal', 'Every file query must be practice scoped');
    return json([]);
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  if (signedIn) await context.addInitScript(value => localStorage.setItem('sb-gcasbisxfrssonllpqrw-auth-token', JSON.stringify(value)), session);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return { page, requests, release, async close() { assert.deepEqual(errors, []); await context.close(); } };
}

try {
  const anon = await fixture({ signedIn: false });
  await anon.page.goto(`${origin}/admin/ltb`);
  await anon.page.waitForURL(`${origin}/sign-in`);
  await anon.page.getByRole('heading', { name: 'Welcome back' }).waitFor();
  assert.match(await anon.page.title(), /AnderHue Paralegal/);
  assert.doesNotMatch(await anon.page.locator('body').innerText(), /Fabsy/i);
  assert.equal(await anon.page.locator('meta[name="robots"]').getAttribute('content'), 'noindex, nofollow');
  if (process.env.ANDERHUE_QA_SCREENSHOT) await anon.page.screenshot({ path: process.env.ANDERHUE_QA_SCREENSHOT, fullPage: true });
  await anon.page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await anon.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await anon.page.getByRole('button', { name: 'First time here? Create an account' }).click();
  await anon.page.getByLabel('Email address').fill(user.email);
  await anon.page.getByLabel('Password', { exact: true }).fill('fixture-password-only');
  await anon.page.getByRole('button', { name: 'Create account', exact: true }).click();
  await anon.page.getByRole('status').filter({ hasText: 'Check your email' }).waitFor();
  assert.equal(anon.requests.find(url => url.pathname.endsWith('/signup')).searchParams.get('redirect_to'), `${origin}/sign-in`);
  await anon.page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await anon.page.waitForURL(`${origin}/admin/ltb`);
  await anon.page.getByRole('region', { name: 'LTB file stages, scroll horizontally' }).waitFor();
  await anon.page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await anon.page.waitForURL(`${origin}/sign-in`);
  await anon.close();

  const member = await fixture();
  for (const route of ['/admin/ltb', '/admin/cases', '/admin/portal', '/admin/blog']) {
    await member.page.goto(`${origin}${route}`);
    await member.page.waitForURL(`${origin}/admin/ltb`);
    await member.page.getByRole('region', { name: 'LTB file stages, scroll horizontally' }).waitFor();
    assert.doesNotMatch(await member.page.locator('body').innerText(), /Fabsy/i);
    assert.deepEqual(await member.page.locator('a[href^="/admin"]').evaluateAll(links => links.map(link => link.getAttribute('href'))), ['/admin/ltb']);
  }
  await member.page.goto(`${origin}/admin/ltb/cases/${user.id}`);
  await member.page.getByText('This file is not available to your account.', { exact: true }).waitFor();
  assert.match(await member.page.title(), /AnderHue Paralegal/);
  assert.ok(member.requests.some(url => url.pathname.endsWith('/ltb_case_documents')));
  await member.close();

  for (const options of [{ practice: 'another-practice' }, { fail: true }, { hold: true }]) {
    const denied = await fixture(options);
    await denied.page.goto(`${origin}/admin/ltb`);
    await denied.page.getByText(options.fail ? 'Access could not be verified' : options.hold ? 'Checking practice access…' : 'Your account is ready', { exact: true }).waitFor();
    assert.ok(!denied.requests.some(url => url.pathname.startsWith('/rest/v1/ltb_')), 'No file reads before membership succeeds');
    if (options.hold) { denied.release(); await denied.page.getByRole('region', { name: 'LTB file stages, scroll horizontally' }).waitFor(); }
    await denied.close();
  }
  console.log('PASS: AnderHue branding, signup return URL, sign-in/out, practice scope, denied access, traffic routes and mobile layout');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
