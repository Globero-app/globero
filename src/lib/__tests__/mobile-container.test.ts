import { afterEach, describe, expect, it, vi } from "vitest";
import { isMobileContainer } from "../mobile-container";

afterEach(() => vi.unstubAllGlobals());

describe("mobile container detection", () => {
  it("keeps server rendering outside the mobile container", () => {
    vi.stubGlobal("window", undefined);
    expect(isMobileContainer()).toBe(false);
  });
  it("keeps normal browsers on the web payment flow", () => {
    vi.stubGlobal("window", {});
    expect(isMobileContainer()).toBe(false);
  });
  it("keeps Capacitor web on the web payment flow", () => {
    vi.stubGlobal("window", { Capacitor: { getPlatform: () => "web" } });
    expect(isMobileContainer()).toBe(false);
  });
  it.each(["android", "ios"])("detects %s as a native container", (platform) => {
    vi.stubGlobal("window", { Capacitor: { getPlatform: () => platform } });
    expect(isMobileContainer()).toBe(true);
  });
  it("does not fail for a missing platform method", () => {
    vi.stubGlobal("window", { Capacitor: {} });
    expect(isMobileContainer()).toBe(false);
  });
});