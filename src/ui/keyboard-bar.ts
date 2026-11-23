/**
 * What a place with text fields (a window, a settings tab) may do with the
 * keyboard's bar. Places get no more than this, so that none can switch the
 * bar off under another place that still shows fields.
 */
export interface KeyboardBar {
	/** Asks for the bar while `place` shows text fields; asking again while holding it counts once. */
	hold(place: object): void;
	/** Gives the bar up once `place` no longer shows text fields; a place that holds nothing changes nothing. */
	release(place: object): void;
}

/** The keyboard's bar as the plugin shell sees it: the places' view of it, and the end of its life. */
export interface KeyboardBarOwner extends KeyboardBar {
	/** Hides the bar if some place still holds it, and forgets every holder, so a release afterwards finds none. For the plugin's unload. */
	dispose(): void;
}

/**
 * Owns iOS's native bar above the keyboard (the one with the "Done" button)
 * for the whole plugin, so that places with text fields cannot fight over it.
 * The bar is shown while at least one place holds it. Obsidian hides it by
 * default and its state cannot be read back, hence the bar is hidden again on
 * the last release and on dispose, leaving it as Obsidian had it.
 *
 * @param options.setVisible switches the native bar; the plugin shell injects it, so this owner knows nothing of platforms. A failure of it is logged and otherwise ignored
 */
export function createKeyboardBar(options: { readonly setVisible: (isVisible: boolean) => Promise<void> }): KeyboardBarOwner {
	const holders = new Set<object>();

	/**
	 * Switches the native bar without waiting for it. Nobody can act on a
	 * failure (the user only loses a convenience), so it is logged for a bug
	 * report instead of being thrown or shown.
	 */
	const switchTo = (isVisible: boolean): void => {
		options.setVisible(isVisible).catch((error: unknown) => {
			console.error("seamsync: switching the keyboard's bar failed", error);
		});
	};

	return {
		hold(place) {
			const wasHeld = holders.size > 0;
			holders.add(place);
			if (!wasHeld) switchTo(true);
		},
		release(place) {
			if (holders.delete(place) && holders.size === 0) switchTo(false);
		},
		dispose() {
			if (holders.size > 0) switchTo(false);
			holders.clear();
		},
	};
}
