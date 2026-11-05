import { beforeEach, describe, expect, it, vi } from "vitest";

const listeners: Record<string, Array<(value: any) => unknown>> = {};
const register = vi.fn(() => {
  for (const listener of listeners.registration ?? []) listener({ value: "native-token" });
});
const addPushListener = vi.fn(async (event: string, listener: (value: any) => unknown) => {
  (listeners[event] ??= []).push(listener);
  return { remove: vi.fn() };
});
const schedule = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
}));
vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    checkPermissions: vi.fn(async () => ({ receive: "granted" })),
    requestPermissions: vi.fn(),
    addListener: addPushListener,
    register,
    unregister: vi.fn(),
  },
}));
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    checkPermissions: vi.fn(async () => ({ display: "granted" })),
    requestPermissions: vi.fn(),
    schedule,
  },
}));
vi.mock("./push-server.functions", () => ({
  saveDeviceToken: vi.fn(async () => ({ ok: true })),
  removeDeviceToken: vi.fn(),
}));

import { enableNativePush } from "./native-push";

beforeEach(() => {
  for (const key of Object.keys(listeners)) delete listeners[key];
  vi.clearAllMocks();
});

describe("enableNativePush", () => {
  it("shows a Firebase notification locally when Android delivers it in the foreground", async () => {
    expect(await enableNativePush()).toEqual({ ok: true });
    expect(await enableNativePush()).toEqual({ ok: true });

    expect(listeners.pushNotificationReceived).toHaveLength(1);
    expect(listeners.pushNotificationActionPerformed).toHaveLength(1);

    await listeners.pushNotificationReceived[0]({
      title: "Prueba",
      body: "Aviso del servidor",
      data: { url: "/perfil" },
    });

    expect(schedule).toHaveBeenCalledWith({
      notifications: [expect.objectContaining({
        title: "Prueba",
        body: "Aviso del servidor",
        extra: { url: "/perfil" },
      })],
    });
  });
});
