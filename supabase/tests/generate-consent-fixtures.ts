import { createConsentPdf } from "../functions/_shared/consent-pdf.ts";
import { CONSENT_FIXTURE_DATE, CONSENT_FIXTURES } from "./consent-fixtures.ts";

// Synthetic, local-only rendering fixtures. Never imports a Supabase handler.
const output = Deno.args[0];
if (!output) throw new Error("Pass a local output directory for the synthetic PDFs.");
await Deno.mkdir(output, { recursive: true });
for (const fixture of CONSENT_FIXTURES) {
  const started = performance.now();
  const bytes = await createConsentPdf(fixture.fields, fixture.locale, new Date(CONSENT_FIXTURE_DATE));
  await Deno.writeFile(`${output}/consent-${fixture.name}.pdf`, bytes);
  console.log(`${fixture.name}: ${bytes.length} bytes; ${Math.round(performance.now() - started)} ms`);
}
await Deno.writeTextFile(`${output}/expected-original-fields.json`, JSON.stringify(CONSENT_FIXTURES, null, 2));
