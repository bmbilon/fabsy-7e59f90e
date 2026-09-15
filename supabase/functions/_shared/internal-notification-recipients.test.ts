import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  FABSY_BACKUP_NOTIFICATION_EMAIL,
  FABSY_PRIMARY_NOTIFICATION_EMAIL,
  internalNotificationDelivery,
} from "./internal-notification-recipients.ts";

Deno.test("internal notices address Fabsy and blind-copy Execom backup", () => {
  assertEquals(FABSY_PRIMARY_NOTIFICATION_EMAIL, "hello@fabsy.ca");
  assertEquals(FABSY_BACKUP_NOTIFICATION_EMAIL, "brett@execom.ca");
  assertEquals(internalNotificationDelivery(), {
    to: ["hello@fabsy.ca"],
    bcc: ["brett@execom.ca"],
  });
});
