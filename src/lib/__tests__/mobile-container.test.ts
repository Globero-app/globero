import { afterEach, describe, expect, it, vi } from "vitest";
import { EXTERNAL_SUBSCRIPTION_URL, isMobileContainer, openExternalSubscription } from "../mobile-container";

const native = vi.hoisted(() => ({ available: true, open: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isPluginAvailable: () => native.available } }));
vi.mock("@capacitor/browser", () => ({ Browser: { open: native.open } }));

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

describe("external subscription navigation", () => {
  it.each(["android", "ios"])("blocks external payment navigation on %s", async (platform) => {
    native.available = true;
    native.open.mockClear();
    const open = vi.fn();
    vi.stubGlobal("window", { Capacitor: { getPlatform: () => platform }, open });
    await openExternalSubscription();
    expect(native.open).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
  it("does not fall back to payment links on older APKs without Browser", async () => {
    native.available = false;
    const open = vi.fn();
    vi.stubGlobal("window", { Capacitor: { getPlatform: () => "android" }, open });
    await openExternalSubscription();
    expect(open).not.toHaveBeenCalled();
  });
  it("preserves external subscription navigation in normal browsers", async () => {
    const open = vi.fn();
    vi.stubGlobal("window", { open });
    await openExternalSubscription();
    expect(open).toHaveBeenCalledWith(EXTERNAL_SUBSCRIPTION_URL, "_blank", "noopener,noreferrer");
  });
});