#!/usr/bin/env node
// Simple parity validator: ensures each FAQ q/a appears verbatim inside jsonld field of each JSON page.
// Usage: node scripts/validate-faq-parity.js [dir_or_pattern]
// Default: ssg-pages/*.json

import fs from 'fs';
import path from 'path';

const patterns = process.argv.slice(2).length ? process.argv.slice(2) : ['ssg-pages'];
let files = [];

patterns.forEach(p => {
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
    const dirFiles = fs.readdirSync(p).filter(f => f.endsWith('.json')).map(f => path.join(p, f));
    files = files.concat(dirFiles);
  } else {
    // treat as glob-like simple pattern a/*.json
    if (p.indexOf('*') !== -1) {
      const dir = path.dirname(p);
      const base = path.basename(p).replace('*', '');
      if (fs.existsSync(dir)) {
        const dirFiles = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f.includes(base)).map(f => path.join(dir, f));
        files = files.concat(dirFiles);
      }
    } else if (fs.existsSync(p) && p.endsWith('.json')) {
      files.push(p);
    }
  }
});

if (files.length === 0) {
  console.error('No JSON files found with patterns:', patterns);
  process.exit(2);
}

let failed = false;

files.forEach(f => {
  try {
    const raw = fs.readFileSync(f, 'utf8');
    const obj = JSON.parse(raw);
    const faqs = obj.faqs || [];
    const jsonld = (obj.jsonld || obj.jsonLd || obj.jsonLD || '') + '';
    if (!jsonld) {
      console.error(`[ERROR] ${f}: missing jsonld field`);
      failed = true;
      return;
    }
    if (!Array.isArray(faqs) || faqs.length < 6) {
      console.error(`[ERROR] ${f}: faqs array missing or < 6 (found ${faqs.length})`);
      failed = true;
    }
    for (let i = 0; i < Math.min(6, faqs.length); i++) {
      const q = faqs[i].q || '';
      const a = faqs[i].a || '';
      if (!q || !a) {
        console.error(`[ERROR] ${f}: faq #${i+1} missing q or a`);
        failed = true;
        continue;
      }
      if (!jsonld.includes(q)) {
        console.error(`[ERROR] ${f}: question not verbatim in jsonld -> ${q.substring(0,80)}`);
        failed = true;
      }
      if (!jsonld.includes(a)) {
        console.error(`[ERROR] ${f}: answer not verbatim in jsonld -> ${a.substring(0,80)}`);
        failed = true;
      }
      const alen = a.replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length;
      if (alen < 20 || alen > 50) {
        console.warn(`[WARN] ${f}: faq #${i+1} answer wordcount ${alen} (recommended 20-50)`);
      }
    }
    console.log(`[OK] ${f}`);
  } catch (e) {
    console.error(`[ERROR] failed to read/parse ${f}: ${e.message}`);
    failed = true;
  }
});

if (failed) {
  console.error('Parity validation FAILED.');
  process.exit(1);
}
console.log('All files validated.');
process.exit(0);
