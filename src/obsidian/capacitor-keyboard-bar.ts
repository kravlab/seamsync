import { isRecord } from "./is-record";

/**
 * Turns the Capacitor Keyboard plugin of Obsidian mobile into a function
 * that shows or hides iOS's native bar above the keyboard (the one with the
 * "Done" button). This is not part of Obsidian's plugin API: the plugin
 * lives in an untyped `Capacitor` global of the window.
 *
 * @param win the window holding the Capacitor global
 * @returns the function that switches the bar; it rejects, with a message telling which part is missing, when the native plugin is not there
 */
export function capacitorAccessoryBarSetter(win: Window): (isVisible: boolean) => Promise<void> {
	return async (isVisible) => {
		const capacitor: unknown = Reflect.get(win, "Capacitor");
		// Told apart from a missing Keyboard plugin, since the logged error is all a bug report has to go on.
		if (!isRecord(capacitor)) throw new Error("there is no Capacitor global on the window");
		const plugins = capacitor.Plugins;
		const keyboard = isRecord(plugins) ? plugins.Keyboard : undefined;
		const method = isRecord(keyboard) ? keyboard.setAccessoryBarVisible : undefined;
		if (typeof method !== "function") throw new Error("the Capacitor Keyboard plugin has no setAccessoryBarVisible method");
		await Reflect.apply(method, keyboard, [{ isVisible }]);
	};
}
