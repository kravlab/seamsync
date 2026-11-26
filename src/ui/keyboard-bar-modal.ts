import { Modal, type App } from "obsidian";
import type { KeyboardBar } from "./keyboard-bar";

/**
 * A window with text fields that holds iOS's keyboard bar while it is open,
 * switched on before any field can take focus. A subclass draws its title and
 * content in `draw()` and does not override `onOpen` or `onClose`.
 */
export abstract class KeyboardBarModal extends Modal {
	/**
	 * @param app the Obsidian app
	 * @param keyboardBar the plugin's owner of iOS's bar above the keyboard, held while this window is open
	 */
	constructor(
		app: App,
		private readonly keyboardBar: KeyboardBar,
	) {
		super(app);
	}

	/**
	 * Holds the keyboard's bar, then draws the window. The bar is held before
	 * any field is drawn: switching it on while a field already has focus shows
	 * it only once that field is focused again.
	 */
	override onOpen(): void {
		this.keyboardBar.hold(this);
		this.draw();
	}

	/** Releases the keyboard's bar and empties the window. */
	override onClose(): void {
		this.keyboardBar.release(this);
		this.contentEl.empty();
	}

	/** Draws the window's title and content; called by `onOpen` once the bar is held. */
	protected abstract draw(): void;
}
