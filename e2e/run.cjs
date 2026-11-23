const { spawnSync } = require("node:child_process");

for (const suite of ["setup", "desk"]) {
  const result = spawnSync("npx playwright test", {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, E2E_SUITE: suite },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
