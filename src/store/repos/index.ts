/**
 * Typed CRUD repos over the chonkers SQL data model.
 *
 * Each repo's surface is documented in docs/DB.md "Repos". Functions
 * accept the drizzle handle as the first argument so callers compose
 * them inside transactions. No singleton shortcuts; the broker passes
 * the handle.
 */

export * as aiStatesRepo from "./aiStates";
export * as analyticsRepo from "./analytics";
export * as matchesRepo from "./matches";
export * as movesRepo from "./moves";
