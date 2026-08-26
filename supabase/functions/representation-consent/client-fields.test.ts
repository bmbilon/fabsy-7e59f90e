import assert from "node:assert/strict";
import test from "node:test";
import {
  validOptionalAptoPhone,
  validOptionalAptoPostalCode,
  validOptionalAptoProvince,
} from "./client-fields.ts";

test("APTO phone, province, and postal code accept blank values", () => {
  assert.equal(validOptionalAptoPhone(""), true);
  assert.equal(validOptionalAptoProvince(""), true);
  assert.equal(validOptionalAptoPostalCode(""), true);
});

test("optional APTO fields are validated when provided", () => {
  assert.equal(validOptionalAptoPhone("(825) 793-2279"), true);
  assert.equal(validOptionalAptoPhone("123"), false);
  assert.equal(validOptionalAptoProvince("AB"), true);
  assert.equal(validOptionalAptoProvince("x".repeat(81)), false);
  assert.equal(validOptionalAptoPostalCode("T4N 1A1"), true);
  assert.equal(validOptionalAptoPostalCode("*"), false);
});
