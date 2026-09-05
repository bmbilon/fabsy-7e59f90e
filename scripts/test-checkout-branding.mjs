import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";

// Execute the real Edge handler and its shared policy/pricing helpers. Only the
// HTTP server, Stripe SDKs and Supabase client are replaced. No Deno process,
// provider credentials, network requests, storage writes or real records exist.
const projectRoot = resolve(import.meta.dirname, "..");
const sdkVersions = { "18.5.0": "2025-08-27.basil", "19.1.0": "2025-09-30.clover" };
const compiled = await build({
  absWorkingDir: projectRoot,
  entryPoints: ["supabase/functions/create-payment/index.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  logLevel: "silent",
  plugins: [{
    name: "offline-checkout-provider-boundaries",
    setup(bundler) {
      const modules = {
        "https://deno.land/std@0.190.0/http/server.ts":
          "export const serve = handler => globalThis.boundaries.serve(handler);",
        "https://esm.sh/@supabase/supabase-js@2.57.4":
          "export const createClient = (...args) => globalThis.boundaries.createClient(...args);",
        ...Object.fromEntries(Object.keys(sdkVersions).map(sdk => [
          `https://esm.sh/stripe@${sdk}`,
          `export default class Stripe { constructor(...args) { return globalThis.boundaries.stripe(${JSON.stringify(sdk)}, ...args); } }`,
        ])),
      };
      bundler.onResolve({ filter: /^https?:\/\// }, ({ path }) => {
        if (!(path in modules)) throw new Error(`Unmocked remote dependency: ${path}`);
        return { path, namespace: "offline-checkout" };
      });
      bundler.onLoad({ filter: /.*/, namespace: "offline-checkout" }, ({ path }) => ({
        contents: modules[path], loader: "js",
      }));
    },
  }],
});

const ids = {
  submission: "11111111-1111-4111-8111-111111111111",
  client: "22222222-2222-4222-8222-222222222222",
  intent: "33333333-3333-4333-8333-333333333333",
  verification: "44444444-4444-4444-8444-444444444444",
  assessment: "55555555-5555-4555-8555-555555555555",
};
const accessToken = "synthetic-checkout-access-token-0000000000";
const digest = value => createHash("sha256").update(value).digest("hex");
const createdSession = {
  id: "cs_test_SYNTHETIC_BRANDING_12345678",
  url: "https://checkout.example.invalid/new-session",
  status: "open",
};
const oldSession = {
  id: "cs_test_SYNTHETIC_EXISTING_12345678",
  url: "https://checkout.example.invalid/existing-session",
  status: "open",
};
const environment = {
  SUPABASE_URL: "https://supabase.example.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role",
  STRIPE_SECRET_KEY: "sk_test_SYNTHETIC_OFFLINE_ONLY",
  SITE_URL: "https://fabsy.ca/",
  STRIPE_PHOTO_RADAR_PRICE_ID: "price_SYNTHETIC_PHOTO_RADAR",
  STRIPE_GST_TAX_RATE_ID: "txr_SYNTHETIC_GST",
  FABSY_LIVE_SERVICE_LOCALES: "es,pa",
};
const branding = {
  display_name: "Fabsy, a division of Execom Inc.",
  icon: { type: "url", url: "https://fabsy.ca/apple-touch-icon.png?v=4" },
  background_color: "#FFFFFF",
  button_color: "#0F172A",
  font_family: "inter",
  border_style: "rounded",
};

function fixture(options = {}) {
  const { addon = false, pro = false, photoRadar = false, locale = "en", draft = false, includedAssessment = false } = options;
  const sourceAssessmentId = includedAssessment ? ids.assessment : null;
  const submission = {
    id: ids.submission,
    client_id: ids.client,
    ticket_number: "SYNTHETIC-TICKET-001",
    status: "awaiting_payment",
    service_type: "representation",
    ticket_document_path: `${sourceAssessmentId || ids.submission}/ticket.pdf`,
    consent_form_path: `${ids.submission}/consent-form-${digest(accessToken).slice(0, 16)}.pdf`,
    representation_access_token_hash: digest(accessToken),
    source_assessment_id: sourceAssessmentId,
    representation_includes_assessment: includedAssessment,
    preferred_locale: locale,
    ticket_type: photoRadar ? "photo_radar" : "officer_issued",
    registered_owner_on_offence_date: photoRadar ? "yes" : null,
    order_type: photoRadar ? "photo_radar" : "rapid_resolution",
    review_path: photoRadar ? "ate" : "standard",
    declared_licence_class: pro ? "1" : null,
    pro_verified: pro,
    pro_verification_id: pro ? ids.verification : null,
    ref_code: "SYNTHETIC-REF",
    clients: { email: "buyer@example.invalid" },
  };
  const tables = {
    ticket_submissions: [submission],
    idr_checkout_intents: [],
    idr_orders: [],
    pro_licence_verifications: pro ? [{
      id: ids.verification,
      ticket_submission_id: ids.submission,
      status: "verified",
      declared_class: "1",
      read_class: "1",
      jurisdiction: "AB",
      identity_matches: true,
      expires_on: "9999-12-31",
    }] : [],
  };
  const storage = {
    "assessment-tickets": [submission.ticket_document_path],
    "consent-forms": [submission.consent_form_path],
    "assessment-policy-documents": [],
  };
  if (includedAssessment) {
    const policyPath = `${ids.assessment}/policy.pdf`;
    tables.ticket_submissions.push({
      id: ids.assessment,
      email: "buyer@example.invalid",
      service_type: "ticket_insurance_assessment",
      assessment_ticket_path: submission.ticket_document_path,
      assessment_policy_paths: [policyPath],
      review_consent: true,
      assessment_paid_at: null,
    });
    storage["assessment-policy-documents"].push(policyPath);
  }
  return {
    tables,
    storage,
    request: {
      submissionId: ids.submission,
      clientId: ids.client,
      accessToken,
      includeIdrAddon: addon,
      ...(addon ? { idrOrderId: ids.intent } : {}),
      ...(draft ? { draftId: ids.submission } : {}),
      // These browser claims must not change stored pricing or return language.
      preferredLocale: "ar",
      amount: 1,
      ticketType: photoRadar ? "officer_issued" : "photo_radar",
      branding_settings: { display_name: "Untrusted browser branding" },
      formData: {
        firstName: " Synthetic ", lastName: " Buyer ",
        email: " BUYER@EXAMPLE.INVALID ", ticketNumber: submission.ticket_number,
      },
    },
  };
}
function offlineHandler(data, { failLink = false, failFunnelWithdrawal = false } = {}) {
  const calls = { stripe: [], clients: [], queries: [], storage: [], rpc: [], unexpected: [], logs: [] };
  const sessions = new Map([[createdSession.id, structuredClone(createdSession)], [oldSession.id, structuredClone(oldSession)]]);
  function unexpected(message) {
    calls.unexpected.push(message);
    throw new Error(message);
  }
  // A small relational fake preserves filters and mutation results. Returning a
  // blanket success here would hide broken reservations and reuse decisions.
  function query(table) {
    if (!Object.hasOwn(data.tables, table)) return unexpected(`Unknown table: ${table}`);
    const filters = [];
    let operation = "select";
    let values;
    let selectFields;
    let execution;
    function execute(single) {
      if (execution) return execution;
      execution = Promise.resolve().then(() => {
        calls.queries.push(structuredClone({ table, operation, values, filters, selectFields }));
        if (failLink && table === "idr_checkout_intents" && operation === "update" && values.status === "open") {
          return { data: null, error: { message: "Synthetic link failure" } };
        }
        let rows;
        if (operation === "insert") {
          const row = { status: "creating", attempts: 1, stripe_checkout_session_id: null, ...structuredClone(values) };
          data.tables[table].push(row);
          rows = [row];
        } else {
          rows = data.tables[table].filter(row => filters.every(([kind, key, value]) => {
            if (kind === "eq" || kind === "is") return row[key] === value;
            if (kind === "neq") return row[key] !== value;
            if (kind === "in") return value.includes(row[key]);
            return unexpected(`Unknown query filter: ${kind}`);
          }));
          if (operation === "update") for (const row of rows) Object.assign(row, structuredClone(values));
        }
        if (single && (rows.length > 1 || (single === "required" && rows.length !== 1))) {
          return unexpected(`Expected one ${table} row, received ${rows.length}`);
        }
        return { data: structuredClone(single ? rows[0] ?? null : rows), error: null };
      });
      return execution;
    }
    const builder = {
      select(fields) { selectFields = fields; return builder; },
      insert(input) { operation = "insert"; values = input; return builder; },
      update(input) { operation = "update"; values = input; return builder; },
      maybeSingle() { return execute("optional"); },
      single() { return execute("required"); },
      then(resolve, reject) { return execute().then(resolve, reject); },
    };
    for (const kind of ["eq", "neq", "is", "in"]) {
      builder[kind] = (key, value) => { filters.push([kind, key, value]); return builder; };
    }
    return builder;
  }
  const admin = {
    from: query,
    storage: { from(bucket) {
      if (!Object.hasOwn(data.storage, bucket)) return unexpected(`Unknown bucket: ${bucket}`);
      return { async list(owner, options) {
        calls.storage.push(structuredClone({ bucket, owner, options }));
        return {
          data: data.storage[bucket]
            .filter(path => path.startsWith(`${owner}/`) && path.slice(owner.length + 1) === options.search)
            .map(path => ({ id: "synthetic-object", name: path.slice(owner.length + 1) })),
          error: null,
        };
      } };
    } },
    async rpc(name, params) {
      calls.rpc.push(structuredClone({ name, params }));
      if (!["clear_meta_checkout_attribution", "withdraw_paid_funnel_checkout", "claim_source_assessment_checkout", "release_source_assessment_checkout"].includes(name)) {
        return unexpected(`Unexpected RPC: ${name}`);
      }
      return { data: !(failFunnelWithdrawal && name === "withdraw_paid_funnel_checkout"), error: null };
    },
  };
  let handler;
  const boundaries = {
    serve(value) { assert.equal(handler, undefined); handler = value; },
    createClient(url, key, options) {
      assert.equal(url, environment.SUPABASE_URL);
      assert.equal(key, environment.SUPABASE_SERVICE_ROLE_KEY);
      assert.deepEqual(structuredClone(options), { auth: { persistSession: false, autoRefreshToken: false } });
      return admin;
    },
    stripe(sdk, key, options) {
      assert.equal(key, environment.STRIPE_SECRET_KEY);
      calls.clients.push(structuredClone({ sdk, options }));
      const method = (name, result) => async (...args) => {
        calls.stripe.push(structuredClone({ sdk, apiVersion: options.apiVersion, name, args }));
        return typeof result === "function" ? result(...args) : structuredClone(result);
      };
      return {
        checkout: { sessions: {
          create: method("checkout.sessions.create", createdSession),
          retrieve: method("checkout.sessions.retrieve", id => {
            if (!sessions.has(id)) return unexpected(`Unknown synthetic session: ${id}`);
            return structuredClone(sessions.get(id));
          }),
          expire: method("checkout.sessions.expire", id => {
            if (!sessions.has(id)) return unexpected(`Unknown synthetic session: ${id}`);
            sessions.get(id).status = "expired";
            return structuredClone(sessions.get(id));
          }),
        } },
        coupons: { retrieve: method("coupons.retrieve", { valid: true, percent_off: 20, amount_off: null, duration: "once" }) },
        prices: { retrieve: method("prices.retrieve", {
          active: true, unit_amount: 7900, currency: "cad", tax_behavior: "exclusive", type: "one_time",
          product: { name: "Rapid Resolution: Photo Radar" },
        }) },
        taxRates: { retrieve: method("taxRates.retrieve", { active: true, inclusive: false, percentage: 5, country: "CA", state: "AB" }) },
      };
    },
  };
  // No process, require, sockets or real fetch are exposed to the handler VM.
  runInNewContext(compiled.outputFiles[0].text, {
    boundaries,
    Deno: { env: { get: key => environment[key] }, serve: boundaries.serve },
    crypto: { subtle: webcrypto.subtle, randomUUID: () => ids.intent },
    Request, Response, URL, TextEncoder, TextDecoder,
    fetch: () => unexpected("Network access is forbidden in checkout tests"),
    console: Object.fromEntries(["log", "warn", "error"].map(level => [level, (...args) => calls.logs.push({ level, args })])),
  });
  assert.equal(typeof handler, "function");
  return {
    calls,
    sessions,
    async invoke() {
      const response = await handler(new Request("https://edge.example.invalid/create-payment", {
        method: "POST",
        headers: { origin: "https://fabsy.ca", "content-type": "application/json", "user-agent": "SyntheticOfflineTest" },
        body: JSON.stringify(data.request),
      }));
      assert.deepEqual(calls.unexpected, [], "every provider/network boundary must be explicitly mocked");
      return { status: response.status, body: await response.json() };
    },
  };
}

function expectedParams(options = {}) {
  const { addon = false, pro = false, photoRadar = false, locale = "en", draft = false, includedAssessment = false, attempt = 1 } = options;
  const metadata = {
    preferred_locale: locale,
    ticket_number: "SYNTHETIC-TICKET-001",
    customer_name: "Synthetic Buyer",
    submission_id: ids.submission,
    ticket_submission_id: ids.submission,
    client_id: ids.client,
    ticket_base_cents: photoRadar ? "7900" : "19800",
    checkout_intent_id: ids.intent,
    checkout_attempt: String(attempt),
    fabsy_checkout_kind: photoRadar ? "photo_radar" : addon ? "ticket_with_addon" : "ticket_only",
    fabsy_product: photoRadar ? "photo_radar" : addon ? "rapid_resolution_bundle" : "rapid_resolution",
    fabsy_pricing_version: photoRadar ? "photo_radar_2026_08" : "rapid_resolution_2026_08",
    ticket_type: photoRadar ? "photo_radar" : "officer_issued",
    order_type: photoRadar ? "photo_radar" : "rapid_resolution",
    review_path: photoRadar ? "ate" : "standard",
    representation_includes_assessment: String(includedAssessment),
    ...(photoRadar ? {
      gst_cents: "395", total_cents: "8295", tax_behavior: "exclusive", registered_owner_on_offence_date: "yes",
    } : {
      pro_pricing_version: "pro_drivers_2026_08",
      pro_coupon: pro ? "PRO20" : "",
      pro_verification_id: pro ? ids.verification : "",
      pro_discount_cents: pro ? addon ? "4580" : "3960" : "0",
    }),
    ref_code: "SYNTHETIC-REF",
    ...(includedAssessment ? { source_assessment_id: ids.assessment } : {}),
    ...(addon ? {
      idr_order_id: ids.intent,
      idr_client_id: ids.client,
      idr_type: "addon",
      idr_checkout_kind: "ticket_with_addon",
      idr_price_cents: "3100",
    } : {}),
  };
  const lineItems = photoRadar ? [{
    quantity: 1, price: "price_SYNTHETIC_PHOTO_RADAR", tax_rates: ["txr_SYNTHETIC_GST"],
  }] : [{
    quantity: 1,
    price_data: {
      currency: "cad", tax_behavior: "exclusive", unit_amount: 19800,
      product_data: {
        name: "Fabsy Rapid Resolution",
        description: "Eligible Alberta traffic ticket pre-trial resolution service. Trial services are excluded and quoted separately.",
        metadata: { fabsy_product: "rapid_resolution", fabsy_pricing_version: "rapid_resolution_2026_08" },
      },
    },
  }];
  if (addon) lineItems.push({
    quantity: 1,
    price_data: {
      currency: "cad", tax_behavior: "exclusive", unit_amount: 3100,
      product_data: {
        name: "Fabsy Insurance Impact & Renewal Planning Report Add-on",
        description: "This report is consumer research based on publicly available information. Fabsy is not an insurance agent or broker and does not sell, quote, or place insurance.",
        metadata: { fabsy_product: "insurance_impact_review_addon", fabsy_pricing_version: "rapid_resolution_2026_08" },
      },
    },
  });
  const prefix = locale === "en" ? "" : `/${locale}`;
  return {
    ...(photoRadar ? {} : { branding_settings: branding }),
    customer_email: "buyer@example.invalid",
    client_reference_id: ids.submission,
    line_items: lineItems,
    mode: "payment",
    payment_method_types: ["card"],
    ...(pro ? { discounts: [{ coupon: "PRO20" }] } : { allow_promotion_codes: false }),
    automatic_tax: { enabled: !photoRadar },
    tax_id_collection: { enabled: false },
    success_url: addon
      ? `https://fabsy.ca/insurance-damage-report/intake?checkout=success&order_id=${ids.intent}&session_id={CHECKOUT_SESSION_ID}`
      : `https://fabsy.ca${prefix}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `https://fabsy.ca${prefix}/payment-canceled${draft ? `?draft=${ids.submission}` : ""}`,
    metadata,
    payment_intent_data: { metadata: structuredClone(metadata) },
  };
}

function assertSdkScope(calls, { creates = 1, photoRadar = false } = {}) {
  assert.deepEqual(calls.clients, [
    { sdk: "18.5.0", options: { apiVersion: "2025-08-27.basil" } },
    ...(creates && !photoRadar ? [{ sdk: "19.1.0", options: { apiVersion: "2025-09-30.clover" } }] : []),
  ]);
  for (const call of calls.stripe) {
    const expectedSdk = call.name === "checkout.sessions.create" && !photoRadar ? "19.1.0" : "18.5.0";
    assert.equal(call.sdk, expectedSdk, `${call.name} must use SDK ${expectedSdk}`);
    assert.equal(call.apiVersion, sdkVersions[expectedSdk], `${call.name} must retain its scoped API version`);
  }
  assert.equal(calls.stripe.filter(call => call.name === "checkout.sessions.create").length, creates);
}

function existingIntent(options = {}) {
  return {
    id: ids.intent, client_id: ids.client, ticket_submission_id: ids.submission,
    type: "ticket", checkout_kind: "ticket_only", expected_amount_cents: 19800,
    purchaser_email: "buyer@example.invalid", stripe_checkout_session_id: oldSession.id,
    status: "open", attempts: 2,
    pro_verification_id: null, pro_coupon: null, pro_discount_cents: 0, pro_subtotal_cents: 19800,
    ...options,
  };
}

for (const [label, options] of [
  ["ordinary officer ticket", {}],
  ["officer ticket with IDR addon", { addon: true }],
  ["verified pro officer ticket", { pro: true }],
  ["verified pro officer ticket with IDR addon", { pro: true, addon: true }],
  ["Photo Radar with the fixed price and explicit GST", { photoRadar: true }],
  ["Photo Radar resumed from a saved draft", { photoRadar: true, draft: true }],
  ["localized officer ticket resumed from a saved draft", { locale: "es", draft: true }],
  ["localized addon with English portal and localized draft cancellation", { locale: "pa", addon: true, draft: true }],
  ["officer ticket with an included assessment", { includedAssessment: true }],
]) {
  test(`${label}: full Checkout request preserves money, tax, metadata, URLs and product-specific branding`, async () => {
    const data = fixture(options);
    const harness = offlineHandler(data);
    const result = await harness.invoke();
    assert.deepEqual(result, {
      status: 200,
      body: { url: createdSession.url, checkoutIntentId: ids.intent, idrOrderId: options.addon ? ids.intent : null },
    });
    assertSdkScope(harness.calls, options);
    const create = harness.calls.stripe.find(call => call.name === "checkout.sessions.create");
    assert.deepEqual(create.args, [expectedParams(options), { idempotencyKey: `ticket-checkout:${ids.intent}:1` }]);
    if (options.photoRadar) {
      assert.equal(Object.hasOwn(create.args[0], "branding_settings"), false, "Photo Radar must retain its unchanged Basil payload");
    } else {
      assert.equal(Object.hasOwn(create.args[0].branding_settings, "logo"), false, "Clover 19.1 must not receive logo and icon together");
    }
    const intent = data.tables.idr_checkout_intents[0];
    assert.equal(intent.stripe_checkout_session_id, createdSession.id);
    assert.equal(intent.status, "open");
    assert.equal(intent.expected_amount_cents, options.photoRadar ? 7900 : options.addon ? 3100 : 19800);
    assert.equal(intent.pro_discount_cents, options.pro ? options.addon ? 4580 : 3960 : 0);
    assert.equal(intent.pro_subtotal_cents, options.photoRadar ? null : options.addon ? 22900 : 19800);
    const reads = harness.calls.stripe.filter(call => call.name !== "checkout.sessions.create").map(({ name, args }) => ({ name, args }));
    assert.deepEqual(reads, options.photoRadar ? [
      { name: "prices.retrieve", args: ["price_SYNTHETIC_PHOTO_RADAR", { expand: ["product"] }] },
      { name: "taxRates.retrieve", args: ["txr_SYNTHETIC_GST"] },
    ] : options.pro ? [{ name: "coupons.retrieve", args: ["PRO20"] }] : []);
    assert.equal(harness.calls.logs.length, 0);
  });
}

for (const photoRadar of [false, true]) {
  const productName = photoRadar ? "Photo Radar" : "Rapid Resolution";
  test(`stored ${productName} classification controls the SDK and branding despite conflicting browser fields`, async () => {
    const data = fixture({ photoRadar });
    const forgedType = photoRadar ? "officer_issued" : "photo_radar";
    Object.assign(data.request, {
      ticket_type: forgedType,
      ticketType: forgedType,
      isPhotoRadar: !photoRadar,
      product: photoRadar ? "rapid_resolution" : "photo_radar",
      branding_settings: { display_name: "Browser-controlled merchant", logo: { type: "url", url: "https://example.invalid/logo.png" } },
    });
    Object.assign(data.request.formData, {
      ticket_type: forgedType,
      ticketType: forgedType,
      branding_settings: data.request.branding_settings,
    });
    const harness = offlineHandler(data);
    assert.equal((await harness.invoke()).status, 200);
    assertSdkScope(harness.calls, { photoRadar });
    const create = harness.calls.stripe.find(call => call.name === "checkout.sessions.create");
    assert.deepEqual(create.args, [expectedParams({ photoRadar }), { idempotencyKey: `ticket-checkout:${ids.intent}:1` }]);
    assert.equal(create.apiVersion, photoRadar ? "2025-08-27.basil" : "2025-09-30.clover");
    assert.equal(Object.hasOwn(create.args[0], "branding_settings"), !photoRadar);
    assert.equal(create.args[0].metadata.ticket_type, photoRadar ? "photo_radar" : "officer_issued");
  });

  test(`an existing open ${productName} checkout is reused without creating or upgrading its session`, async () => {
    const data = fixture({ photoRadar });
    const intent = existingIntent(photoRadar ? {
      type: "photo_radar", checkout_kind: "photo_radar", expected_amount_cents: 7900, pro_subtotal_cents: null,
    } : {});
    data.tables.idr_checkout_intents.push(structuredClone(intent));
    const harness = offlineHandler(data);
    assert.deepEqual(await harness.invoke(), {
      status: 200,
      body: { url: oldSession.url, checkoutIntentId: ids.intent, idrOrderId: null, reused: true },
    });
    assertSdkScope(harness.calls, { creates: 0, photoRadar });
    assert.deepEqual(harness.calls.stripe.map(({ name, args }) => ({ name, args })), [
      { name: "checkout.sessions.retrieve", args: [oldSession.id] },
    ]);
    assert.deepEqual(data.tables.idr_checkout_intents, [intent]);
    assert.equal(harness.calls.queries.some(call => call.operation !== "select"), false);
  });
}

test("changing an existing selection expires on Basil and creates the next attempt on Clover", async () => {
  const data = fixture({ addon: true });
  data.tables.idr_checkout_intents.push(existingIntent());
  const harness = offlineHandler(data);
  const result = await harness.invoke();
  assert.equal(result.status, 200);
  assertSdkScope(harness.calls);
  assert.deepEqual(harness.calls.stripe.map(call => call.name), [
    "checkout.sessions.retrieve", "checkout.sessions.expire", "checkout.sessions.create",
  ]);
  assert.deepEqual(harness.calls.stripe[2].args, [
    expectedParams({ addon: true, attempt: 3 }), { idempotencyKey: `ticket-checkout:${ids.intent}:3` },
  ]);
  assert.equal(harness.sessions.get(oldSession.id).status, "expired");
  assert.equal(data.tables.idr_checkout_intents[0].attempts, 3);
});

for (const [label, failure, expectedStatus] of [
  ["reservation linking fails", { failLink: true }, 500],
  ["a downstream privacy withdrawal fails", { failFunnelWithdrawal: true }, 503],
]) {
  test(`${label}: the new checkout is retrieved and expired using the existing Basil client`, async () => {
    const harness = offlineHandler(fixture({ includedAssessment: true }), failure);
    assert.deepEqual(await harness.invoke(), { status: expectedStatus, body: { error: "Unable to create secure checkout." } });
    assertSdkScope(harness.calls);
    assert.deepEqual(harness.calls.stripe.map(({ name, args }) => ({ name, args })), [
      { name: "checkout.sessions.create", args: [expectedParams({ includedAssessment: true }), { idempotencyKey: `ticket-checkout:${ids.intent}:1` }] },
      { name: "checkout.sessions.retrieve", args: [createdSession.id] },
      { name: "checkout.sessions.expire", args: [createdSession.id] },
    ]);
    assert.equal(harness.sessions.get(createdSession.id).status, "expired");
    const release = harness.calls.rpc.find(call => call.name === "release_source_assessment_checkout");
    assert.deepEqual(release?.params, {
      p_checkout_intent_id: ids.intent,
      p_checkout_attempt: 1,
      p_stripe_checkout_session_id: createdSession.id,
      p_intent_status: "failed",
    });
  });
}
