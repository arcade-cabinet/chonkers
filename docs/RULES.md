---
title: Chonkers — Rules Reference
updated: 2026-04-29
status: current
domain: product
---

# Chonkers — Rules Reference

Authoritative, implementation-level rules for a single game of Chonkers. Design intent lives in [DESIGN.md](./DESIGN.md). When rules disagree with this file, **this file wins**.

The mental model: **two players, twelve pieces each, climbing each other to reach the far home row.**

---

## 1. Objective

A player wins the moment **all of their top-of-stack pieces sit on the opponent's home row** simultaneously. There is no draw condition in v1; turns alternate indefinitely otherwise.

A "top-of-stack piece" is the piece on the top of any column whose top-piece colour matches the player. A 1-stack is its own top.

The win check runs after the moving player's move resolves (after any forced-split chain finishes), before control flips.

---

## 2. The Board

A 9-column × 11-row grid of square cells. Coordinates use `(col, row)` with `(0, 0)` at the red home-row's left corner from red's perspective.

| Row | Role |
|-----|------|
| 0 | Red home row (red's goal is white's home row, row 10) |
| 1, 2, 3 | Red's setup band — three rows of starting pieces |
| 4, 5, 6 | Open middle |
| 7, 8, 9 | White's setup band — three rows of starting pieces |
| 10 | White home row |

Both home rows (rows 0 and 10) are empty at start. The middle row (row 5) is also empty at start.

### Home-row treatment

Both home rows use a distinct PBR wood set (`WoodFloor008`) that contrasts with the interior playfield (`WoodFloor007`). This is purely visual — the home row functions identically across all 9 cells, and there is no per-cell grading.

### Initial piece placement

Each player starts with **12 pieces** in a 5-4-3 triangular formation:

- **Red** (setup band rows 1–3, advancing toward row 10):
  - Row 1: cols 2, 3, 4, 5, 6 (5 pieces — base of triangle)
  - Row 2: cols 2, 4, 5, 7 (4 pieces) — *see "Symmetric layout" below*
  - Row 3: cols 3, 4, 5 (3 pieces — apex)
- **White** mirrors row-symmetrically across row 5 (white in rows 7, 8, 9).

> **Symmetric layout:** the canonical 5-4-3 layout used by `src/game/initialState.ts` is the implementation source of truth. The columns above are illustrative — the game state generator is the single source for exact starting cells. Any divergence from `initialState.ts` is a documentation bug.

Row 0, row 5, and row 10 are unoccupied at game start.

All pieces start as 1-stacks of their own colour.

---

## 3. The Turn

Turns alternate strictly. Red moves first. A turn consists of **exactly one move-resolution sequence**:

1. The player selects a stack they own (top-of-stack matches their colour).
2. They either:
   - **Move** the entire stack one step to a legal destination, or
   - **Split** the stack and move a sub-stack to a legal destination (see §5).
3. The win check runs.
4. If no win, control flips to the opponent.

A player may not pass voluntarily. The only situation in which a turn does not consist of a freely chosen action is a **stalled forced-split chain** (§5.4.1): if the player's previous chain stalled because a queued run had no legal destination, their entire next turn is the chain retry — they have no other legal actions until the chain resolves or dies.

---

## 4. Movement

### 4.1 Direction

Pieces and stacks move **one cell in any of eight directions**: orthogonal (N, S, E, W) or diagonal (NE, NW, SE, SW). Moves are exactly one cell — there is no two-step or sliding move.

Movement is **not direction-locked by colour**. Either player may move toward, away from, or sideways relative to the opponent's home row.

### 4.2 Legality

A move from a source stack of height `H_src` to a destination cell with stack of height `H_dst` (where `H_dst = 0` means an empty cell) is **legal** iff:

```
H_dst >= H_src   OR   H_dst == 0
```

In words:
- **An empty cell is always reachable** (subject to direction).
- **Chonking is reachable** when the target is at least as tall as you. A 1-stack may chonk a 1-stack, 2-stack, 3-stack, etc. A 3-stack may chonk a 3-stack or taller, but **not** a 1- or 2-stack.

A 1-stack therefore acts as a **blocker** for any taller stack, creating area-denial dynamics.

### 4.3 Chonking

When a stack of height `H_src` legally moves onto a destination stack of height `H_dst`:

- The source stack is lifted whole and placed **on top** of the destination stack.
- The new stack's height is `H_src + H_dst`.
- The new top-of-stack is the **previous top of the source stack** — i.e. the moving player owns the dominant position.
- All pieces below the new top retain their original colour identity. The visual ordering is preserved bottom-up; only the top changes hands.

Chonking onto a stack you already own (your colour on top) is legal — a player can stack their own pieces. The new top is still your colour, so you remain dominant.

### 4.4 Off-board

Moves that would leave the 9×11 grid are illegal. The board has no wrap-around.

### 4.5 No jumping

There is no jumping — over single pieces, over stacks, or otherwise. The 1-cell, 8-direction rule is total.

---

## 5. Splitting

A stack of height `H ≥ 2` may be **split**. The owning player (top-of-stack matches their colour) may detach a contiguous slice of the stack and move it as a sub-stack.

### 5.1 The split overlay

Tapping a stack of height ≥ 2 opens a 2D SVG radial overlay over that stack. The overlay is divided into `H` pie slices.

- Tapping a slice toggles its selection.
- A player may select **1 to `H − 1`** slices (selecting all `H` is not a split — that's just a full-stack move).
- The slice-to-piece mapping is positional: slice index `i` corresponds to the *i*th piece from the top of the stack.

### 5.2 Hold-to-arm

After selecting slices, the player presses and **holds** anywhere on the overlay. After 3000 ms of continuous hold:

- The selected slices flash (`accent.split`).
- The device vibrates via Capacitor Haptics if available (`Haptics.impact({ style: 'medium' })`).
- The split is **armed**.

Releasing before 3000 ms cancels the arm — selection is preserved, the player may re-arm.

### 5.3 Drag-to-commit

While armed (still holding), the player drags off the stack. The first `pointermove` event with displacement > 8 px from the press origin **commits** the split:

- The selected slices detach as a sub-stack and follow the pointer in 3D screen-space.
- The player must release the pointer over a legal destination cell.
- Legal destinations are validated against the **sub-stack's height** (using the rule from §4.2).
- Releasing on an illegal cell snaps the sub-stack back to the source stack — the turn is **not** consumed.
- Releasing on a legal cell completes the move, the win check runs, and control flips.

### 5.4 Forced split chain

When the player selects `K` slices that partition into multiple contiguous runs (e.g. slices `{0, 2}` of a 3-stack → two runs `[0]` and `[2]`), the split commits **one run at a time** in top-down selection order. **All runs commit during the SAME turn**; control does not flip between detachments. The player drags each detachment in turn:

1. Drag the first run off and drop it on a legal destination cell.
2. The source stack compacts; queued run indices rebase against the residual.
3. The next run's drag overlay opens automatically. Drag and drop on a legal destination.
4. Repeat until all `K` slices have been placed. Win check runs after the final detachment lands; only then does control flip.

If the chain has any selected pair of contiguous slices, those move together as a single sub-stack of that contiguous run — i.e. selecting slices 0 and 1 of a 3-stack moves a 2-stack in one drag, not two 1-stacks.

#### 5.4.1 Chain stall (the only multi-turn case)

If at the moment a queued run is about to commit, that run has **no legal destination** (per §4.2 against the current board), the player **cannot** complete the chain on this turn. The chain freezes:

- The runs already committed this turn stay committed.
- The blocked run plus every queued tail run remain pending in `state.chain`.
- Control flips to the opponent. The opponent plays a normal turn.
- On the chain owner's **next turn**, the chain head retries: the opponent's intervening move may have opened (or closed) the destination. The chain owner has **no other legal move** until the chain resolves or dies — the chain is the only action they may take.
- If the chain head still has no legal destination on retry, the chain **dies**: pending pieces stay on the source stack as if the split never occurred for them, the chain is consumed, and control flips.

This is the **only** condition under which a single split spans multiple turns. A chain whose every queued run has a legal destination always resolves in one turn.

### 5.5 Split-and-chonk

A split sub-stack obeys the standard chonk legality rule (§4.2). A 2-stack split off a 4-stack may chonk a 2-stack, 3-stack, etc. — exactly as if it had always been a 2-stack.

---

## 6. Selection model

The pre-split selection state is **client-side only** until the split arms (after the 3-second hold). An armed split is a committed game-state mutation in flight; until commit, the source stack is still authoritative.

A player may cancel an active selection by tapping outside the overlay. This dismisses the overlay without consuming the turn.

---

## 7. End conditions (summary)

| Condition | Outcome |
|-----------|---------|
| All red top-of-stacks on row 10 | Red wins |
| All white top-of-stacks on row 0 | White wins |
| Both win conditions trigger on the same move | Moving player wins (the move that triggered the check) |
| No legal move for the player on turn | (v1: cannot occur — the rule set guarantees a legal move exists from any state with ≥1 owned piece. If proven otherwise post-launch, the rule is "current player loses.") |

There is no draw, no resignation UI in v1, and no timer.
