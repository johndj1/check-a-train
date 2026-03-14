cat > scripts/run-ai-batch.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKLOG_DIR="$REPO_ROOT/tasks/backlog"
ACTIVE_DIR="$REPO_ROOT/tasks/active"

mkdir -p "$BACKLOG_DIR" "$ACTIVE_DIR"

if ! command -v codex >/dev/null 2>&1; then
  echo "Error: codex CLI is not installed or not on your PATH."
  exit 1
fi

active_count="$(find "$ACTIVE_DIR" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')"

if [ "$active_count" -gt 0 ]; then
  echo "An active task already exists."
  find "$ACTIVE_DIR" -maxdepth 1 -type f -name '*.md' | sort
  echo
  echo "Clear the active task before preparing another one."
  exit 1
fi

limit="${1:-3}"
prepared=0

while [ "$prepared" -lt "$limit" ]; do
  next_task="$(find "$BACKLOG_DIR" -maxdepth 1 -type f -name '*.md' | sort | head -n 1)"

  if [ -z "${next_task:-}" ]; then
    echo "No more backlog tasks found."
    break
  fi

  task_name="$(basename "$next_task")"
  active_task="$ACTIVE_DIR/$task_name"

  echo "Moving task to active: $task_name"
  mv "$next_task" "$active_task"

  echo
  echo "Prepared active task: $active_task"
  echo "Use this instruction in Codex:"
  echo "Please execute the task defined in $active_task."
  echo "You may inspect repository files before making changes."
  echo

  prepared=$((prepared + 1))
  break
done

echo "Prepared $prepared task(s). Review each one before moving anything to done."
EOF