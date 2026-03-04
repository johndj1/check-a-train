import { spawn } from "node:child_process";

function hhmmToMins(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function isWithinWindow(targetHHMM, centerHHMM, windowMins) {
  const target = hhmmToMins(targetHHMM);
  const center = hhmmToMins(centerHHMM);
  if (target == null || center == null) return false;
  let delta = target - center;
  if (delta < -720) delta += 1440;
  if (delta > 720) delta -= 1440;
  return Math.abs(delta) <= windowMins;
}

function assertTimeWindowFiltering() {
  const requested = "09:00";
  const windowMins = 30;
  const aimed = ["08:25", "08:29", "08:30", "09:00", "09:30", "09:31", "23:50"];
  const filtered = aimed.filter((t) => isWithinWindow(t, requested, windowMins));
  const expected = ["08:30", "09:00", "09:30"];
  if (JSON.stringify(filtered) !== JSON.stringify(expected)) {
    throw new Error(
      `Time-window filter check failed. expected=${JSON.stringify(expected)} actual=${JSON.stringify(filtered)}`
    );
  }
}

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
  if (cmd === "npm" && args[0] === "run" && args[1] === "lint") {
    assertTimeWindowFiltering();
  }
  const code = await run(cmd, args);
  if (code !== 0) {
    process.exit(code);
  }
}

process.exit(0);
