import { Platform, type Modal } from "obsidian";

/** How `fitForPhone` fits a modal. */
export interface PhoneFit {
	/** The modal has text fields: on a phone it sits at the top of the screen and scrolls above the keyboard. */
	readonly textFields?: boolean;
}

/**
 * Marks `modal` on a phone so the stylesheet makes its buttons at least
 * 44 px tall, big enough to tap (spec, "Status, notices, guidance"). Every
 * modal of the plugin calls it when it is built; one without buttons, such
 * as the restore list, only carries the class.
 *
 * A modal with text fields opts in with `textFields`: the stylesheet then
 * puts it at the top of the screen, its available height excludes the
 * keyboard height Obsidian reports, and its content scrolls, so a field
 * stays above the keyboard.
 */
export function fitForPhone(modal: Modal, options: PhoneFit = {}): void {
	if (!Platform.isPhone) return;
	modal.modalEl.addClass("seamsync-phone");
	if (options.textFields) modal.modalEl.addClass("seamsync-phone-fields");
}
