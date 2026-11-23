import { Modal, type App } from "obsidian";
import type { KeyboardBar } from "./keyboard-bar";

/**
 * A window with text fields that holds iOS's keyboard bar while it is open,
 * switched on before any field can take focus. A subclass calls
 * `super.onOpen()` first, before it draws any field, and `super.onClose()`
 * in its own `onClose`.
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

	override onOpen(): void {
		// Before any field is drawn: switching the bar on while a field already has focus shows it only once that field is focused again.
		this.keyboardBar.hold(this);
	}

	override onClose(): void {
		this.keyboardBar.release(this);
	}
}
