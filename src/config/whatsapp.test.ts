import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFabsyWhatsAppUrl,
  FABSY_WHATSAPP_NUMBER,
} from "./whatsapp.ts";

test("Fabsy's vanity number maps to the WhatsApp digits-only address", () => {
  assert.equal(FABSY_WHATSAPP_NUMBER, "18257932279");
  assert.equal(
    buildFabsyWhatsAppUrl(),
    "https://wa.me/18257932279?text=Hi%20Fabsy%20%E2%80%94%20I%20have%20a%20question%20about%20an%20Alberta%20traffic%20ticket.",
  );
});

test("WhatsApp starter messages are safely URL encoded", () => {
  assert.equal(
    buildFabsyWhatsAppUrl("Bonjour & مرحباً"),
    "https://wa.me/18257932279?text=Bonjour%20%26%20%D9%85%D8%B1%D8%AD%D8%A8%D8%A7%D9%8B",
  );
});
