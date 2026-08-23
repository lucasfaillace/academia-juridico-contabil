import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const createAdminScript = path.join(projectRoot, "scripts", "create-admin.sh");
const testHash = `scrypt$16384$8$1$${"s".repeat(32)}$${"A".repeat(86)}`;
const persistedHash = `ADMIN_PASSWORD_HASH="${testHash.replaceAll("$", "\\$")}"`;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    if (options.input !== undefined) {
      child.stdin?.end(options.input);
    }
  });
}

async function prepareAdminEnv() {
  const directory = await mkdtemp(path.join(tmpdir(), "academia-admin-env-"));
  const binDirectory = path.join(directory, "bin");
  const envFile = path.join(directory, ".env");
  await writeFile(envFile, [
    "# valor que deve permanecer intacto",
    "UNRELATED_SECRET=nao-alterar",
    "ADMIN_EMAIL=anterior@example.invalid",
    "ADMIN_PASSWORD_HASH=hash-anterior",
    "FINAL_VALUE=preservado",
    "",
  ].join("\n"), "utf8");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(binDirectory));

  const dockerMock = path.join(binDirectory, "docker");
  await writeFile(dockerMock, `#!/bin/sh
case "$*" in
  "compose build app") exit 0 ;;
  "compose run --rm --no-deps -e ADMIN_PASSWORD_INPUT app node scripts/hash-password.mjs")
    printf '%s\\n' "$TEST_ADMIN_HASH"
    exit 0
    ;;
esac
printf 'docker mock recebeu argumentos inesperados: %s\\n' "$*" >&2
exit 2
`, "utf8");
  await chmod(dockerMock, 0o700);

  const sttyMock = path.join(binDirectory, "stty");
  await writeFile(sttyMock, "#!/bin/sh\nexit 0\n", "utf8");
  await chmod(sttyMock, 0o700);

  const result = await run("/bin/sh", [createAdminScript, envFile], {
    cwd: directory,
    env: {
      ...process.env,
      PATH: `${binDirectory}:${process.env.PATH || ""}`,
      TEST_ADMIN_HASH: testHash,
    },
    input: "novo@example.invalid\nsenha-com-mais-de-12\nsenha-com-mais-de-12\n",
    stdio: ["pipe", "pipe", "pipe"],
  });
  assert.equal(result.code, 0, result.stderr);
  return { directory, envFile };
}

test("create-admin preserva o .env e escapa o hash para Next e Compose", async () => {
  const { directory, envFile } = await prepareAdminEnv();
  try {
    const persisted = await readFile(envFile, "utf8");
    assert.match(persisted, /^UNRELATED_SECRET=nao-alterar$/m);
    assert.match(persisted, /^FINAL_VALUE=preservado$/m);
    assert.match(persisted, /^ADMIN_EMAIL=novo@example\.invalid$/m);
    assert.ok(persisted.split("\n").includes(persistedHash));

    const nextPackage = await realpath(path.join(projectRoot, "node_modules", "next", "package.json"));
    const requireFromNext = createRequire(nextPackage);
    const nextEnvModule = requireFromNext.resolve("@next/env");
    const childEnvironment = { ...process.env };
    delete childEnvironment.ADMIN_PASSWORD_HASH;
    const nextResult = await run(process.execPath, [
      "-e",
      "require(process.argv[1]).loadEnvConfig(process.argv[2], false, console, true); process.stdout.write(process.env.ADMIN_PASSWORD_HASH || '')",
      nextEnvModule,
      directory,
    ], {
      env: childEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    assert.equal(nextResult.code, 0, nextResult.stderr);
    assert.equal(nextResult.stdout, testHash);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

const composeCommand = process.env.COMPOSE_COMMAND || "docker";
const composePrefix = process.env.COMPOSE_COMMAND ? [] : ["compose"];
const composeAvailable = spawnSync(composeCommand, [...composePrefix, "version"], { stdio: "ignore" }).status === 0;

test("Docker Compose interpreta o hash escapado sem barras", { skip: !composeAvailable }, async () => {
  const { directory, envFile } = await prepareAdminEnv();
  try {
    const composeFile = path.join(directory, "compose.yml");
    await writeFile(composeFile, [
      "services:",
      "  probe:",
      "    image: scratch",
      "    environment:",
      "      ADMIN_PASSWORD_HASH: ${ADMIN_PASSWORD_HASH}",
      "",
    ].join("\n"), "utf8");
    const composeEnvironment = { ...process.env };
    delete composeEnvironment.ADMIN_PASSWORD_HASH;
    const result = await run(composeCommand, [...composePrefix, "-f", composeFile, "--env-file", envFile, "config", "--environment"], {
      cwd: directory,
      env: composeEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    assert.equal(result.code, 0, result.stderr);
    const resolved = result.stdout.split("\n").find((line) => line.startsWith("ADMIN_PASSWORD_HASH="));
    assert.equal(resolved, `ADMIN_PASSWORD_HASH=${testHash}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
