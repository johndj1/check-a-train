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
  - If marking done, add "completedAt": YYYY-MM-DD.
  - Do not modify other stories.

---

## 🧪 Validation

- TypeScript compiles without errors.
- API routes return valid JSON.
- No console errors in browser.
- No use of `any` unless unavoidable.

## 🔗 Backlog dependency check

If you mark a story as "done":
- Verify all dependencies in docs/backlog.json are also "done".
- If any dependency is not "done", do NOT mark the story done.
- Instead: leave it "in-progress" and report which dependencies block completion.

## 🧷 Commit Story IDs

When writing commit messages for backlog-linked work, include story IDs in the
message body or subject using `(ABC-123)` format, for example `(ST-001)`.

---

## 📦 Finish

- Save all changes.
- Show `git diff`.
- Summarise what changed in 3–5 bullet points.
