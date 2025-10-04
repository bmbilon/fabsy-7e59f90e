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

const ROOT = process.cwd();
const SCAN_DIRS = [
  path.join(ROOT, 'src'),
  path.join(ROOT, 'public', 'prerendered'),
  path.join(ROOT, 'prerendered'),
  path.join(ROOT, 'public') // include public root (exclude assets/images by extension)
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

// Helper to check if string includes a light color declaration
function hasLightColorDecl(s) {
  return /color\s*:\s*/i.test(s) && (LIGHT_HEX_TEXT.test(s) || LIGHT_RGB.test(s));
}

function hasLightBgDecl(s) {
  return /background(?:-color)?\s*:\s*/i.test(s) && (LIGHT_HEX_TEXT.test(s) || LIGHT_RGB.test(s));
}

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

  // 1) Inline style attributes combining light bg + light color
  // style={{ background: '#fff', color: '#fff' }} OR style="background:#fff; color:#fff"
  const inlineStyleCombos = [
    /style\s*=\s*\{[^}]*background[^}]*?(#fff|#ffffff|rgb\(\s*255\s*,)[^}]*color[^}]*?(#fff|#ffffff|rgb\(\s*255\s*,)[^}]*\}/gis,
    /style\s*=\s*"[^"]*background[^"}]*?(#fff|#ffffff|rgb\(\s*255\s*,)[^"]*color[^"}]*?(#fff|#ffffff|rgb\(\s*255\s*,)[^"]*"/gis,
  ];
  for (const re of inlineStyleCombos) {
    let m;
    while ((m = re.exec(s))) {
      issues.push({
        type: 'inline-style-combo',
        message: 'Inline style sets light background AND light text (low contrast).',
        excerpt: s.slice(Math.max(0, m.index - 120), Math.min(s.length, m.index + 200))
      });
    }
  }

  // 2) CSS-like blocks with light bg + light color near each other
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
