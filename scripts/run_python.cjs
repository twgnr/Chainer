const { spawnSync } = require("node:child_process");

const candidates = process.platform === "win32" ? ["py", "python"] : ["python3", "python"];

for (const command of candidates) {
  const args = [
    ...(command === "py" ? ["-3"] : []),
    ...process.argv.slice(2),
  ];
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  });

  if (result.error?.code === "ENOENT") continue;
  if (result.error) {
    console.error(`Could not start ${command}: ${result.error.message}`);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

console.error("Python 3.10 or newer is required. Install Python and make it available on PATH.");
process.exit(1);
