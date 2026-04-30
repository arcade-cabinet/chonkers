/**
 * src/analytics — pre-baked aggregate refresh logic.
 *
 * Reads from `src/persistence/sqlite/schema/matches` and writes to
 * `analytics_aggregates` via `src/store/repos/analytics`. The sim
 * broker calls `refreshOnMatchEnd` after every terminal transition.
 *
 * See docs/DB.md "analytics_aggregates" for the catalogue and
 * docs/AI.md for the consumer side (alpha/beta/rc balance tunes
 * read from these aggregates to decide weight changes).
 */

export { refreshOnMatchEnd } from "./refresh";
