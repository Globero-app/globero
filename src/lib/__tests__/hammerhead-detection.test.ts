import { expect, it } from "vitest";
import { ACTIVITY_SOURCE_FILTER, hammerheadSignature } from "../hammerhead-detection";

it("includes Hammerhead-only users in activity detection", () => {
  expect(ACTIVITY_SOURCE_FILTER.split(",")).toContain("hammerhead_access_token.not.is.null");
});
it.each(["X-Hmac-Signature", "x-hmac-signature", "x-hammerhead-signature", "x-signature"])("accepts the %s signature header", (header) => {
  expect(hammerheadSignature(new Headers({ [header]: "signature-fixture" }))).toBe("signature-fixture");
});
it("returns no signature for an unsigned request", () => {
  expect(hammerheadSignature(new Headers())).toBeNull();
});