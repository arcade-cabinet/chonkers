---
title: Execution Runbook — PR-per-PRD Workflow
updated: 2026-04-29
status: current
domain: ops
---

# Execution Runbook

The operations procedure for landing chonkers PRDs as autonomous PRs. Each PRD lands as exactly one PR; each PR satisfies its acceptance criteria before merging; each commit dispatches reviewer agents; reviewer feedback is automated through GraphQL (see [AUTONOMY.md](./AUTONOMY.md)).

## Pre-execution checklist

Before starting any PRD's PR work, the executor confirms:

- [ ] `git status` is clean on `main`, fast-forward parity with `origin/main`.
- [ ] `pnpm install --frozen-lockfile` clean.
- [ ] `pnpm typecheck && pnpm lint && pnpm build` all green on `main`.
- [ ] `gh auth status` shows active authentication with `repo` scope.
- [ ] `.agent-state/directive.md` `Status: ACTIVE` and the PRD pointer matches the PRD about to start.
- [ ] All upstream PRDs in the dependency chain are merged (`docs/plans/*.prq.md` files marked complete in the directive).

If any check fails, halt and report. Do not start a PRD with a dirty foundation.

## PR workflow

### 1. Branch creation

```bash
git checkout main
git pull --ff-only
git checkout -b prd/<slug>
```

`<slug>` is the lowercase hyphen-separated PRD identifier from the directive (e.g. `prd/persistence`, `prd/schema`, `prd/logic`, etc.). One branch per PRD; never reuse.

### 2. Task execution loop

For each task in the PRD's task list, in dependency order:

1. **Read the task description + acceptance criteria** in the PRD.
2. **Write tests first** (red bar) when the task is a test-task. Verify failure: `pnpm test:node <path>` or `pnpm test:browser <path>` should fail with the expected reason.
3. **Implement** until tests pass.
4. **Run the relevant test suite for the package being touched** to confirm green:
   - `pnpm typecheck` (every commit)
   - `pnpm lint` (every commit)
   - `pnpm test:node` for engine/AI/persistence-types/schema-runner work
   - `pnpm test:browser` for persistence/schema/audio/sim/visual-shell work
   - `pnpm test:e2e:smoke` for visual-shell and beyond
5. **Commit** with a Conventional Commits message: `feat(persistence): kv get/put roundtrip` or `test(engine): partition runs property tests` or similar. The message body briefly describes WHY the change matters (one to three sentences). Sign with the standard `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.
6. **Dispatch reviewer trio** scoped to the commit's diff, in parallel + background:
   - `comprehensive-review:full-review` — architecture + design + style sweep
   - `security-scanning:security-sast` — security-specific anti-patterns
   - `code-simplifier:code-simplifier` — over-abstraction / dead code
7. **Continue to next task immediately.** Do NOT wait for reviewer agents to complete. Fold their findings into the next forward commit when they surface; never amend the commit they reviewed.

### 3. PR creation

After the last task's commit lands, push:

```bash
git push -u origin prd/<slug>
```

Create the PR via `gh pr create`:

```bash
gh pr create \
  --title "<conventional-type>(<scope>): <PRD acceptance summary>" \
  --body "$(cat <<'EOF'
## PRD

[<PRD-name>](docs/plans/<prd-slug>.prq.md)

## Summary

<2-3 bullets covering the PRD's deliverables>

## Acceptance criteria

<copy the PRD's "Definition of Done" section, with [x] for met and [ ] for unmet at PR-open time>

## Test plan

- [ ] CI green
- [ ] Local: <relevant pnpm test commands all green>
- [ ] Reviewer threads resolved
- [ ] No requested-changes pending

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### 4. Review feedback cycle

Poll the PR state every 60 seconds until ready-to-merge OR STOP_FAIL. See [AUTONOMY.md](./AUTONOMY.md) for the GraphQL specifics.

**Bounded polling.** The executor MUST cap each polling phase to prevent indefinite hangs:

- **CI poll:** max 30 minutes (30 iterations at 60s). If CI hasn't completed in 30 min, halt — something is stuck (runner outage, infinite-loop test, etc.). Document in `.agent-state/HALT.md` per AUTONOMY.md STOP_FAIL category 1.
- **Review-feedback poll:** max 24 hours total (the executor doesn't expect human reviewers; bots respond within minutes). If 24h elapses with reviews still pending, halt — reviewer infrastructure is broken.
- **Auto-merge convergence poll:** max 60 minutes (CI + auto-merge typically resolves in under 10 min; 60 min is generous). If auto-merge doesn't fire in 60 min after gates went green, halt — merge gate misconfiguration.
- **Per-thread address-and-resolve cycle:** max 3 attempts. If the same thread keeps reopening after addressing, halt — feedback loop with the reviewer needs human input.

Each bound is documented as a STOP_FAIL trigger in AUTONOMY.md. The executor never falls into an indefinite loop.

Summary of operations within the loop:

- **CI checks:** poll via `gh pr checks <number> --json state,name,conclusion`. If any check is failing, the executor:
  - Reads the failure logs (`gh run view <run-id> --log-failed`).
  - Diagnoses + fixes in code.
  - Commits + pushes the fix on the same branch.
  - Re-runs the polling loop (counts toward the 30-min cap).
- **Review comments (line-level):** poll via `gh api "repos/{owner}/{repo}/pulls/{number}/comments"` (the `gh api` CLI auto-resolves `{owner}/{repo}` against the current repo's `origin` remote — documented behavior, see AUTONOMY.md). For each unresolved comment:
  - Read the comment body + the line context.
  - Address inline (write the code change).
  - Commit with a message referencing the comment thread.
  - Push.
  - **Resolve the thread via GraphQL** (`resolveReviewThread` mutation — see AUTONOMY.md). Resolution is an explicit action, not a side effect of pushing.
- **Review-level requested changes:** when a reviewer submits a `CHANGES_REQUESTED` review, the PR is blocked from merge. Address every comment in that review, then either:
  - **Re-request review** from the reviewer (if it's an external human reviewer).
  - **Self-resolve** when reviewer == PR author (the autonomous executor reviewing its own work via Claude agents). The executor submits a follow-up `APPROVE` review on its own behalf via GraphQL (`addPullRequestReview` with `event: APPROVE`). This is permitted because the bot is reviewing what the bot itself wrote — there's no separation-of-duty conflict in autonomous mode.

### 5. Merge gate

The PR may merge ONLY when ALL of these are true:

- [ ] All required CI checks `conclusion: SUCCESS`.
- [ ] Zero unresolved review threads (queried via GraphQL — see AUTONOMY.md).
- [ ] Zero `CHANGES_REQUESTED` reviews not subsequently dismissed or addressed.
- [ ] PR body's "Acceptance criteria" checklist fully `[x]`.
- [ ] Branch is up-to-date with `main` (rebase on top if not — `git fetch origin main && git rebase origin/main`).

Merge via:

```bash
gh pr merge <number> --squash --delete-branch
```

Squash-merge is the project standard; never use merge commits or rebase-merge. The squash commit message is the PR title (Conventional Commits format). `--delete-branch` cleans up the remote.

### 6. Post-merge

After successful merge:

1. `git checkout main && git pull --ff-only && git branch -D prd/<slug>` (clean local).
2. Update `.agent-state/directive.md` — mark the PRD `[x]`, advance the `Currently working on` pointer to the next PRD.
3. Run the pre-execution checklist for the next PRD.
4. Begin next PRD's branch + tasks.

## Reviewer dispatch protocol

Per autonomy doctrine in `~/.claude/CLAUDE.md`: after EACH commit, dispatch the reviewer trio in parallel + background, scoped to the commit's diff. The dispatch is fire-and-forget; the executor does not wait for results.

Findings surface either:
- **Inline as PR review comments** (when the reviewer agent writes them via `gh pr review` or equivalent). The executor handles them as part of the standard review feedback cycle in step 4 above.
- **In a `comments/<commit-sha>.md` file** under the PRD branch, if the reviewer agent isn't configured to post directly. The executor reads these on the next commit and folds findings forward.

Never amend a reviewed commit. Findings are addressed in subsequent commits, preserving the audit trail of "reviewed at SHA X; addressed at SHA Y".

## Conventional commit type cheat-sheet

| Type | Use for |
|---|---|
| `feat` | New functionality (new module, new function, new file with new behavior) |
| `fix` | Bug fix in existing code |
| `test` | Adding or modifying tests with no behavior change in production code |
| `docs` | Documentation only |
| `chore` | Tooling, configuration, dependency bumps, file moves with no behavior change |
| `refactor` | Behavior-preserving structural change |
| `perf` | Performance improvement |
| `style` | Formatting only (rare; biome handles this automatically) |
| `ci` | CI / workflow changes |
| `build` | Build system / packaging changes |

Scope is the package being touched: `feat(engine):`, `test(persistence):`, `chore(ai):`, etc. Multi-package changes use the highest-level affected scope or omit scope.

## Halt + recovery

If a STOP_FAIL condition triggers (CI red after good-faith fixes, reviewer thread requesting scope change, repo state corruption, auth failure):

1. Write the halt reason + last-known-good SHA to `.agent-state/HALT.md`.
2. Update `.agent-state/directive.md` with `Status: HALTED`.
3. Do NOT close the PR. Do NOT delete the branch. Leave the work-in-progress intact for the next session to pick up.
4. Surface to the user via the standard halt-message format (one paragraph: what went wrong, what was tried, what specifically blocks further progress).

The next session's `orient` hook reads `HALT.md` first; the user's response either unblocks (clearing HALT.md) or provides direction to the executor.

## Forward references

- [AUTONOMY.md](./AUTONOMY.md) — concrete `gh` + GraphQL recipes for review thread resolution, change-request handling, squash-merge.
- [`.agent-state/directive.md`](../../.agent-state/directive.md) — the live queue + currently-working-on pointer.
- Per-PRD `*.prq.md` + `*.tasks.md` files — task lists with acceptance criteria.
