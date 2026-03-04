import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const today = new Date().toISOString().slice(0, 10);
const backlogPath = resolve(process.cwd(), "docs/backlog.json");

const message = execSync("git log -1 --pretty=%B", { encoding: "utf8" });
const ids = [...new Set((message.match(/\b[A-Z]+-\d+\b/g) ?? []))];

if (ids.length === 0) {
  process.exit(0);
}

const backlog = JSON.parse(readFileSync(backlogPath, "utf8"));
if (!Array.isArray(backlog.stories)) {
  process.exit(0);
}

for (const story of backlog.stories) {
  if (!ids.includes(story.id)) continue;
  if (story.status === "done") continue;

  if (story.status === "todo") {
    story.status = "in-progress";
    if (!story.startedAt) {
      story.startedAt = today;
    }
  }

  if (!story.startedAt) {
    story.startedAt = today;
  }

  story.status = "done";
  if (!story.completedAt) {
    story.completedAt = today;
  }
}

writeFileSync(backlogPath, `${JSON.stringify(backlog, null, 2)}\n`, "utf8");
