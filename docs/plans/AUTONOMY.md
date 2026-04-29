---
title: Autonomy — gh + GraphQL recipes for autonomous PR cycles
updated: 2026-04-29
status: current
domain: ops
---

# Autonomy: gh + GraphQL Recipes

Concrete tooling for the autonomous PR feedback cycle described in [EXECUTION.md](./EXECUTION.md). This document is the executor's reference manual when actually performing the operations — every recipe is verified against the GitHub GraphQL v4 API and the `gh` CLI's behavior.

The chonkers repo (`arcade-cabinet/chonkers`) is owned by the executor's GitHub identity, with `repo` token scope. All operations described here work within that authentication context.

## Polling PR state

After pushing a commit to a PR's branch, poll for state changes. The base loop:

```bash
PR_NUMBER=42
while true; do
  STATE=$(gh pr view "$PR_NUMBER" --json state,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup --jq '{state, mergeable, mergeStateStatus, reviewDecision, ci: [.statusCheckRollup[] | {name, conclusion: .conclusion // .state}]}')
  echo "$STATE"
  # ... evaluate; either continue (still pending), break (merge ready), or repair (CI failing)
  sleep 60
done
```

Useful gh-jq combinations for state assessment:

```bash
# Are all checks passing?
gh pr checks "$PR_NUMBER" --json state,name,conclusion --jq '[.[] | select(.conclusion != "SUCCESS" and .conclusion != "NEUTRAL" and .conclusion != "SKIPPED")] | length == 0'

# Which checks are failing?
gh pr checks "$PR_NUMBER" --json name,conclusion,detailsUrl --jq '[.[] | select(.conclusion == "FAILURE" or .conclusion == "CANCELLED" or .conclusion == "TIMED_OUT")]'

# Mergeable and clean?
gh pr view "$PR_NUMBER" --json mergeable,mergeStateStatus --jq '.mergeable == "MERGEABLE" and .mergeStateStatus == "CLEAN"'
```

`mergeStateStatus` values to know:
- `CLEAN` — all checks passing, no requested changes, ready to merge
- `BEHIND` — branch behind base; rebase needed
- `BLOCKED` — required check failing OR required review missing
- `DIRTY` — merge conflicts
- `UNSTABLE` — non-required checks failing (mergeable but not recommended)
- `HAS_HOOKS` — branch protection hooks queued
- `UNKNOWN` — GitHub still computing

`reviewDecision` values:
- `APPROVED` — at least one approving review, no requested-changes outstanding
- `CHANGES_REQUESTED` — at least one outstanding requested-changes review
- `REVIEW_REQUIRED` — required review not yet submitted
- `null` — no required reviewers

The merge gate from EXECUTION.md is satisfied when:
- `mergeable == "MERGEABLE"`
- `mergeStateStatus == "CLEAN"`
- `reviewDecision == "APPROVED"` OR `null`
- All review threads resolved (queried separately — see below)

## Reading review feedback

### Line-level review comments

```bash
PR_NUMBER=42
gh api "repos/{owner}/{repo}/pulls/$PR_NUMBER/comments" --paginate \
  --jq '.[] | select(.in_reply_to_id == null) | {id, path, line, body, user: .user.login, created_at}'
```

This returns top-level comment threads (not replies). Each comment has:
- `id` — numeric comment ID, used for in-reply
- `path` — file path
- `line` — line number in the diff
- `body` — comment text
- `user.login` — commenter's GitHub username

To read the full thread (parent + replies):

```bash
gh api "repos/{owner}/{repo}/pulls/$PR_NUMBER/comments" --paginate \
  --jq 'group_by(.in_reply_to_id // .id) | map({thread_root: .[0].id, comments: [.[] | {id, body, user: .user.login, created_at}]})'
```

### Review-level reviews

```bash
gh pr view "$PR_NUMBER" --json reviews --jq '.reviews[] | {state, author: .author.login, submittedAt, body}'
```

States: `COMMENTED`, `APPROVED`, `CHANGES_REQUESTED`, `DISMISSED`, `PENDING`.

A `CHANGES_REQUESTED` review blocks merge until either:
- The reviewer dismisses it (re-reviews and approves), OR
- A repo admin dismisses it (`gh pr review <number> --dismiss --message "..."` — works only with admin permission OR when reviewer == author in autonomous mode).

### Review threads (the actually-resolvable unit)

Comments are organized into "threads" (a parent comment + its replies on a single line). Threads have an `isResolved` boolean and can be resolved/unresolved via GraphQL mutations. **Threads are the unit of resolution** — `gh` CLI doesn't directly expose them, only GraphQL does.

Query open threads:

```bash
PR_NUMBER=42
gh api graphql -f query='
  query($owner:String!, $repo:String!, $number:Int!) {
    repository(owner:$owner, name:$repo) {
      pullRequest(number:$number) {
        reviewThreads(first:100) {
          nodes {
            id
            isResolved
            isOutdated
            comments(first:1) {
              nodes {
                path
                position
                body
                author { login }
              }
            }
          }
        }
      }
    }
  }' -F owner=arcade-cabinet -F repo=chonkers -F number=$PR_NUMBER \
  --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false and .isOutdated == false)'
```

Each unresolved, non-outdated thread needs to be either addressed (code change) or determined to be out-of-scope (and resolved with explanation). The executor reads each, decides, acts.

## Resolving review threads

The merge gate requires zero unresolved threads. After addressing a thread's feedback (committing + pushing the fix), explicitly resolve via GraphQL:

```bash
THREAD_ID="MDIyOlB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkXzU2NzIzNDU2"  # base64-encoded; from the query above
gh api graphql -f query='
  mutation($threadId:ID!) {
    resolveReviewThread(input:{threadId:$threadId}) {
      thread {
        id
        isResolved
      }
    }
  }' -f threadId="$THREAD_ID"
```

Returns `isResolved: true` on success. The thread no longer blocks merge.

For the case where addressing is unnecessary (the comment was just a question that was answered, or pointed at code that was removed entirely), reply to the thread first explaining the resolution, THEN resolve:

```bash
# 1. Reply to the thread (replies are line-comments with in_reply_to)
PARENT_COMMENT_ID=12345
gh api "repos/{owner}/{repo}/pulls/$PR_NUMBER/comments" \
  --method POST \
  -f body="Addressed by removing the function entirely in commit abc1234." \
  -f in_reply_to=$PARENT_COMMENT_ID

# 2. Resolve the thread
gh api graphql -f query='mutation($id:ID!) { resolveReviewThread(input:{threadId:$id}) { thread { isResolved } } }' \
  -f id="$THREAD_ID"
```

The reply preserves audit trail; the resolution unblocks the merge gate.

## Dismissing CHANGES_REQUESTED reviews

When a reviewer's review state is `CHANGES_REQUESTED`, the PR is blocked even after every individual thread is resolved. The review itself must be dismissed OR replaced by an approving review.

In autonomous mode (executor == author == "reviewer"), the executor dismisses its own prior CHANGES_REQUESTED review:

```bash
REVIEW_ID=987654321
gh api graphql -f query='
  mutation($reviewId:ID!, $message:String!) {
    dismissPullRequestReview(input:{
      pullRequestReviewId:$reviewId,
      message:$message
    }) {
      pullRequestReview {
        id
        state
      }
    }
  }' -f reviewId="$REVIEW_ID" -f message="Addressed in subsequent commits abc1234..def5678; all threads resolved."
```

`pullRequestReview.state` returns `DISMISSED` on success.

The dismissal message becomes part of the PR's audit trail. Be specific: list the SHAs that addressed the original review's concerns.

For external human reviewers (the user, a teammate), the executor does NOT dismiss — instead it re-requests review:

```bash
gh api graphql -f query='
  mutation($prId:ID!, $userIds:[ID!]!) {
    requestReviews(input:{
      pullRequestId:$prId,
      userIds:$userIds
    }) {
      pullRequest {
        reviewRequests(first:10) { totalCount }
      }
    }
  }' -f prId="$PR_GLOBAL_ID" -f userIds='["MDQ6VXNlcjEyMzQ1Njc4"]'
```

Re-request only after every line-level thread from the review is resolved. Otherwise the reviewer sees a re-request with their feedback still unaddressed, which is rude and signals the executor isn't reading carefully.

## Self-approval (autonomous mode)

When CI is green, all threads are resolved, and any prior CHANGES_REQUESTED reviews from the executor itself are dismissed, the PR may still need an explicit approval to satisfy `reviewDecision: APPROVED`. In autonomous mode (executor == author):

```bash
gh api graphql -f query='
  mutation($prId:ID!) {
    addPullRequestReview(input:{
      pullRequestId:$prId,
      event:APPROVE,
      body:"Autonomous self-approval: all acceptance criteria met, CI green, all reviewer threads resolved."
    }) {
      pullRequestReview {
        id
        state
      }
    }
  }' -f prId="$PR_GLOBAL_ID"
```

Returns `state: APPROVED`. This is GitHub's documented behavior: the PR author CAN submit reviews on their own PR. The branch protection rule that blocks "approval from author" is opt-in per-repo and is NOT enabled on `arcade-cabinet/chonkers`. The executor verifies this before relying on self-approval:

```bash
gh api "repos/arcade-cabinet/chonkers/branches/main/protection" --jq '.required_pull_request_reviews.required_approving_review_count // 0'
```

If the count is 0, no approval is needed at all (the merge gate is just CI + threads + DCO if applicable). If the count is ≥1 and self-approval is allowed, the recipe above works. If self-approval is blocked, autonomous mode requires user intervention — which is a STOP_FAIL.

## Squash-merging

After all gates pass, merge:

```bash
gh pr merge "$PR_NUMBER" --squash --delete-branch
```

`--squash` consolidates all commits into one; the message is the PR title. `--delete-branch` cleans up the remote feature branch. **Always squash-merge for chonkers** — it's the project standard per `~/.claude/CLAUDE.md`.

If the merge fails because the branch is behind:

```bash
gh pr update-branch "$PR_NUMBER"  # rebases prd/<slug> onto main
# wait for the resulting CI to pass
gh pr merge "$PR_NUMBER" --squash --delete-branch
```

If the merge fails because of a conflict that `update-branch` can't resolve, halt — conflicts are a STOP_FAIL category requiring user input.

## Auto-merge (recommended approach)

Rather than manually polling + merging, enable GitHub's auto-merge feature so the PR merges automatically once gates pass:

```bash
gh api graphql -f query='
  mutation($prId:ID!) {
    enablePullRequestAutoMerge(input:{
      pullRequestId:$prId,
      mergeMethod:SQUASH
    }) {
      pullRequest {
        autoMergeRequest {
          enabledAt
          mergeMethod
        }
      }
    }
  }' -f prId="$PR_GLOBAL_ID"
```

GitHub then merges the PR the moment all gates clear. The executor still polls (to know when merge happens + to start the next PRD) but doesn't manually invoke `gh pr merge`. Reduces race conditions where the executor merges between two CI runs.

The chonkers repo has auto-merge enabled at the org level, per the existing `automerge.yml` workflow that auto-approves dependabot + release-please PRs. The executor uses the same mechanism.

## Getting the PR's GraphQL global ID

Several mutations above need `$PR_GLOBAL_ID` (a base64-encoded global ID, not the PR number). Fetch it once per PR:

```bash
PR_NUMBER=42
PR_GLOBAL_ID=$(gh api graphql -f query='
  query($owner:String!, $repo:String!, $number:Int!) {
    repository(owner:$owner, name:$repo) {
      pullRequest(number:$number) { id }
    }
  }' -F owner=arcade-cabinet -F repo=chonkers -F number=$PR_NUMBER \
  --jq '.data.repository.pullRequest.id')
echo "$PR_GLOBAL_ID"
# Example: PR_kwDOLp9aZc6BMsHc
```

Cache this in a variable for the lifetime of the PR cycle.

## STOP_FAIL conditions and recovery

The autonomous executor halts and reports to the user under these conditions:

### 1. CI red after good-faith resolution

After three rounds of fix-and-push attempting to clear a CI failure, the executor halts. Capture in `.agent-state/HALT.md`:

```markdown
# HALT: CI red after 3 fix attempts

**PR:** #42 (prd/persistence)
**Failed check:** browser-test-suite
**Failure mode:** ResourceError: jeep-sqlite custom element registration timeout
**Attempts:**
- abc1234 — Increased registration timeout from 5s to 10s
- def5678 — Added explicit `customElements.whenDefined` await
- ghi9012 — Added retry loop around registration
**Last failing run:** https://github.com/arcade-cabinet/chonkers/actions/runs/12345

The failure pattern matches a known jeep-sqlite + Chromium race that's unresolved upstream. Manual intervention recommended: either pin to a different jeep-sqlite version or add a workaround to ./e2e/_setup.ts.
```

### 2. Reviewer thread requesting scope change

When a thread asks for behavior outside the PRD's scope, the executor cannot autonomously decide whether to expand scope. Halt:

```markdown
# HALT: Scope-change request on PR #42

**Thread:** comment-id-12345 on src/persistence/games/connection.ts:67
**Reviewer:** @code-simplifier-bot
**Request:** "This connection-pool design is overcomplicated for a single-DB use case. Recommend collapsing to a single global connection."

The PRD explicitly requires per-DB-name isolation for test concurrency (acceptance criterion E2). The reviewer's recommendation conflicts with that. Need user direction:
- Honor the reviewer (revise PRD acceptance criteria), OR
- Reject the recommendation (resolve thread with explanation, proceed with merge).
```

### 3. Repo state corruption

Force-push to main, divergence from origin, unresolved merge conflict on a branch the executor doesn't recognize. Halt immediately, do not attempt repair without user input.

### 4. Authentication failure

`gh auth status` returns failure or `git push` fails with auth error. Halt — credentials need refresh.

In every halt case:

1. Write `.agent-state/HALT.md` with the structure above.
2. Update `.agent-state/directive.md` `Status: HALTED` (from `ACTIVE`).
3. Do NOT close the PR or delete the branch.
4. Do NOT attempt destructive recovery (no `git reset --hard`, no `--force` push, no branch delete).
5. Surface to user with a one-paragraph summary.

The next session's `orient` hook reads `HALT.md` first; the user's response either unblocks (clearing HALT.md, returning Status to ACTIVE) or provides direction.

## Quick reference

| Need | Command |
|---|---|
| Get PR state | `gh pr view N --json state,mergeable,mergeStateStatus,reviewDecision` |
| List failing checks | `gh pr checks N --jq '.[] \| select(.conclusion=="FAILURE")'` |
| List unresolved threads | GraphQL query above |
| Resolve thread | `gh api graphql -f query='mutation { resolveReviewThread(input:{threadId:"X"}) { thread { isResolved } } }'` |
| Dismiss own review | `gh api graphql ... dismissPullRequestReview ...` |
| Self-approve | `gh api graphql ... addPullRequestReview ... event:APPROVE` |
| Enable auto-merge (squash) | `gh api graphql ... enablePullRequestAutoMerge ... mergeMethod:SQUASH` |
| Manual merge | `gh pr merge N --squash --delete-branch` |
| Update from main | `gh pr update-branch N` |
