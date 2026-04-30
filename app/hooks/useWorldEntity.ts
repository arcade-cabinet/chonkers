/**
 * Returns the singleton "app state" entity that holds Screen,
 * Selection, HoldProgress, AiThinking, and (when present) the
 * Match + SplitChainView traits. `createSimWorld` spawns exactly
 * one entity carrying these; `useQueryFirst(Screen)` recovers it.
 */

import { useQueryFirst } from "koota/react";
import { Screen } from "@/sim";

export function useWorldEntity() {
	const entity = useQueryFirst(Screen);
	if (!entity) {
		throw new Error(
			"useWorldEntity: world entity missing — was the tree wrapped in <SimProvider>?",
		);
	}
	return entity;
}
