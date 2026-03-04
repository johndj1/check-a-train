# Codex Execution Task Template

You have access to this repository.

Follow the instructions precisely.
Edit files in place.
Save all modified files.
Show `git diff` at the end.
Do NOT print entire file contents unless explicitly asked.

---

## 🎯 Objective

<Describe clearly what outcome we want. Focus on behaviour, not implementation.>

Example:
Refactor the Journey model to support multi-leg itineraries and update API + UI accordingly.

---

## 🧠 Context

Relevant files:
- app/api/journeys/route.ts
- hooks/useJourneySearch.ts
- docs/product.md
- docs/backlog.json

Constraints:
- Do not break existing working behaviour.
- Keep TypeScript types strict.
- Preserve existing story IDs.
- Do not introduce secrets into client code.

---

## ⚠️ Risk Assessment (must complete)

Before coding:
- What could break? (list 3–5 concrete failure modes)
- What data could be exposed? (secrets, PII, tokens)
- What backwards compatibility is required?

Mitigations:
- For each risk above, state how you’ll prevent it (tests, validation, guardrails, fallbacks).

Rollback plan:
- If this change breaks prod/dev, what is the simplest revert path?

---

## 🛠 Tasks

### Task 1 – Code Changes
- <Specific file edits>
- <New types or functions required>
- <Validation logic>
- <UI adjustments>

### Task 2 – Documentation Updates
- Update docs/product.md if behaviour changes.
- Update docs/decisions.md if architectural changes are made.

### Task 3 – Backlog Update
- In docs/backlog.json:
  - Set story ID "<ID>" to "in-progress" or "done".
  - If marking done, add `"completedAt"` with ISO date format (`YYYY-MM-DD`).
  - Only stories with status `"done"` may include `"completedAt"`.
  - Stories with status other than `"done"` must not include `"completedAt"`.
  - Do not modify other stories.

### Task 4 – Codex Backlog Management Rules
- Treat `"completedAt"` as required when moving a story to `"done"`.
- Use the completion date for the current task run in `YYYY-MM-DD`.
- When reopening a story (status not `"done"`), remove `"completedAt"` in the same edit.

## Story Lifecycle Rules

- Status transitions:
  - `todo` -> `in-progress`: set `"startedAt"` to today's date (`YYYY-MM-DD`) if missing.
  - `in-progress` -> `done`: set `"completedAt"` to today's date (`YYYY-MM-DD`) if missing.
- Never overwrite existing `"startedAt"` or `"completedAt"` values.
- Stories with status `"todo"` must not contain `"startedAt"` or `"completedAt"`.
- Stories with status `"blocked"` must not contain `"startedAt"` or `"completedAt"`.
- Stories with status `"in-progress"` must contain `"startedAt"`.
- Stories with status `"done"` must contain both `"startedAt"` and `"completedAt"`.
- All lifecycle timestamps must use ISO date format: `YYYY-MM-DD`.

## Safe Git Commit Rules

- Codex may stage files using `git add` when requested.
- Codex must never automatically commit changes.
- Codex must run validation checks before suggesting a commit:
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npm run build`
- Codex must present validation results before suggesting a commit.
- Codex may only run `git commit` after explicit user confirmation.
- Codex must never stage `.env`, `.env.local`, or other secret files.

---

## 🧪 Validation

- TypeScript compiles without errors.
- API routes return valid JSON.
- No console errors in browser.
- No use of `any` unless unavoidable.

---

## 📦 Finish

- Save all changes.
- Show `git diff`.
- Summarise what changed in 3–5 bullet points.
