/**
 * src/store — typed CRUD over the chonkers SQL data model.
 *
 * Repos live under `repos/`. Each repo is a namespace export with
 * functions taking the drizzle handle as their first argument. The
 * sim broker passes the handle from `src/persistence/sqlite/` to
 * each repo call, never via a singleton.
 *
 * See `docs/DB.md` "Repos" for the per-table function inventory.
 */

export {
	aiStatesRepo,
	analyticsRepo,
	matchesRepo,
	movesRepo,
} from "./repos";
export type { StoreDb } from "./types";
