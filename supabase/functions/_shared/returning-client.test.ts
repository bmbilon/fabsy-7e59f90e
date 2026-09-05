import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canRefreshUnclaimedClientContact } from "./returning-client.ts";

const existing = {
  auth_user_id: null,
  last_name: "Driver",
  address: "123 Main Street",
  city: "Edmonton",
  postal_code: "T5J 0B3",
  date_of_birth: "1980-01-02",
};

const submitted = {
  lastName: "driver",
  address: "  123   Main Street ",
  city: "EDMONTON",
  postalCode: "t5j-0b3",
  dateOfBirth: "1980-01-02",
};

Deno.test("unclaimed returning client passes when all stable identity fields match", () => {
  assertEquals(canRefreshUnclaimedClientContact(existing, submitted), true);
});

Deno.test("portal-bound client never permits a public contact refresh", () => {
  assertEquals(
    canRefreshUnclaimedClientContact({
      ...existing,
      auth_user_id: crypto.randomUUID(),
    }, submitted),
    false,
  );
});

Deno.test("every stable identity field is required to match", () => {
  const mismatches = [
    { lastName: "Someone Else" },
    { address: "999 Other Avenue" },
    { city: "Calgary" },
    { postalCode: "T2P 1J9" },
    { dateOfBirth: "1981-01-02" },
  ];
  for (const mismatch of mismatches) {
    assertEquals(
      canRefreshUnclaimedClientContact(existing, { ...submitted, ...mismatch }),
      false,
    );
  }
});

Deno.test("missing or malformed identity values fail closed", () => {
  assertEquals(
    canRefreshUnclaimedClientContact({ ...existing, address: null }, submitted),
    false,
  );
  assertEquals(
    canRefreshUnclaimedClientContact(existing, {
      ...submitted,
      dateOfBirth: undefined,
    }),
    false,
  );
  assertEquals(
    canRefreshUnclaimedClientContact(existing, {
      ...submitted,
      dateOfBirth: "01/02/1980",
    }),
    false,
  );
});
