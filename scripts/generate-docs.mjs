import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const backlogPath = resolve(root, "docs/backlog.json");
const roadmapPath = resolve(root, "docs/roadmap.md");
const changelogPath = resolve(root, "docs/CHANGELOG.md");

const backlog = JSON.parse(readFileSync(backlogPath, "utf8"));
const stories = Array.isArray(backlog.stories) ? backlog.stories : [];

function byPrefix(prefix) {
  return stories.filter((s) => typeof s.id === "string" && s.id.startsWith(`${prefix}-`));
}

function lineForStory(s) {
  return `- ${s.id} — ${s.title} — ${s.status}`;
}

const roadmapLines = [
  "# Product Roadmap",
  "",
  "## Phase 1 — Foundations",
  ...byPrefix("PB").map(lineForStory),
  "",
  "## Phase 2 — Journey Intelligence",
  ...byPrefix("JR").map(lineForStory),
  "",
  "## Phase 3 — Delay Repay Engine",
  ...byPrefix("DR").map(lineForStory),
  "",
  "## Phase 4 — Security & Hardening",
  ...byPrefix("SEC").map(lineForStory),
  "",
  "## Phase 5 — Infrastructure & Developer Experience",
  ...byPrefix("DEV").map(lineForStory),
  ...byPrefix("INF").map(lineForStory),
  "",
  "## Future Experiments",
  ...byPrefix("EXP").map(lineForStory),
  "",
];

writeFileSync(roadmapPath, roadmapLines.join("\n"), "utf8");

const doneStories = stories.filter((s) => s.status === "done");
const dateGroups = new Map();

for (const story of doneStories) {
  const key =
    typeof story.completedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(story.completedAt)
      ? story.completedAt
      : "Unknown date";
  if (!dateGroups.has(key)) dateGroups.set(key, []);
  dateGroups.get(key).push(story);
}

const dateKeys = [...dateGroups.keys()].sort((a, b) => {
  if (a === "Unknown date") return 1;
  if (b === "Unknown date") return -1;
  return a < b ? 1 : a > b ? -1 : 0;
});

const changelogLines = ["# Changelog", ""];

for (const key of dateKeys) {
  changelogLines.push(`## ${key}`);
  for (const story of dateGroups.get(key)) {
    changelogLines.push(`- ${story.id} — ${story.title}`);
  }
  changelogLines.push("");
}

if (dateKeys.length === 0) {
  changelogLines.push("No completed stories yet.", "");
}

writeFileSync(changelogPath, changelogLines.join("\n"), "utf8");
