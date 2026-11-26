/**
 * Installs a fake Capacitor global whose Keyboard plugin has
 * `setAccessoryBarVisible`, as Obsidian mobile has one. Pair it with
 * `removeCapacitor` after the test.
 *
 * @param setAccessoryBarVisible what the Keyboard plugin offers as `setAccessoryBarVisible`; anything, so a test can install a broken one
 */
export function installNativeKeyboard(setAccessoryBarVisible: unknown): void {
	Object.assign(window, { Capacitor: { Plugins: { Keyboard: { setAccessoryBarVisible } } } });
}

/** Removes the fake Capacitor global, leaving the window as it was before `installNativeKeyboard`. */
export function removeCapacitor(): void {
	Reflect.deleteProperty(window, "Capacitor");
}
