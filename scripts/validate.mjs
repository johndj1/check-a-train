import { spawn } from "node:child_process";

const checks = [
  ["npm", ["run", "lint"]],
  ["npx", ["tsc", "--noEmit"]],
  ["npm", ["run", "build"]],
];

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

for (const [cmd, args] of checks) {
  const code = await run(cmd, args);
  if (code !== 0) {
    process.exit(code);
  }
}

process.exit(0);
