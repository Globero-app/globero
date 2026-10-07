import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.globero.coach",
  appName: "Globero",
  webDir: "cap-www",
  server: { url: "https://coach.globero.app", cleartext: false, androidScheme: "https" },
};

export default config;
