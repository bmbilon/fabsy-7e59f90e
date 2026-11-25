// Small browser regression for canonical /paralegal paths. Full client/staff
// fixtures continue to cover legacy root aliases and never reach production.
import assert from 'node:assert/strict';
import { mockClientApi, portalUrl, trackConsole } from './client-fixtures.mjs';
import { openStaffContext } from './staff-fixtures.mjs';

export async function runPrefixedAppChecks({ browser, origin, log = () => {} }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const api = await mockClientApi(context, { downloadOrigin: origin });
  const page = await context.newPage();
  const consoleLog = trackConsole(page);
  try {
    await page.goto(`${origin}/paralegal/start`);
    await page.getByRole('heading', { name: 'What can we help with?' }).waitFor();
    const traffic = page.locator('a[href="/paralegal/start?area=traffic"]');
    assert.equal(await traffic.count(), 1);
    await traffic.click();
    await page.waitForURL(`${origin}/paralegal/start?area=traffic`);
    assert.equal(await page.locator('h1').count(), 1, 'prefixed intake route renders');

    await page.goto(`${origin}/paralegal/files`);
    await page.getByRole('heading', { name: 'Open your file' }).waitFor();
    await page.getByRole('button', { name: 'Email me a secure link' }).waitFor();

    // Real token parsing and router navigation, with a fixture token/API only.
    await page.goto(portalUrl(origin, '/paralegal/files'));
    await page.locator('.ahc-filecard').first().waitFor();
    assert.equal(new URL(page.url()).hash, '', 'signed token cleared from prefixed URL');
    const firstFile = page.locator('.ahc-filecard').first();
    // Cards may themselves be anchors.
    const target = await firstFile.evaluate(el => el.matches('a') ? el.getAttribute('href') : el.querySelector('a')?.getAttribute('href'));
    assert.ok(target?.startsWith('/paralegal/files/'), 'file links retain the router prefix');
    await page.goto(origin + target);
    await page.getByRole('link', { name: 'All files', exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'All files', exact: true }).getAttribute('href'), '/paralegal/files');
    assert.deepEqual(consoleLog.unexpected(), []);
    assert.deepEqual(api.unexpected, []);
  } finally {
    await context.close();
  }
  const staff = await openStaffContext(browser, origin, { signedIn: false, viewport: { width: 390, height: 844 } });
  try {
    await staff.page.goto(`${origin}/paralegal/sign-in`);
    await staff.page.getByRole('heading', { name: 'Welcome back' }).waitFor();
    await staff.page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
    await staff.page.goto(`${origin}/paralegal/admin`);
    await staff.page.waitForURL(`${origin}/paralegal/sign-in`);
    await staff.page.getByRole('heading', { name: 'Welcome back' }).waitFor();
    assert.deepEqual(staff.errors, []);
    assert.deepEqual(staff.externals, []);
  } finally {
    await staff.close();
  }
  log('prefixed intake, portal signed links/file navigation and staff sign-in');
}
