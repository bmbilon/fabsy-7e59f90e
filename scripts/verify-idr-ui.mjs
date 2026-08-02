import { chromium } from "playwright";

const baseUrl = (process.argv[2] || "http://127.0.0.1:8080").replace(/\/$/, "");
const browser = await chromium.launch({ headless: true });
const checks = [];

async function verify(path, assertions, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location();
      if (["stats.g.doubleclick.net", "www.google-analytics.com"].some((host) => location.url.includes(host))) {
        return;
      }
      errors.push(`console: ${message.text()}${location.url ? ` at ${location.url}` : ""}`);
    }
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));

  const response = await page.goto(`${baseUrl}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 20_000,
  });
  await page.waitForTimeout(500);
  if (!response?.ok()) throw new Error(`${path} returned ${response?.status() || "no response"}.`);
  const body = (await page.locator("body").innerText()).trim();
  if (!body) throw new Error(`${path} rendered a blank page.`);
  if (await page.locator(".vite-error-overlay, #webpack-dev-server-client-overlay").count()) {
    throw new Error(`${path} rendered a Vite error overlay.`);
  }
  await assertions(page, body);
  if (errors.length) throw new Error(`${path} browser errors:\n${errors.join("\n")}`);
  checks.push(`${path} at ${viewport.width}px`);
  await context.close();
}

try {
  await verify("/insurance-damage-report", async (page, body) => {
    for (const expected of ["$129", "$99", "$488", "30%"]) {
      if (!body.includes(expected)) throw new Error(`Product page is missing ${expected}.`);
    }
    if (!body.toLowerCase().includes("carriers worth calling")) {
      throw new Error("Product page is missing the carrier-call framing.");
    }
    const disclaimer = "This report is consumer research based on publicly available information. Fabsy is not an insurance agent or broker and does not sell, quote, or place insurance.";
    if (!body.includes(disclaimer)) throw new Error("Product page is missing the exact disclaimer.");
    if (await page.getByRole("link", { name: /Get the standalone report for \$129/i }).count() !== 1) {
      throw new Error("Standalone report call to action is unavailable.");
    }
    const faqSchema = await page.locator('script[type="application/ld+json"][data-faq="true"]').textContent();
    const parsed = faqSchema ? JSON.parse(faqSchema) : null;
    if (parsed?.mainEntity?.length !== 6) throw new Error("FAQ schema does not contain six questions.");
  });

  await verify("/insurance-damage-report/checkout", async (page, body) => {
    if (!body.includes("Standalone report checkout") || !body.includes("$129 CAD")) {
      throw new Error("Standalone checkout summary is incomplete.");
    }
    for (const id of ["idr-first-name", "idr-last-name", "idr-email", "idr-phone", "idr-terms"]) {
      if (await page.locator(`#${id}`).count() !== 1) throw new Error(`Checkout is missing ${id}.`);
    }
  });

  await verify("/portal/cases", async (page, body) => {
    if (!body.includes("Access your private IDR portal") || !body.includes("Purchase email")) {
      throw new Error("Private portal access gate did not render.");
    }
  });

  await verify("/submit-ticket", async (_page, body) => {
    if (!body.includes("$488") || !body.includes("30%")) {
      throw new Error("Core ticket flow does not disclose the $488 base fee plus 30% success fee.");
    }
  });

  await verify(
    "/insurance-damage-report",
    async (page) => {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (overflow) throw new Error("Product page has horizontal overflow on mobile.");
    },
    { width: 390, height: 844 },
  );

  console.log(`IDR browser verification passed (${checks.join(", ")}).`);
} finally {
  await browser.close();
}
