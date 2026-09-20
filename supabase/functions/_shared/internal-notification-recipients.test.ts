import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  FABSY_PRIMARY_NOTIFICATION_EMAIL,
  internalNotificationDelivery,
} from "./resend-email.ts";

Deno.test("internal notices use hello only, with no backup recipient", () => {
  assertEquals(FABSY_PRIMARY_NOTIFICATION_EMAIL, "hello@fabsy.ca");
  assertEquals(internalNotificationDelivery(), {
    to: ["hello@fabsy.ca"],
    bcc: [],
  });
});
