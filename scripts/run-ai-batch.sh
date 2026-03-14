cat > scripts/run-ai-batch.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKLOG_DIR="$REPO_ROOT/tasks/backlog"
ACTIVE_DIR="$REPO_ROOT/tasks/active"
DONE_DIR="$REPO_ROOT/tasks/done"

mkdir -p "$BACKLOG_DIR" "$ACTIVE_DIR" "$DONE_DIR"

if ! command -v codex >/dev/null 2>&1; then
  echo "Error: codex CLI is not installed or not on your PATH."
  echo
  echo "Install or expose the codex command first, then try again."
  exit 1
fi

active_count="$(find "$ACTIVE_DIR" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')"

if [ "$active_count" -gt 0 ]; then
  echo "An active task already exists."
  find "$ACTIVE_DIR" -maxdepth 1 -type f -name '*.md' | sort
  echo
  echo "Clear the active task before running batch mode."
  exit 1
fi

processed=0
limit="${1:-3}"

while [ "$processed" -lt "$limit" ]; do
  next_task="$(find "$BACKLOG_DIR" -maxdepth 1 -type f -name '*.md' | sort | head -n 1)"

  if [ -z "${next_task:-}" ]; then
    echo "No more backlog tasks found."
    break
  fi

  task_name="$(basename "$next_task")"
  active_task="$ACTIVE_DIR/$task_name"

  echo
  echo "============================================================"
  echo "TASK $((processed + 1)) OF $limit: $task_name"
  echo "============================================================"

  mv "$next_task" "$active_task"

  codex run "$active_task"

  mv "$active_task" "$DONE_DIR/$task_name"

  processed=$((processed + 1))
done

echo
echo "============================================================"
echo "BATCH COMPLETE"
echo "============================================================"
echo "Processed $processed task(s)."
echo
echo "Batch mode is only for small isolated tasks. Review everything carefully:"
echo "1. git diff --stat"
echo "2. npm run lint"
echo "3. Inspect tasks/done before committing anything"
echo
EOF