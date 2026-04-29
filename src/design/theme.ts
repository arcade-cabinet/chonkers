import type { ThemeProps } from "@radix-ui/themes";

/**
 * Radix Themes configuration for the Chonkers UI shell.
 *
 * The accent colour matches `tokens.accent.select` (carries selection
 * + valid-move + primary-button affordances). Surface tone is dark
 * warm to read against the wood board.
 */
export const radixTheme: ThemeProps = {
	appearance: "dark",
	accentColor: "amber",
	grayColor: "sand",
	radius: "medium",
	scaling: "100%",
	panelBackground: "translucent",
};
