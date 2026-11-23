import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import { readInfisicalAccess, secretAssignments } from "./load-infisical.mjs";

describe("infisical access", () => {
  it("stays idle when the three variables are absent", () => {
    assert.equal(readInfisicalAccess({}), null);
  });

  it("names each missing access variable", () => {
    assert.deepEqual(readInfisicalAccess({ INFISICAL_ID: "project" }), {
      missing: ["INFISICAL_TOKEN", "INFISICAL_ENV"],
    });
  });

  it("reads the project, token, and environment", () => {
    const access = readInfisicalAccess({
      INFISICAL_ID: "\"project\"",
      INFISICAL_TOKEN: "token",
      INFISICAL_ENV: "prod",
    });
    assert.equal(access.projectId, "project");
    assert.equal(access.token, "token");
    assert.equal(access.environment, "prod");
    assert.equal(access.apiUrl, "https://us.infisical.com");
  });

  it("keeps a secret from the project ahead of an imported secret and drops reserved names", () => {
    const assigned = secretAssignments({
      imports: [
        {
          secrets: [
            { secretKey: "SUPABASE_URL", secretValue: "https://import.example" },
            { secretKey: "XAI_API_KEY", secretValue: "from-import" },
          ],
        },
      ],
      secrets: [
        { secretKey: "SUPABASE_URL", secretValue: "https://example.supabase.co" },
        { secretKey: "PORT", secretValue: "9999" },
        { secretKey: "INFISICAL_TOKEN", secretValue: "replaced" },
        { secretKey: "NEXT_PUBLIC_SUPABASE_SECRET_KEY", secretValue: "hidden" },
        { secretKey: "not a name", secretValue: "nope" },
      ],
    });
    assert.equal(assigned.get("SUPABASE_URL"), "https://example.supabase.co");
    assert.equal(assigned.get("XAI_API_KEY"), "from-import");
    assert.equal(assigned.has("PORT"), false);
    assert.equal(assigned.has("INFISICAL_TOKEN"), false);
    assert.equal(assigned.has("NEXT_PUBLIC_SUPABASE_SECRET_KEY"), false);
    assert.equal(assigned.size, 2);
  });
});

describe("infisical process", () => {
  it("runs the command unchanged when Infisical is not configured", async () => {
    const result = await runChild(["-e", "process.stdout.write('plain')"], {});
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "plain");
  });

  it("injects fetched secrets and leaves Railway PORT in place", async () => {
    const server = createServer((request, response) => {
      if (request.headers.authorization !== "Bearer test-token") {
        response.writeHead(401);
        response.end();
        return;
      }
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          secrets: [
            { secretKey: "SUPABASE_URL", secretValue: "https://example.supabase.co" },
            { secretKey: "PORT", secretValue: "9999" },
          ],
          imports: [{ secrets: [{ secretKey: "XAI_API_KEY", secretValue: "from-import" }] }],
        }),
      );
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    try {
      const result = await runChild(
        ["-e", "process.stdout.write([process.env.SUPABASE_URL, process.env.XAI_API_KEY, process.env.PORT].join('|'))"],
        {
          INFISICAL_ID: "project",
          INFISICAL_TOKEN: "test-token",
          INFISICAL_ENV: "prod",
          INFISICAL_API_URL: `http://127.0.0.1:${address.port}`,
          PORT: "8080",
        },
      );
      assert.equal(result.status, 0);
      assert.equal(result.stdout, "https://example.supabase.co|from-import|8080");
      assert.equal(result.stderr.includes("test-token"), false);
    } finally {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});

function runChild(nodeArgs, extra) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/load-infisical.mjs", "--", process.execPath, ...nodeArgs],
      { env: childEnv(extra) },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (status) => resolve({ status, stdout, stderr }));
  });
}

function childEnv(extra) {
  const env = {
    PATH: process.env.PATH,
    SYSTEMROOT: process.env.SYSTEMROOT,
    PATHEXT: process.env.PATHEXT,
    COMSPEC: process.env.COMSPEC,
  };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete env[key];
  }
  return { ...env, ...extra };
}
