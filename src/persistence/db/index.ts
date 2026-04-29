/**
 * Public surface for the `db` namespace.
 *
 * Connection lifecycle (`exists`, `connect`, `close`) is exposed
 * directly. Per-connection operations (`exec`, `query`, `transaction`)
 * are methods on the DbConnection returned by `connect` — see
 * src/persistence/db/connection.ts.
 *
 * The package has no opinion on schema. Consumers wanting structured
 * tables call `db.exec('CREATE TABLE ...')` themselves; chonkers does
 * this through `src/schema/` (separate package).
 */

import { close, connect, exists } from "./connection";

export const db = {
	exists,
	connect,
	close,
} as const;

export type { DbConnection } from "./connection";
