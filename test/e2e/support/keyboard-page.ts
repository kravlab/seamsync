// What check 21 needs of Obsidian's page: the page code that opens the real
// keyboard and measures a window above it, the expectations on what it
// measured, and the scenarios that run them on the windows with text fields.
// Only the Android run uses it, because only a phone has an on-screen
// keyboard (the desktop's mobile emulation has none), so it stays out of the
// helpers both runs share (page.ts).
import { describe, expect, it } from "vitest";
import { PAGE_HELPERS, type ObsidianPage } from "./page";

/** Check 21's title, for the run's summary: the scenarios of this module and the ones the run adds after a login are all reported under it. */
export const KEYBOARD_CHECK_TITLE = "check 21: on a phone, the windows with text fields open at the top and scroll above the keyboard";

/** The tolerance, in CSS pixels, of the keyboard check's comparisons: layout puts boxes at fractional pixels, so a box can end 0.4 px past a line it fits. */
const LAYOUT_TOLERANCE_PX = 1;

/**
 * What `aboveKeyboard` measures in a window with a text field, in CSS pixels
 * (as `getBoundingClientRect` and `innerHeight` give them).
 */
export interface KeyboardFound {
	/** `--safe-area-inset-top`: the height of the status bar the window must start below. */
	readonly safeTop: number;
	/** The window's top with the keyboard open, before anything is scrolled. */
	readonly windowTop: number;
	/**
	 * The window's bottom, measured with `windowTop` before anything is
	 * scrolled: while the whole window ends above the keyboard, its available
	 * height excludes the keyboard, whatever fits inside it.
	 */
	readonly windowBottom: number;
	/** `--keyboard-height` once the field is focused: the height of the real keyboard Obsidian reports. */
	readonly keyboard: number;
	/**
	 * Where the visible area above the keyboard ends: `innerHeight` minus the
	 * keyboard, because `innerHeight` does not shrink when the keyboard opens.
	 */
	readonly visibleBottom: number;
	/** Whether the keyboard was still open after the scrolling, so what was measured was measured above it. */
	readonly stillOpen: boolean;
	/**
	 * The field, named "field", then each button of its row by its text, each
	 * measured right after `scrollIntoView({ block: "nearest" })` and a frame:
	 * where the user can bring it by scrolling the window's content.
	 */
	readonly elements: readonly { readonly name: string; readonly top: number; readonly bottom: number }[];
	/** After the field was blurred and the keyboard closed. */
	readonly closed: {
		/** `--keyboard-height`, which must be back to 0. */
		readonly keyboard: number;
		/** The window's computed `max-height`. */
		readonly maxHeight: number;
		/** What it is without a keyboard: `innerHeight` minus the status bar, the window's normal size. */
		readonly normalMaxHeight: number;
	};
}

/** What `expectAboveKeyboard` expects of the field's row. */
export interface AboveKeyboardExpectation {
	/**
	 * "required" (the default): the row has buttons, and at least one was
	 * measured, so a row the program failed to find does not pass. "none": the
	 * field's row has no buttons, so only the field is measured.
	 */
	readonly buttons?: "required" | "none";
}

/**
 * Expects `found` to be a window that starts at the top of the screen and
 * ends above a real keyboard, whose field and every button of its row can be
 * scrolled above it, and that has its normal size once the keyboard has
 * closed. The comparisons allow LAYOUT_TOLERANCE_PX, and the elements outside
 * the visible area are listed in one assertion, so the failure names them.
 */
export function expectAboveKeyboard(found: KeyboardFound, { buttons = "required" }: AboveKeyboardExpectation = {}): void {
	expect(found.keyboard).toBeGreaterThan(0);
	expect(found.stillOpen).toBe(true);
	expect(Math.abs(found.windowTop - found.safeTop)).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
	expect(found.windowBottom).toBeLessThanOrEqual(found.visibleBottom + LAYOUT_TOLERANCE_PX);
	expect(found.elements.length).toBeGreaterThanOrEqual(buttons === "required" ? 2 : 1);
	expect(found.elements.filter((element) => element.top < 0 || element.bottom > found.visibleBottom + LAYOUT_TOLERANCE_PX)).toEqual(
		[],
	);
	expect(found.closed.keyboard).toBe(0);
	expect(Math.abs(found.closed.maxHeight - found.closed.normalMaxHeight)).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
}

/**
 * Page code for check 21, to put after `PAGE_HELPERS` at the start of a body
 * (it uses the `until` of `evalProgram`):
 *
 * - `px(name)` is the number in the root element's computed custom property
 *   `name` (Obsidian writes `--keyboard-height` there as e.g. `295.2381px`),
 *   0 when it is not set;
 * - `frame()` resolves on the next animation frame, once layout has caught up;
 * - `aboveKeyboard(modal, field, rowButtons)` focuses `field`, which in an
 *   evaluation (it passes a user gesture) opens the real keyboard, once the
 *   window has finished opening (on a phone Obsidian slides a window in from
 *   the bottom, with a `transform` until it is in place), then waits for
 *   Obsidian to report its height, measures the window `modal` (its top and
 *   bottom), then scrolls the field and each of `rowButtons` (none for a row
 *   without buttons) into view one by one, and measures each. It blurs the
 *   field, waits for the keyboard to close and measures the window again. It
 *   resolves with a `KeyboardFound`. The keyboard's height is the number
 *   `until` resolves with, so a height of 0 is never taken for one that has
 *   arrived.
 */
export const KEYBOARD_HELPERS = `
	const px = (name) => parseFloat(getComputedStyle(activeDocument.documentElement).getPropertyValue(name)) || 0;
	const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
	const aboveKeyboard = async (modal, field, rowButtons) => {
		await until(() => ["", "none"].includes(getComputedStyle(modal).transform), 10000, "the window to finish opening");
		field.focus();
		const keyboard = await until(() => px("--keyboard-height"), 10000, "the keyboard");
		await frame();
		await frame();
		const safeTop = px("--safe-area-inset-top");
		const { top: windowTop, bottom: windowBottom } = modal.getBoundingClientRect();
		const visibleBottom = innerHeight - keyboard;
		const elements = [];
		for (const [name, element] of [["field", field], ...rowButtons.map((b) => [b.textContent, b])]) {
			element.scrollIntoView({ block: "nearest" });
			await frame();
			const { top, bottom } = element.getBoundingClientRect();
			elements.push({ name, top, bottom });
		}
		const stillOpen = px("--keyboard-height") > 0;
		field.blur();
		await until(() => px("--keyboard-height") === 0, 10000, "the keyboard to close");
		await frame();
		const closed = { keyboard: px("--keyboard-height"), maxHeight: parseFloat(getComputedStyle(modal).maxHeight), normalMaxHeight: innerHeight - safeTop };
		return { safeTop, windowTop, windowBottom, keyboard, visibleBottom, stillOpen, elements, closed };
	};`;

/**
 * Check 21 on `page`, which is a phone: the windows with text fields (the
 * connect window's login screen, a conflict block's Edit… dialog) open at the
 * top of the screen, and with the real keyboard open the whole window ends
 * above it and the field and every button in its row can be scrolled into
 * the visible area, whatever buttons the row has; with the keyboard closed
 * the window has its normal size. A test focuses the field in the page,
 * which opens the keyboard. `title` names the check for the run's summary. Each program closes every
 * window in a `finally`, and removes the note and its leaf it opened even
 * when it fails, so a failing test leaves nothing to the next. Only the
 * Android run calls it: the desktop's mobile emulation has no keyboard.
 */
export function describePhoneKeyboard(title: string, page: () => ObsidianPage): void {
	describe(title, () => {
		it("in the connect window's login screen", async () => {
			const strings = await page().strings();
			const found = (await page().eval(`
				${PAGE_HELPERS}
				${KEYBOARD_HELPERS}
				try {
					const sync = await openSyncWindow();
					(await button(${JSON.stringify(strings.connect)}, sync)).click();
					const connect = await until(() => [...activeDocument.querySelectorAll(".modal")].find((m) => m !== sync && m.querySelector("input[type=text]")), 10000, "the connect window");
					const field = connect.querySelector("input[type=text]");
					return await aboveKeyboard(connect, field, [...field.closest(".setting-item").querySelectorAll("button")]);
				} finally {
					await closeModals();
				}`)) as KeyboardFound;
			expectAboveKeyboard(found);
		});

		it("in a conflict block's Edit… dialog", async () => {
			const strings = await page().strings();
			const note = ["<<<<<<< Phone vault", "mine", "=======", "theirs", ">>>>>>> Remote", ""].join("\n");
			const found = (await page().eval(`
				${PAGE_HELPERS}
				${KEYBOARD_HELPERS}
				let file;
				let leaf;
				try {
					file = await app.vault.create("phone-keyboard-conflict.md", ${JSON.stringify(note)});
					leaf = app.workspace.getLeaf(true);
					await leaf.setViewState({ type: "markdown", state: { file: file.path, mode: "source", source: false } });
					const row = await until(() => leaf.view.contentEl.querySelector(".seamsync-conflict-actions"), 10000, "the action row");
					(await button(${JSON.stringify(strings.conflictEdit)}, row)).click();
					const dialog = await until(() => activeDocument.querySelector(".modal.seamsync-conflict-edit"), 10000, "the Edit dialog");
					const field = dialog.querySelector("textarea");
					if (!field) throw new Error("the Edit dialog has no text field");
					const buttonsBelow = [...dialog.querySelector(".modal-content").querySelectorAll("button")].filter((b) => field.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
					return await aboveKeyboard(dialog, field, buttonsBelow);
				} finally {
					await closeModals();
					leaf?.detach();
					if (file) await app.vault.delete(file);
				}`)) as KeyboardFound;
			expectAboveKeyboard(found);
		});
	});
}

/**
 * Check 21's test for the connect window's Remote screen, to put in a
 * `describe` titled KEYBOARD_CHECK_TITLE. The screen shows only after a
 * login, so the run calls it from where it has logged in (check 1), with the
 * window open and showing the New folder row: the test measures the Device
 * name field (its row has no buttons) and the New folder field with its
 * buttons, as the login screen's field is. It leaves the window open, for the
 * rest of check 1 to go on in it.
 */
export function itRemoteScreenAboveKeyboard(page: () => ObsidianPage): void {
	it("in the connect window's Remote screen, after the login", async () => {
		const strings = await page().strings();
		const found = (await page().eval(`
			${PAGE_HELPERS}
			${KEYBOARD_HELPERS}
			const rowNamed = (root, name) => [...root.querySelectorAll(".modal .setting-item")].find((item) => item.querySelector(".setting-item-name")?.textContent === name);
			const folderRow = rowNamed(activeDocument, ${JSON.stringify(strings.newFolder)});
			if (!folderRow) throw new Error("the connect window is not showing the Remote screen");
			const connect = folderRow.closest(".modal");
			const deviceRow = rowNamed(connect, ${JSON.stringify(strings.deviceName)});
			if (!deviceRow) throw new Error("the Remote screen has no Device name row");
			return {
				device: await aboveKeyboard(connect, deviceRow.querySelector("input"), []),
				folder: await aboveKeyboard(connect, folderRow.querySelector("input"), [...folderRow.querySelectorAll("button")]),
			};`)) as { device: KeyboardFound; folder: KeyboardFound };
		expectAboveKeyboard(found.device, { buttons: "none" });
		expectAboveKeyboard(found.folder);
	});
}
