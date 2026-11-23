import path from "node:path";
import { defineConfig } from "@playwright/test";

const suite = process.env.E2E_SUITE;
if (suite !== "setup" && suite !== "desk") {
  throw new Error("Set E2E_SUITE to setup or desk. npm run test:e2e runs both, one server at a time.");
}

const desk = suite === "desk";
const port = desk ? 4749 : 4748;
const origin = `http://127.0.0.1:${port}`;
const magicStringPreload = path.resolve("e2e", "preload.cjs").replaceAll("\\", "/");

const blankSecrets = {
  NODE_ENV: "development",
  SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_URL: "",
  SUPABASE_PUBLISHABLE_KEY: "",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
  SUPABASE_SECRET_KEY: "",
  XAI_API_KEY: "",
  GEMINI_API_KEY: "",
  COVER_DESK_E2E: "",
};

export default defineConfig({
  testDir: "./e2e",
  testMatch: desk ? /desk\.spec\.ts/ : /setup\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: origin,
    browserName: "chromium",
    viewport: { width: 1280, height: 800 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next dev --turbopack --hostname 127.0.0.1 --port ${port}`,
    url: origin,
    reuseExistingServer: false,
    timeout: 180_000,
    env: serverEnv(
      desk
        ? { NEXT_DIST_DIR: ".next-e2e-desk", COVER_DESK_E2E: "1" }
        : { NEXT_DIST_DIR: ".next-e2e-setup" },
    ),
  },
});

function serverEnv(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  const nodeOptions = [env.NODE_OPTIONS, `--require ${magicStringPreload}`].filter(Boolean).join(" ");
  return { ...env, ...blankSecrets, ...extra, NODE_OPTIONS: nodeOptions };
}
