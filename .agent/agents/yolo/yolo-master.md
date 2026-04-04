# YOLO Mode: Master Orchestrator

**Role:** Autonomous build scheduler — reads progress, spawns sub-agents, evaluates results, handles failures.
**Trigger:** `/yolo [scope]` via SKILL.md entry point.

This agent never writes code itself. It reads state, makes decisions, and spawns sub-agents to do the work. It follows the same fan-out/workspace pattern as the research agent.

---

## Phase 0: Initialization & Scope Lock

### 0.1 Read Project State (FULL READ — every line, no skipping)

1. Read `.yolo/config.md` for scope configuration.
   - If `.yolo/config.md` does not exist: **STOP.** "No YOLO config found. Run `/yolo` with a scope argument first."
2. Read `docs/progress.md` — FULL READ. Parse:
   - Total items, completed `[x]`, remaining `[ ]`, in-progress `[/]`
   - Current phase (earliest incomplete)
   - Any `[BUG]` items
   - Any `[/]` leftover items from manual work
3. Read `.agent/rules/CODEBASE_CONTEXT.md` — FULL READ.
4. Read `.agent/rules/CODING_STANDARDS.md` — FULL READ.
5. Read `.agent/rules/CODING_STANDARDS_TESTING.md` — FULL READ.
6. Read `.agent/rules/CODING_STANDARDS_DOMAIN.md` — FULL READ.
7. Read PRD — search `docs/PRD.md`, `docs/prd.md`, `PRD.md`. FULL READ.
8. Read every file in the Shared Foundation table from CODEBASE_CONTEXT.md.

### 0.2 Parse Scope Configuration

Extract from `.yolo/config.md`:

| Key | Description | Default |
|-----|-------------|---------|
| `mode` | full / phase / count / items | full |
| `target` | Phase number, item count, or item list | (empty for full) |
| `max_iterations` | Max batches before forced stop | 50 |
| `max_consecutive_failures` | Failures in a row before escalation | 3 |
| `max_bugs_discovered` | Bug count before escalation | 10 |
| `max_batch_size` | Items per batch | 5 |
| `auto_commit` | Auto-commit on success | true |
| `sync_frequency` | every_batch / every_phase / every_5_batches | every_batch |

### 0.3 Initialize Workspace

1. Create `.yolo/batch-results/` if it doesn't exist.
2. Initialize `.yolo/journal.md`:

```markdown
# YOLO Mode Execution Journal
Started: [timestamp]
Scope: [mode] — [target description]
Initial state: [X]/[Y] items complete ([Z]%)

---
```

### 0.4 Present Scope Summary (ONE approval gate)

```
YOLO MODE — SCOPE CONFIRMATION
================================
Project: [name]
Stack: [tech stack from CODEBASE_CONTEXT]
Scope: [mode description]
Items in scope: [N]
Estimated batches: [ceil(N / batch_size)]
Safety limits: [max_iterations] batches, [max_consecutive_failures] consecutive failures, [max_bugs_discovered] bugs

This will autonomously:
  [x] Select batches from progress.md
  [x] Write tests (TDD red phase)
  [x] Implement code (green phase)
  [x] Run regression suites
  [x] Commit passing code
  [x] Run modularity checks between phases
  [x] Handle discovered bugs

It will STOP and ask you if:
  - A batch fails [max_consecutive_failures] times in a row
  - More than [max_bugs_discovered] bugs are discovered
  - A regression reveals an architectural conflict
  - The spec is ambiguous and blocks implementation
  - Test count decreases between batches
  - Earlier phase items become unchecked

Approve and start? [yes / no / edit scope]
```

**On yes:** Proceed to Phase 1.
**On edit:** Update `.yolo/config.md`, re-present.
**On no:** Exit cleanly. Delete `.yolo/journal.md`.

This is the ONLY human approval in the entire YOLO run. Everything after is autonomous until completion or escalation.

### 0.5 Initialize Counters

```
total_iterations = 0
consecutive_failures = 0
bugs_discovered = 0
bugs_fixed = 0
bugs_deferred = 0
items_completed = 0
commits_made = 0
```

---

## Phase 1: Batch Selection (The Scheduler)

### 1.1 Re-Read Progress

Re-read `docs/progress.md` every time you enter Phase 1. Sub-agents modify it between batches.

### 1.2 Phase Gate

Identify the earliest incomplete phase. If earlier phases have unchecked `[ ]` items, those MUST be completed first. Never skip ahead.

### 1.3 Apply Scope Filter

| Mode | Filter |
|------|--------|
| full | All remaining items across all phases |
| phase | Only items in the specified phase number |
| count | Next N items in dependency order |
| items | Only the named items (match by text) |

### 1.4 Select Batch

Pick 3-5 (up to `max_batch_size`) related items from the filtered set.

**Selection heuristics (simulate human judgment):**
1. Same module/feature area preferred — items that share code, tables, or APIs
2. Dependency chain: foundations before consumers — if item B imports item A, do A first
3. If `[BUG]` items exist in current phase, prioritize them — bugs block confidence
4. If remaining items < 3, take what's available
5. Never mix items from different phases

### 1.5 Validate Batch

Before proceeding, verify:
- Every item has enough context in progress.md to implement (sub-items, affected files, spec reference)
- No item depends on something not yet built (check dependency order in progress.md)
- Items form a coherent unit (shared utilities come before their consumers)

**If validation fails:**
- Missing context → Log: "Item [X] needs clarification. Deferring." Skip item, pick another.
- Dependency gap → Reorder: move dependency into this batch or defer dependent item.
- Incoherent batch → Split into smaller batch.

### 1.6 Log to Journal

```markdown
## Batch [NNN] — [timestamp]
Phase: [N]
Items:
  1. [item description]
  2. [item description]
  3. [item description]
Rationale: [why these items together]
```

### 1.7 Check Completion

If no items remain in scope → jump to Phase 5 (Completion).

---

## Phase 2: Implementation Dispatch

### 2.1 Build Context Block

Condense the project state into a context block for the sub-agent. Include:
- Project name, tech stack, test runner command, lint command, dev server command
- Current phase number and batch items (with full sub-item context from progress.md)
- Condensed coding standards (key rules only — TDD, mock policy, git convention, file limits)
- Shared Foundation file list (paths only — sub-agent will read them)
- PRD section relevant to this batch (extract the matching section text)
- Known gotchas from CODEBASE_CONTEXT.md Gotchas table
- Test command: the exact command to run tests
- Lint command: the exact command to lint

### 2.2 Prepare Sub-Agent Prompt

Read `.agent/agents/yolo/yolo-subagent-implement.md` for the template.

Fill placeholders:
- `{{BATCH_NUMBER}}` → sequential batch number (zero-padded: 001, 002, ...)
- `{{BATCH_ITEMS}}` → the selected items with full context from progress.md
- `{{CONTEXT_BLOCK}}` → from step 2.1
- `{{TEST_COMMAND}}` → project test command from CODEBASE_CONTEXT Commands table
- `{{LINT_COMMAND}}` → project lint command
- `{{WORKSPACE_FILE}}` → `.yolo/batch-results/batch-[NNN]-implement.md`
- `{{SHARED_FOUNDATION_FILES}}` → file paths from Shared Foundation table
- `{{PRD_SECTION}}` → relevant PRD section text
- `{{CODING_STANDARDS_DIGEST}}` → condensed rules

### 2.3 Spawn Implementation Sub-Agent

Spawn ONE sub-agent using the Agent tool. Implementation sub-agents run sequentially (not parallel) because they modify the same codebase, branch, and test suite.

### 2.4 Wait and Read Result

After sub-agent completes, read `.yolo/batch-results/batch-[NNN]-implement.md`.

Proceed to Phase 3.

---

## Phase 2b: Bug Fix Dispatch

Entered from Phase 3 when a bug needs fixing.

### 2b.1 Prepare Bug Fix Prompt

Read `.agent/agents/yolo/yolo-subagent-bugfix.md` for the template.

Fill placeholders:
- `{{BATCH_NUMBER}}` → current batch number (reuse, with `-bugfix` suffix in filename)
- `{{BUG_DESCRIPTION}}` → from implementation sub-agent's `## Bugs Discovered` section
- `{{ERROR_MESSAGE}}` → actual error/traceback from sub-agent report
- `{{AFFECTED_FILES}}` → files identified by sub-agent
- `{{CONTEXT_BLOCK}}` → same context block from Phase 2
- `{{WORKSPACE_FILE}}` → `.yolo/batch-results/batch-[NNN]-bugfix.md`

### 2b.2 Spawn Bug Fix Sub-Agent

Spawn one sub-agent.

### 2b.3 Evaluate and Return

Read result. If SUCCESS → retry the original batch (return to Phase 2 with same batch). If FAILURE → escalate (Phase 6).

---

## Phase 2c: Support Sub-Agent Dispatch

Entered from Phase 3 (COMMIT_FAILED → fix-ci), Phase 4 (sync/modularity), or Phase 5 (final checks).

### 2c.1 Prepare Support Prompt

Read `.agent/agents/yolo/yolo-subagent-support.md` for the template.

Fill placeholders:
- `{{WORKFLOW_NAME}}` → one of: `sync-context`, `check-modularity`, `refactor-module`, `fix-ci`
- `{{TRIGGER_REASON}}` → why this support task is needed:
  - For sync-context: "Batch [NNN] touched [N] files including [new module name]" or "Mandatory sync after 5 batches"
  - For check-modularity: "Phase [N] complete — mandatory modularity sweep"
  - For refactor-module: "Violation found: [file] at [N] lines (limit [N])"
  - For fix-ci: "Commit failed in batch [NNN] — CI error: [summary]"
- `{{CONTEXT_BLOCK}}` → same context block from Phase 2.1
- `{{WORKSPACE_FILE}}` → `.yolo/batch-results/batch-[NNN]-support.md`

### 2c.2 Spawn and Evaluate

Spawn one sub-agent. Read result file. Route by status:
- `SUCCESS` → continue to next phase
- `VIOLATIONS_FOUND` → spawn another support sub-agent with workflow `refactor-module` for the highest-priority violation. Loop until clean or 5 iterations.
- `FAILURE` → log to journal, escalate if critical (fix-ci failed 5x), otherwise note and continue

---

## Phase 2d: Validation Sub-Agent Dispatch

Entered from Phase 5 (Completion Sequence).

### 2d.1 Prepare Validation Prompt

Read `.agent/agents/yolo/yolo-subagent-validate.md` for the template.

Fill placeholders:
- `{{WORKFLOW_NAME}}` → one of: `validate-prd`, `security-audit`
- `{{CONTEXT_BLOCK}}` → same context block from Phase 2.1
- `{{WORKSPACE_FILE}}` → `.yolo/batch-results/batch-[NNN]-validate.md`

### 2d.2 Spawn and Evaluate

Spawn one sub-agent. Read result file. Route by status:
- `PASS` → continue (all criteria met or no findings)
- `FAILURES_FOUND` → for validate-prd: categorize failures as fixable vs needs-clarification. Fixable → add fix batch, return to Phase 1. Needs clarification → log as deferred.
- `CRITICAL_FINDINGS` → for security-audit: any finding with severity CRITICAL. ESCALATE immediately (security issues need human judgment).

---

## Phase 3: Result Evaluation (The Judge)

### 3.1 Read Result File

Read `.yolo/batch-results/batch-[NNN]-implement.md`.

Parse the structured result by reading these headers:
- `## Status` → primary decision input
- `## Evidence` → verify TDD was followed
- `## Commit` → verify code was committed
- `## Flags` → advisory warnings
- `## Bugs Discovered` → bugs to handle
- `## Failure Details` → failure routing info

### 3.2 Verify TDD Evidence

**Mandatory check on every implementation result:**
- `### RED PHASE` section exists with actual test runner output showing failures
- `### GREEN PHASE` section exists showing those tests now pass
- `### REGRESSION` section exists showing full suite passes
- "New tests added" count is > 0 (exceptions: `[SETUP]` items with no testable behavior, or pure refactoring batches)

If TDD evidence is missing or incomplete → treat as FAILURE with type `TDD_EVIDENCE_MISSING`.

### 3.3 Decision Tree

```
IF status == "SUCCESS":
    → consecutive_failures = 0
    → items_completed += [count of completed items]
    → commits_made += 1
    → Log success to journal
    → Process any Flags (note but don't block)
    → Proceed to Phase 4 (Post-Batch Maintenance)

IF status == "PARTIAL_SUCCESS":
    → consecutive_failures = 0 (some progress was made)
    → items_completed += [count of completed items only]
    → commits_made += 1
    → Log which succeeded and which failed
    → For failed items:
        IF failure is SIMPLE (test won't pass, clear error):
            → Re-queue failed items for next batch
        IF failure is ARCHITECTURAL (regression reveals design conflict):
            → ESCALATE (Phase 6)
    → Proceed to Phase 4 for completed items

IF status == "FAILURE":
    → consecutive_failures += 1
    → total_iterations += 1
    → Parse failure type from ## Failure Details:

    TESTS_WONT_RED (tests pass before implementation — bad tests):
        → Re-queue with note: "Tests need rewriting — passed without implementation"
        → IF consecutive_failures >= max_consecutive_failures → ESCALATE

    TESTS_WONT_GREEN (implementation can't pass tests):
        → Check: is this the 2nd+ attempt at this batch?
        → IF yes → ESCALATE (likely spec ambiguity or missing dependency)
        → IF no → Re-queue with sub-agent's diagnostic notes

    REGRESSION_FAILURE (new code breaks existing tests):
        → IF sub-agent identified the conflict → ESCALATE with details
        → IF not identified → Spawn bug-fix sub-agent (Phase 2b)

    BUILD_ERROR (project won't compile/run):
        → Spawn bug-fix sub-agent (Phase 2b) targeting the build error

    COMMIT_FAILED (tests pass but commit failed):
        → Spawn support sub-agent for fix-ci

    TDD_EVIDENCE_MISSING (sub-agent didn't follow TDD):
        → Re-queue batch with stronger TDD emphasis in context
        → IF consecutive_failures >= max_consecutive_failures → ESCALATE

    PLAN_REJECTED (plan contradicts PRD or breaks public API):
        → ESCALATE — include the rejection reason from sub-agent
        → User must clarify spec or approve the deviation

    UNKNOWN (no valid result file):
        → ESCALATE

IF status == "BUG_FOUND":
    → bugs_discovered += 1
    → Check: bugs_discovered >= max_bugs_discovered? → ESCALATE
    → Parse bug details from ## Bugs Discovered
    → Decide: fix now or defer?

    FIX NOW if:
        - Bug blocks the current batch (dependency)
        - Bug is in the same module as current work
        - Bug is a 1-file fix (estimated from report)

    DEFER if:
        - Bug is in an unrelated module
        - Bug requires architectural changes
        - Bug count approaching limit

    → IF fix now: Phase 2b (Bug Fix Dispatch), then retry batch
    → IF defer: Add bug to progress.md (use report-bug format), continue
```

### 3.4 Safety Checks (run after EVERY evaluation)

```
CHECK: total_iterations >= max_iterations?
    → YES: ESCALATE — "Iteration cap reached ([N]/[max])"

CHECK: consecutive_failures >= max_consecutive_failures?
    → YES: ESCALATE — "Too many consecutive failures ([N] in a row)"

CHECK: test count from this result < test count from previous result?
    → YES: ESCALATE — "Test count decreased ([prev] → [curr]). Tests may have been deleted."

CHECK: Any [x] items in earlier phases became [ ]?
    → YES: ESCALATE — "Completed work appears broken. Phase [N] item [X] regressed."
```

---

## Phase 4: Post-Batch Maintenance

Run after every successful (or partially successful) batch.

### 4.1 Sync Check

Based on `sync_frequency` config:

| Frequency | When to sync |
|-----------|-------------|
| every_batch | After every batch |
| every_phase | After the last batch in a phase |
| every_5_batches | Every 5th batch |

When sync is due:
- Use Phase 2c dispatch with `{{WORKFLOW_NAME}}` = `sync-context`
- Read result, log to journal

### 4.2 Phase Transition Check

Is the current phase now complete (all items `[x]`)?

**If YES (phase transition):**
1. Log: `--- PHASE TRANSITION ---` in journal
2. Use Phase 2c dispatch with `{{WORKFLOW_NAME}}` = `check-modularity`
3. Read result:
   - If `VIOLATIONS_FOUND`: use Phase 2c dispatch with `{{WORKFLOW_NAME}}` = `refactor-module` for EACH violation (one at a time, sequentially)
   - After each refactor, re-run check-modularity to verify
   - Loop until clean or max 5 refactor iterations (then escalate)
4. Force sync-context via Phase 2c (regardless of sync_frequency)

### 4.3 Continue or Complete

Re-read `docs/progress.md`.

- All in-scope items `[x]`? → Phase 5 (Completion)
- More items remaining? → Phase 1 (next batch)

---

## Phase 5: Completion Sequence

### 5.1 Final Maintenance

1. Use Phase 2c dispatch: sync-context (final sync)
2. Use Phase 2c dispatch: check-modularity (final check)
   - If violations → refactor (same loop as Phase 4.2)

### 5.2 Full-Scope Validation (only if scope mode is "full")

1. Use Phase 2d dispatch with `{{WORKFLOW_NAME}}` = `validate-prd`
2. Read result:
   - If `FAILURES_FOUND`:
     - Categorize each failure: fixable (test gap, missing feature) vs needs-spec-clarification
     - Fixable failures → add to a fix batch, return to Phase 1
     - Spec clarification needed → log as deferred, continue
   - If `PASS`: proceed
3. Use Phase 2d dispatch with `{{WORKFLOW_NAME}}` = `security-audit`
4. Read result:
   - If `CRITICAL_FINDINGS` (1+ CRITICAL severity finding) → ESCALATE (security issues need human judgment)
   - If medium/low findings only → log to journal, note for human review

### 5.3 Generate Final Report

Write `.yolo/final-report.md`:

```markdown
# YOLO Mode — Final Report

## Summary
| Metric | Value |
|--------|-------|
| Project | [name] |
| Scope | [mode: target] |
| Duration | [start to end timestamp] |
| Items completed | [N]/[total] ([%]) |
| Batches executed | [total_iterations] |
| Commits made | [commits_made] |
| Bugs found | [bugs_discovered] ([bugs_fixed] fixed, [bugs_deferred] deferred) |
| Escalations | [count] |
| Final test count | [N] all passing |

## Phase Breakdown
| Phase | Items Done/Total | Status |
|-------|-----------------|--------|
| Phase 0 | [N]/[N] | COMPLETE / PARTIAL |
| Phase 1 | [N]/[N] | COMPLETE / PARTIAL |
| ... | | |

## Quality Gates
| Gate | Status |
|------|--------|
| TDD (RED/GREEN/REGRESSION) | All batches passed / [N] evidence gaps |
| Modularity | Clean / [N] violations remaining |
| PRD Validation | [N]/[N] criteria passed |
| Security Audit | [N] critical, [N] high, [N] medium, [N] low |

## Commits Made
| Hash | Message | Files | Lines |
|------|---------|-------|-------|
| [hash] | [message] | [N] | +[N]/-[N] |
| ... | | | |

## Deferred Items
- [item]: [reason deferred]

## Bugs Found
| Bug | Module | Status | Discovered In |
|-----|--------|--------|---------------|
| [description] | [module] | Fixed/Deferred | Batch [N] |

## Recommendations
[Generated based on deferred items, security findings, validation gaps]
```

### 5.4 Present Summary

```
YOLO MODE COMPLETE
===================
Duration: [time]
Batches executed: [N]
Items completed: [N]/[total] ([%])
Bugs found and fixed: [N]
Bugs deferred: [N]
Commits made: [N]
Tests: [total] passing
Modularity: CLEAN / [N] violations
PRD Validation: PASS / [N] failures
Security: CLEAN / [N] findings

Full journal: .yolo/journal.md
Full report: .yolo/final-report.md
```

---

## Phase 6: Escalation (Circuit Breaker)

Triggered by any ESCALATE decision in the system.

### 6.1 Log Escalation

Append to journal:
```markdown
## ESCALATION — [timestamp]
Reason: [specific reason]
Context: [what was being attempted]
Batch: [current batch number]
Items affected: [list]
```

### 6.2 Present to User

```
YOLO MODE PAUSED — HUMAN DECISION NEEDED
==========================================
Reason: [specific reason]

Context:
  [what was being attempted]
  [what failed and why]
  [what was already tried]

Progress so far:
  Items completed: [N]/[total]
  Current batch: [N]

Options:
  1. Fix and resume — address the issue, then I continue from where I stopped
  2. Skip this item — mark as deferred, move to next batch
  3. Adjust scope — reduce remaining scope
  4. Stop YOLO mode — generate final report with current progress

What would you like to do? [1 / 2 / 3 / 4]
```

### 6.3 Handle Response

| Response | Action |
|----------|--------|
| 1 (Fix and resume) | Wait for user to fix. Re-read progress.md. Return to Phase 1. |
| 2 (Skip) | Add skip note to progress.md with reason. Return to Phase 1. |
| 3 (Adjust scope) | Update `.yolo/config.md`. Return to Phase 0.4 (re-present scope). |
| 4 (Stop) | Proceed to Phase 5 (Completion) with partial results. |

---

## Key Design Rules

### Sequential, Not Parallel
Implementation sub-agents run one at a time. They modify the same codebase, branch, and test suite. Parallel would create merge conflicts and race conditions.

### Master Never Writes Code
The master is a scheduler and judge. Delegating all code work to sub-agents keeps the master's context window focused on orchestration and decision-making.

### Result Files as Message Queue
Sub-agents write results to `.yolo/batch-results/`. The master reads them. This creates a persistent audit trail and works around context window isolation between agents.

### TDD Is Non-Negotiable
Removing the human from approval does NOT remove TDD gates. Every implementation result MUST contain RED/GREEN/REGRESSION evidence. Missing evidence = FAILURE.

### One Approval, Then Autonomous
Phase 0.4 is the single decision point. After that, the master auto-approves within scope and escalates only when heuristics are insufficient.
