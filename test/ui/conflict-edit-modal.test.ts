// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { ConflictBlock } from "../../src/engine/conflict-blocks";
import { ConflictEditModal } from "../../src/ui/conflict-edit-modal";
import { ConnectModal } from "../../src/ui/connect-modal";
import { selectStrings } from "../../src/ui/i18n/strings";
import type { KeyboardBarOwner } from "../../src/ui/keyboard-bar";
import { connectionServiceFor } from "../fakes/fake-connection-service";
import { FakeApp } from "../fakes/obsidian-app";
import { recordedKeyboardBar, switchedTo } from "../fakes/recorded-keyboard-bar";

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

/** An Edit… window over `bar`, just opened; `onSave` answers Save. */
function openedEditWindow(bar: KeyboardBarOwner, onSave: (text: string) => boolean = () => true): ConflictEditModal {
	const modal = new ConflictEditModal(new FakeApp() as never, strings, block, onSave, bar);
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
		const { bar, switches } = recordedKeyboardBar(() => modal?.modalEl.querySelector("textarea") != null);
		modal = new ConflictEditModal(new FakeApp() as never, strings, block, () => true, bar);

		modal.open();

		expect(switches).toEqual([{ isVisible: true, observed: false }]);
	});

	it("is turned off by saving, when the block is still there", () => {
		const { bar, switches } = recordedKeyboardBar();
		const modal = openedEditWindow(bar, () => true);

		press(modal, strings.save);

		expect(switchedTo(switches)).toEqual([true, false]);
	});

	it("stays on when saving finds the block changed and the window stays open", () => {
		const { bar, switches } = recordedKeyboardBar();
		const modal = openedEditWindow(bar, () => false);

		press(modal, strings.save);

		expect(switchedTo(switches)).toEqual([true]);
		expect(modal.modalEl.isConnected).toBe(true);
	});

	it("is turned off by cancelling", () => {
		const { bar, switches } = recordedKeyboardBar();
		const modal = openedEditWindow(bar);

		press(modal, strings.cancel);

		expect(switchedTo(switches)).toEqual([true, false]);
	});

	it("is turned off by closing the window otherwise, as Escape or the close button do", () => {
		const { bar, switches } = recordedKeyboardBar();
		const modal = openedEditWindow(bar);

		modal.close();

		expect(switchedTo(switches)).toEqual([true, false]);
	});

	it("stays on when the Edit… window closes over another place that holds it", () => {
		const { bar, switches } = recordedKeyboardBar();
		const connectWindow = new ConnectModal(new FakeApp() as never, connectionServiceFor(), strings, "My vault", () => undefined, bar);
		connectWindow.open();
		const modal = openedEditWindow(bar);

		modal.close();
		expect(switchedTo(switches)).toEqual([true]);

		connectWindow.close();
		expect(switchedTo(switches)).toEqual([true, false]);
	});
});
