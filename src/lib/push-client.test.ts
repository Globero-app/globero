import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock("./native-push", () => ({ isNativePush: () => false }));
vi.mock("./push-server.functions", () => ({ saveSubscription: vi.fn(), removeSubscription: vi.fn() }));

import { enableServerPush, VAPID_PUBLIC_KEY } from "./push-client";
import { saveSubscription } from "./push-server.functions";

const unsubscribe = vi.fn();
const subscribe = vi.fn();
const getSubscription = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  const registration = { pushManager: { getSubscription, subscribe } };
  vi.stubGlobal("window", { PushManager: {}, Notification: {} });
  vi.stubGlobal("Notification", { requestPermission: vi.fn().mockResolvedValue("granted") });
  vi.stubGlobal("navigator", {
    userAgent: "test-browser",
    serviceWorker: { register: vi.fn().mockResolvedValue(registration), ready: Promise.resolve(registration) },
  });
  getSubscription.mockResolvedValue({ unsubscribe });
  unsubscribe.mockResolvedValue(true);
  subscribe.mockResolvedValue({ toJSON: () => ({ endpoint: "https://push.example/new", keys: { p256dh: "key", auth: "auth" } }) });
  vi.mocked(saveSubscription).mockResolvedValue({ ok: true });
});

afterEach(() => vi.unstubAllGlobals());

describe("enableServerPush", () => {
  it("renews the previous subscription with the current VAPID key and saves it", async () => {
    expect(await enableServerPush()).toEqual({ ok: true });
    expect(unsubscribe).toHaveBeenCalledOnce();
    const options = subscribe.mock.calls[0][0];
    expect(Buffer.from(options.applicationServerKey).toString("base64url")).toBe(VAPID_PUBLIC_KEY);
    expect(saveSubscription).toHaveBeenCalledWith({ data: {
      endpoint: "https://push.example/new", keys: { p256dh: "key", auth: "auth" }, user_agent: "test-browser",
    } });
  });

  it("reports the exact save error instead of succeeding", async () => {
    vi.mocked(saveSubscription).mockRejectedValue(new Error("Subscription could not be saved"));
    expect(await enableServerPush()).toEqual({ ok: false, reason: "Subscription could not be saved" });
  });

  it("stops if the previous subscription cannot be removed", async () => {
    unsubscribe.mockResolvedValue(false);
    expect((await enableServerPush()).ok).toBe(false);
    expect(subscribe).not.toHaveBeenCalled();
    expect(saveSubscription).not.toHaveBeenCalled();
  });

  it("reports browser subscription errors", async () => {
    subscribe.mockRejectedValue(new Error("Push service unavailable"));
    expect(await enableServerPush()).toEqual({ ok: false, reason: "Push service unavailable" });
  });
});