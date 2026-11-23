import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BLOCKED = new Set(["PORT", "HOSTNAME", "NODE_ENV", "NODE_OPTIONS", "PATH", "HOME"]);

export function readInfisicalAccess(env) {
  const projectId = first(env.INFISICAL_ID, env.INFISICAL_PROJECT_ID);
  const token = first(env.INFISICAL_TOKEN);
  const environment = first(env.INFISICAL_ENV, env.INFISICAL_ENVIRONMENT);
  if (!projectId && !token && !environment) return null;

  const missing = [];
  if (!projectId) missing.push("INFISICAL_ID");
  if (!token) missing.push("INFISICAL_TOKEN");
  if (!environment) missing.push("INFISICAL_ENV");
  if (missing.length > 0) return { missing };

  const apiUrl = apiBase(env.INFISICAL_API_URL);
  if (!apiUrl) return { missing: ["INFISICAL_API_URL"] };
  return { projectId, token, environment, apiUrl };
}

export function secretAssignments(payload) {
  const assigned = new Map();
  const imports = Array.isArray(payload?.imports) ? payload.imports : [];
  for (const imported of imports) {
    const secrets = Array.isArray(imported?.secrets) ? imported.secrets : [];
    for (const secret of secrets) remember(assigned, secret);
  }
  const secrets = Array.isArray(payload?.secrets) ? payload.secrets : [];
  for (const secret of secrets) remember(assigned, secret);
  return assigned;
}

export async function fetchInfisicalSecrets(access, fetchImpl) {
  const url = new URL("/api/v4/secrets", access.apiUrl);
  url.searchParams.set("projectId", access.projectId);
  url.searchParams.set("environment", access.environment);
  url.searchParams.set("secretPath", "/");
  url.searchParams.set("viewSecretValue", "true");
  url.searchParams.set("expandSecretReferences", "true");
  url.searchParams.set("recursive", "true");
  url.searchParams.set("includeImports", "true");
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${access.token}`,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Infisical returned ${response.status}`);
  return response.json();
}

export async function loadInfisicalEnv(env, fetchImpl) {
  const access = readInfisicalAccess(env);
  if (!access) return { env, loaded: 0 };
  if (access.missing) {
    throw new Error(`Missing ${access.missing.join(", ")}.`);
  }
  const payload = await fetchInfisicalSecrets(access, fetchImpl);
  const assigned = secretAssignments(payload);
  if (assigned.size === 0) throw new Error("Infisical returned no secrets.");
  const next = { ...env };
  for (const [key, value] of assigned) next[key] = value;
  return { env: next, loaded: assigned.size, environment: access.environment };
}

function first(...values) {
  for (const value of values) {
    const trimmed = unwrap(value);
    if (trimmed) return trimmed;
  }
  return "";
}

function unwrap(value) {
  let trimmed = typeof value === "string" ? value.trim() : "";
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function apiBase(value) {
  const raw = unwrap(value) || "https://us.infisical.com";
  let url;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol === "https:") return url.origin;
  if (url.protocol === "http:" && local) return url.origin;
  return "";
}

function remember(assigned, secret) {
  if (secret?.secretValueHidden === true) return;
  const key = typeof secret?.secretKey === "string" ? secret.secretKey.trim() : "";
  if (!key || typeof secret?.secretValue !== "string") return;
  if (BLOCKED.has(key) || key.startsWith("INFISICAL_")) return;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return;
  if (key.startsWith("NEXT_PUBLIC_") && /SECRET|TOKEN|PASSWORD|SERVICE_ROLE/.test(key)) return;
  assigned.set(key, secret.secretValue);
}

async function main() {
  const separator = process.argv.indexOf("--");
  const command = separator === -1 ? [] : process.argv.slice(separator + 1);
  if (command.length === 0) {
    console.error("Pass the command after --.");
    process.exit(1);
  }
  let loaded;
  try {
    loaded = await loadInfisicalEnv(process.env, fetch);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Infisical request failed.");
    process.exit(1);
  }
  if (loaded.loaded > 0) {
    console.error(`Infisical loaded ${loaded.loaded} secrets from ${loaded.environment}.`);
  }
  const child = spawn(command[0], command.slice(1), {
    stdio: "inherit",
    env: loaded.env,
    shell: process.platform === "win32" && !command[0].toLowerCase().endsWith(".exe"),
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
  child.on("error", (error) => {
    console.error(error.message);
    process.exit(1);
  });
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry === fileURLToPath(import.meta.url)) {
  main();
}
