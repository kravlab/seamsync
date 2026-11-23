// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { ConflictBlock } from "../../src/engine/conflict-blocks";
import { ConflictEditModal } from "../../src/ui/conflict-edit-modal";
import { selectStrings } from "../../src/ui/i18n/strings";
import { createKeyboardBar } from "../../src/ui/keyboard-bar";

const strings = selectStrings("en");

const block: ConflictBlock = {
	startLine: 0,
	separatorLine: 2,
	endLine: 4,
	localLabel: "Phone",
	remoteLabel: "Remote",
	local: "mine\n",
	remote: "theirs\n",
};

/**
 * A keyboard bar whose native calls are recorded: `calls` lists, in order,
 * every call it was asked to make, as the `isVisible` it was asked to
 * switch to and whether the observed window already held a text field at
 * that moment. Tests assert on these alone, since they are all the user can
 * ever observe of the bar.
 */
function recordedBar(observed: () => ParentNode | undefined = () => undefined): {
	bar: ReturnType<typeof createKeyboardBar>;
	calls: { isVisible: boolean; hadTextField: boolean }[];
} {
	const calls: { isVisible: boolean; hadTextField: boolean }[] = [];
	const bar = createKeyboardBar({
		setVisible: (isVisible) => {
			calls.push({ isVisible, hadTextField: observed()?.querySelector("textarea") != null });
			return Promise.resolve();
		},
	});
	return { bar, calls };
}

/** The `isVisible` of each of `calls`, in order. */
function switchedTo(calls: readonly { isVisible: boolean }[]): boolean[] {
	return calls.map((call) => call.isVisible);
}

/** An Edit… window over `bar`, just opened; `onSave` answers Save. */
function openedEditWindow(bar: ReturnType<typeof createKeyboardBar>, onSave: (text: string) => boolean = () => true): ConflictEditModal {
	const modal = new ConflictEditModal({} as never, strings, block, onSave, bar);
	modal.open();
	return modal;
}

/** Presses the button of `modal` labelled `label`. */
function press(modal: ConflictEditModal, label: string): void {
	const button = [...modal.contentEl.querySelectorAll("button")].find((found) => found.textContent === label);
	if (!button) throw new Error(`no button labelled ${label}`);
	button.click();
}

afterEach(() => {
	document.body.replaceChildren();
});

describe("the keyboard's bar", () => {
	it("is turned on by opening the Edit… window, before its text field exists", () => {
		let modal: ConflictEditModal | undefined;
		const { bar, calls } = recordedBar(() => modal?.modalEl);
		modal = new ConflictEditModal({} as never, strings, block, () => true, bar);

		modal.open();

		expect(calls).toEqual([{ isVisible: true, hadTextField: false }]);
	});

	it("is turned off by saving, when the block is still there", () => {
		const { bar, calls } = recordedBar();
		const modal = openedEditWindow(bar, () => true);

		press(modal, strings.save);

		expect(switchedTo(calls)).toEqual([true, false]);
	});

	it("stays on when saving finds the block changed and the window stays open", () => {
		const { bar, calls } = recordedBar();
		const modal = openedEditWindow(bar, () => false);

		press(modal, strings.save);

		expect(switchedTo(calls)).toEqual([true]);
		expect(modal.modalEl.isConnected).toBe(true);
	});

	it("is turned off by cancelling", () => {
		const { bar, calls } = recordedBar();
		const modal = openedEditWindow(bar);

		press(modal, strings.cancel);

		expect(switchedTo(calls)).toEqual([true, false]);
	});

	it("is turned off by closing the window otherwise, as Escape or the close button do", () => {
		const { bar, calls } = recordedBar();
		const modal = openedEditWindow(bar);

		modal.close();

		expect(switchedTo(calls)).toEqual([true, false]);
	});

	it("stays on when the Edit… window closes over another place that holds it", () => {
		const { bar, calls } = recordedBar();
		bar.hold({});
		const modal = openedEditWindow(bar);

		modal.close();

		expect(switchedTo(calls)).toEqual([true]);
	});
});
