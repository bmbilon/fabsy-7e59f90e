// Screenshots rendered email previews (see render-emails.mjs).
//   node scripts/anderhue-qa/shoot-emails.mjs <previewDir> <outDir> [file ...]
// https://anderhue.ca/crest-email.png is served from the repository copy.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

const [previewDir, outDir, ...only] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const crest = fs.readFileSync('ontario/anderhue-paralegal-site/crest-email.png');
async function launch() {
  try { return await chromium.launch(); } catch (error) {
    const root = '/opt/pw-browsers';
    const candidates = fs.existsSync(root) ? fs.readdirSync(root).flatMap(dir => [
      path.join(root, dir, 'chrome-linux', 'chrome'), path.join(root, dir, 'chrome-linux64', 'chrome')]) : [];
    const executablePath = candidates.find(file => fs.existsSync(file));
    if (!executablePath) throw error;
    return chromium.launch({ executablePath });
  }
}
const browser = await launch();
const files = only.length ? only : fs.readdirSync(previewDir).filter(file => file.endsWith('.html') && file !== 'index.html');
for (const width of [700, 375]) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.route('https://anderhue.ca/crest-email.png', route => route.fulfill({ contentType: 'image/png', body: crest }));
  const page = await context.newPage();
  for (const file of files) {
    await page.goto(pathToFileURL(path.join(previewDir, file)).href);
    await page.screenshot({ path: path.join(outDir, `${path.basename(file, '.html')}-${width}.png`), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) console.log(`overflow at ${width}px: ${file}`);
  }
  await context.close();
}
await browser.close();
console.log(`Screenshots in ${outDir}`);
