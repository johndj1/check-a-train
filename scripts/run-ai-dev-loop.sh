#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKLOG_DIR="$REPO_ROOT/tasks/backlog"
ACTIVE_DIR="$REPO_ROOT/tasks/active"
DONE_DIR="$REPO_ROOT/tasks/done"

mkdir -p "$BACKLOG_DIR" "$ACTIVE_DIR" "$DONE_DIR"

active_count="$(find "$ACTIVE_DIR" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')"

if [ "$active_count" -gt 0 ]; then
  echo "An active task already exists."
  find "$ACTIVE_DIR" -maxdepth 1 -type f -name '*.md' | sort
  echo
  echo "Finish or move the active task before starting another one."
  exit 1
fi

next_task="$(find "$BACKLOG_DIR" -maxdepth 1 -type f -name '*.md' | sort | head -n 1)"

if [ -z "${next_task:-}" ]; then
  echo "No backlog tasks found."
  exit 0
fi

task_name="$(basename "$next_task")"
active_task="$ACTIVE_DIR/$task_name"

echo "Moving task to active: $task_name"
mv "$next_task" "$active_task"

echo
echo "============================================================"
echo "ACTIVE TASK: $active_task"
echo "============================================================"
echo
echo "Run Codex with:"
echo "codex run \"$active_task\""
echo
echo "After implementation and review:"
echo "mv \"$active_task\" \"$DONE_DIR/$task_name\""
echo
