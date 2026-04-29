---
title: Lore
updated: 2026-04-29
status: current
domain: creative
---

# Lore

## The premise

Two players. One wood board. Twelve pucks each. The rules are old — older than the table they're played on — but the table is what most people remember.

You don't take pieces in Chonkers. You **chonk** them. You climb on top, take the dominant view, and carry the tower forward. The pieces below remember whose colour they were before they were chonked, but only the top piece speaks for the stack.

The first player to plant every one of their towers on the far side of the table — top of every stack the right colour, every stack on the opponent's home row — wins.

That's it. There is no story mode. There is no campaign. There is no lore beyond *this game, this board, this opponent.*

---

## Voice

Surface UI copy is **plainspoken and short**. No narrators. No barker. No flavour blurbs in tooltips.

| Place | Copy style |
|-------|-----------|
| Title screen | Game name in Abril Fatface; "New game" / "Continue" / "Settings" in Lato |
| HUD | The colour to move, full stop. ("Red to move" / "White to move") |
| Win screen | "You win." (`you_win.ogg` plays under it) |
| Lose screen | "You lose." (`you_lose.ogg` plays under it) |
| Settings labels | "Volume", "Mute", "Reduce motion", "Camera angle" |
| Tutorial (when added) | One sentence per step. Imperative voice. ("Tap a piece to select it.") |

No exclamation points except at game end (the audio carries the emotion). No emoji. No "great move!" interjections.

## Naming

The game is **Chonkers**. Plural. The verb is **chonk** ("to chonk", "chonking", "you got chonked"). The towers are **stacks**, the act of detaching is a **split**, the slices in the radial overlay are **slices**. The home rows are **home rows** — both of them, never "your home row" vs "their home row" in the UI, because the game doesn't take sides.

The two players are **red** and **white** — the wood colours. Not "player 1" and "player 2", and not "black" and "white". The wood is the identity.

## Tone in motion + audio

- The ambient bed (`bg_loop.wav`) is unobtrusive — a wooden, low-frequency presence that you'd forget about between moves.
- The chonk effect (`chonk.ogg`) is the sound of one piece of wood landing on another. Not a satisfying *thunk* — a real *thock*. Heavy. Mass.
- The split effect (`split.ogg`) is sharper, lighter — a wooden click as the slice detaches.
- The game-over sting (`game_over_sting.ogg`) is a ~1.5s neutral resolution chord. The voice line ("you win" / "you lose") plays *after* the sting completes.

Motion follows the same rule. Pieces lift, arc, settle. They don't bounce comically. The only flourish in the entire UI is the radial split overlay's **flash** when the 3-second hold completes — a 240ms green pulse, then steady.

---

## What this game is *about*

It's about looking down at a board, watching your towers climb, and feeling the moment your opponent's last 1-stack gets walled in by a 4-stack you placed three turns ago.

It's not about clowns, dragons, mechs, runs, dailies, score chasing, or unlockables. There is one thing to do here: outplay the person across from you.
