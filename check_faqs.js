import { JSDOM } from 'jsdom';

const domain = process.env.DOMAIN || 'https://fabsy.ca';
const pages = [
  '/faq',
  '/how-it-works',
  '/fight-speeding-ticket-calgary',
  '/fight-speeding-ticket-edmonton',
  '/fight-speeding-ticket-red-deer',
  '/fight-speeding-ticket-lethbridge',
  '/fight-speeding-ticket-medicine-hat'
];

(async () => {
  for (const p of pages) {
    const url = domain.replace(/\/$/, '') + p;
    process.stdout.write(`\nChecking ${url}\n`);
    try {
      const res = await fetch(url, { timeout: 15000 });
      if (!res.ok) {
        console.log(`  HTTP ${res.status} - skipping`);
        continue;
      }
      const html = await res.text();
      const dom = new JSDOM(html);
      const doc = dom.window.document;

      const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))
                           .map(s => (s.textContent || '').trim())
                           .filter(Boolean);
      console.log(`  JSON-LD script tags found: ${scripts.length}`);

      // find FAQPage JSON-LD
      let faqObj = null;
      for (const s of scripts) {
        try {
          const obj = JSON.parse(s);
          if (obj && obj['@type'] === 'FAQPage') { faqObj = obj; break; }
          if (Array.isArray(obj)) {
            const found = obj.find(i => i && i['@type'] === 'FAQPage');
            if (found) { faqObj = found; break; }
          }
        } catch (e) {
          // ignore parse errors for non-json content
        }
      }

      if (!faqObj) {
        console.log('  FAQPage JSON-LD: NOT FOUND');
        continue;
      }

      const qEntities = Array.isArray(faqObj.mainEntity) ? faqObj.mainEntity : [];
      console.log(`  FAQPage JSON-LD: FOUND with ${qEntities.length} question(s)`);

      const bodyText = (doc.body.textContent || '').replace(/\s+/g, ' ').trim();

      let allFound = true;
      for (let i = 0; i < qEntities.length; i++) {
        const qname = (qEntities[i].name || '').trim();
        if (!qname) {
          console.log(`   - Q${i+1}: empty question text in JSON-LD`);
          allFound = false;
          continue;
        }
        const found = bodyText.includes(qname);
        console.log(`   - Q${i+1}: ${qname.slice(0,120)} ${found ? '✅ found in visible HTML' : '❌ MISSING in visible HTML'}`);
        if (!found) allFound = false;
      }

      if (allFound) {
        console.log('  ✅ All FAQ questions present verbatim in visible HTML');
      } else {
        console.log('  ⚠️ Some FAQ questions are missing verbatim in visible HTML — exact-match parity broken');
      }
    } catch (err) {
      console.log('  ERROR:', err.message);
    }
  }
  process.exit(0);
})();