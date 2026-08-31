import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

// Render the real guide panel and production slug selector without network access.
const directory = await mkdtemp(join(tmpdir(), "fabsy-photo-radar-answer-box-"));
try {
  const bundle = join(directory, "answer-box-tests.cjs");
  await build({
    absWorkingDir: resolve(import.meta.dirname, ".."),
    stdin: {
      sourcefile: "photo-radar-answer-box-tests.tsx",
      resolveDir: resolve(import.meta.dirname, ".."),
      loader: "tsx",
      contents: `
        import assert from 'node:assert/strict';
        import test from 'node:test';
        import React from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import { StaticRouter } from 'react-router-dom/server';
        import AnswerBox from './src/components/AnswerBox';
        import { isPhotoRadarContentSlug } from './src/lib/photo-radar-pages';

        const render = props => renderToStaticMarkup(<StaticRouter location="/content/example"><AnswerBox {...props} /></StaticRouter>);
        const guides = [
          ['photo-radar-ticket-alberta', 'Alberta'],
          ['photo-radar-ticket-edmonton', 'Edmonton'],
          ['fight-photo-radar-ticket-calgary', 'Calgary'],
        ];
        for (const [slug, city] of guides) {
          test(slug + ' offers the fine-only $79 service and overrides an old generic CTA', () => {
            const html = render({ offence: 'photo radar', city, ctaHref: '/submit-ticket', photoRadar: isPhotoRadarContentSlug(slug) });
            assert.ok(html.includes('href="/photo-radar"'));
            assert.ok(html.includes('Photo Radar - $79 + GST'));
            assert.ok(html.includes('$82.95 total'));
            assert.match(html, /no demerits/i);
            assert.match(html, /no insurance impact/i);
            assert.ok(html.includes('Only the fine is on the table.'));
            assert.ok(html.includes('An Insurance Impact Report is not included or needed.'));
            assert.ok(html.includes('You approve any deal. No trial. No success fee.'));
            assert.ok(html.includes('No outcome is promised.'));
            assert.ok(html.includes('48 hours after complete disclosure'));
            assert.ok(!html.includes('$198'));
            assert.ok(!html.includes('href="/submit-ticket"'));
            assert.ok(!html.includes('what a conviction could mean'));
          });
        }

        test('officer guides retain the $198 service, their supplied route and conviction context', () => {
          const html = render({ offence: 'red-light', city: 'Edmonton', ctaHref: '/submit-ticket', photoRadar: isPhotoRadarContentSlug('red-light-ticket-edmonton') });
          assert.ok(html.includes('Rapid Resolution - $198'));
          assert.ok(html.includes('href="/submit-ticket"'));
          assert.ok(html.includes('what a conviction could mean'));
          assert.ok(!html.includes('$79'));
          assert.ok(!html.includes('href="/photo-radar"'));
        });

        test('camera words and unreviewed photo-like slugs alone cannot activate the new offer', () => {
          for (const slug of ['speeding-ticket-calgary-photo-radar', 'photo-radar-ticket-calgary-other']) {
            const html = render({ offence: 'photo-radar', city: 'Calgary', photoRadar: isPhotoRadarContentSlug(slug) });
            assert.ok(html.includes('Rapid Resolution - $198'));
            assert.ok(html.includes('href="/rapid-resolution"'));
            assert.ok(!html.includes('$79'));
          }
          assert.ok(render({ offence: 'photo-radar', city: 'Calgary' }).includes('Rapid Resolution - $198'));
        });
      `,
    },
    outfile: bundle,
    bundle: true,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
    logLevel: "silent",
  });
  await import(pathToFileURL(bundle).href);
} finally {
  await rm(directory, { recursive: true, force: true });
}
