#!/usr/bin/env node
/*
  Contrast Guard - blocks light text on light backgrounds from entering the build.
  - Scans source and prerendered HTML/CSS/JSX/TSX for common low-contrast combos
  - Exits non-zero with a helpful report if violations are found
  - Skip a file by adding the literal string: CONTRAST-GUARD:ALLOW (use sparingly)

  Heuristics (balanced to avoid false positives but still catch the big mistakes):
  - Inline style attributes that set both a light background and light text
  - CSS rules that contain a light background and a light color within the same block-ish window
  - Tailwind-style class combos like bg-white + text-white (or bg-*-50 + text-*-100)
*/

const fs = require('fs');
const path = require('path');

// Optional: use colord a11y plugin if available
let colord = null;
try {
  const c = require('colord');
  try { c.extend([require('colord/plugins/a11y')]); } catch {}
  colord = c.colord || c;
} catch {}

function parseColor(input) {
  if (!input) return null;
  let s = String(input).trim().toLowerCase();
  // hex #fff or #ffffff
  const hexMatch = s.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i);
  if (hexMatch) {
    let hex = hexMatch[0];
    if (hex.length === 4) {
      hex = '#' + hex.slice(1).split('').map(ch => ch + ch).join('');
    }
    return hex;
  }
  // rgb(r,g,b)
  const rgb = s.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (rgb) {
    const r = Math.max(0, Math.min(255, parseInt(rgb[1], 10)));
    const g = Math.max(0, Math.min(255, parseInt(rgb[2], 10)));
    const b = Math.max(0, Math.min(255, parseInt(rgb[3], 10)));
    const toHex = (n) => ('0' + n.toString(16)).slice(-2);
    return '#' + toHex(r) + toHex(g) + toHex(b);
  }
  return null;
}

function luminance(hex) {
  hex = hex.replace('#', '');
  const r = parseInt(hex.slice(0,2),16) / 255;
  const g = parseInt(hex.slice(2,4),16) / 255;
  const b = parseInt(hex.slice(4,6),16) / 255;
  const toLin = (c) => c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
  const R = toLin(r), G = toLin(g), B = toLin(b);
  return 0.2126*R + 0.7152*G + 0.0722*B;
}

function contrastRatio(fg, bg) {
  if (colord && colord(fg).isValid() && colord(bg).isValid() && colord(fg).contrast) {
    // colord a11y plugin provides contrast
    return colord(fg).contrast(bg);
    }
  const L1 = luminance(fg);
  const L2 = luminance(bg);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

const ROOT = process.cwd();
const SCAN_DIRS = [
  path.join(ROOT, 'src'),
  path.join(ROOT, 'prerendered') // scan source prerendered pages, not stale public copies
];

const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'dist', '.vite', '.next', 'build', 'coverage',
  'assets', 'images', 'img', 'fonts', 'sitemaps'
]);

const INCLUDE_EXT = new Set(['.tsx', '.ts', '.jsx', '.js', '.html', '.css']);

// Very light text or backgrounds
const LIGHT_HEX_TEXT = /#fff(f{0,3})?\b|#f{3}\b|#fefefe\b|#fafafa\b|#f5f5f5\b/i;
const LIGHT_RGB = /rgb\s*\(\s*255\s*,\s*25[0-5]\s*,\s*25[0-5]\s*\)/i; // r=255 indicates very light
const LIGHT_TEXT_TW = /text-(white|zinc-100|neutral-100|gray-100|slate-100|stone-100)\b/;
const LIGHT_BG_TW = /bg-(white|zinc-50|neutral-50|gray-50|slate-50|stone-50)\b/;

function listFiles(dir) {
  const out = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (EXCLUDE_DIRS.has(ent.name)) continue;
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) {
        walk(p);
      } else {
        const ext = path.extname(ent.name).toLowerCase();
        if (INCLUDE_EXT.has(ext)) out.push(p);
      }
    }
  }
  walk(dir);
  return out;
}

function scanFile(p) {
  const s = fs.readFileSync(p, 'utf8');
  if (s.includes('CONTRAST-GUARD:ALLOW')) return [];

  const issues = [];

  // 1) Inline style attributes combining bg + text color → compute contrast
  const inlineStyleBlocks = [
    /style\s*=\s*\{([^}]*)\}/gis,
    /style\s*=\s*"([^"]*)"/gis,
  ];
  for (const re of inlineStyleBlocks) {
    let m;
    while ((m = re.exec(s))) {
      const block = m[1] || '';
      const bgMatch = block.match(/background(?:-color)?\s*:\s*([^;\n]+?)(;|,|\n|$)/i);
      const colorMatch = block.match(/color\s*:\s*([^;\n]+?)(;|,|\n|$)/i);
      if (bgMatch && colorMatch) {
        const bgCol = parseColor(bgMatch[1]);
        const fgCol = parseColor(colorMatch[1]);
        if (bgCol && fgCol) {
          const ratio = contrastRatio(fgCol, bgCol);
          if (ratio < 4.5) {
            issues.push({
              type: 'inline-contrast',
              message: `Inline style contrast ${ratio.toFixed(2)} < 4.5 (WCAG AA)`,
              excerpt: block.slice(0, 200)
            });
          }
        }
      }
    }
  }

  // 2) CSS-like blocks with light bg + light color near each other (heuristic)
  const windowRegexes = [
    /background[^;{}]*?(#fff|#ffffff|rgb\(\s*255\s*,)[\s\S]{0,300}?color[^;{}]*?(#fff|#ffffff|rgb\(\s*255\s*,)/gi,
    /color[^;{}]*?(#fff|#ffffff|rgb\(\s*255\s*,)[\s\S]{0,300}?background[^;{}]*?(#fff|#ffffff|rgb\(\s*255\s*,)/gi,
  ];
  for (const re of windowRegexes) {
    let m;
    while ((m = re.exec(s))) {
      issues.push({
        type: 'css-combo',
        message: 'CSS rule pairs light background with light text (low contrast).',
        excerpt: s.slice(Math.max(0, m.index - 120), Math.min(s.length, m.index + 200))
      });
    }
  }

  // 3) Tailwind class combos within the same class/className attribute
  const classAttrRe = /(className|class)\s*=\s*("|')(.*?)\2/gi;
  let cm;
  while ((cm = classAttrRe.exec(s))) {
    const content = cm[3];
    if (LIGHT_BG_TW.test(content) && LIGHT_TEXT_TW.test(content)) {
      issues.push({
        type: 'tailwind-combo',
        message: 'Found Tailwind light background + light text combo (e.g., bg-white + text-white).',
        excerpt: content
      });
    }
  }

  return issues;
}

function main() {
  const files = SCAN_DIRS.flatMap(listFiles).filter((p, i, a) => a.indexOf(p) === i);
  const allIssues = [];

  for (const f of files) {
    try {
      const issues = scanFile(f);
      if (issues.length) {
        allIssues.push({ file: f, issues });
      }
    } catch (e) {
      // ignore unreadable files
    }
  }

  if (allIssues.length) {
    console.error('\n✖ Contrast Guard failed: light text on light background detected.');
    for (const entry of allIssues) {
      console.error(`\nFile: ${path.relative(ROOT, entry.file)}`);
      for (const iss of entry.issues) {
        console.error(` - ${iss.type}: ${iss.message}`);
        if (iss.excerpt) {
          const ex = String(iss.excerpt).replace(/\n/g, ' ');
          console.error(`   …${ex.slice(0, 200)}…`);
        }
      }
    }
    console.error('\nFix the above or add CONTRAST-GUARD:ALLOW in a file to explicitly bypass (not recommended).');
    process.exit(1);
  } else {
    console.log('✓ Contrast Guard passed.');
  }
}

main();
