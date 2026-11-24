// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectModal } from "../../src/ui/connect-modal";
import { selectStrings } from "../../src/ui/i18n/strings";
import { createKeyboardBar, type KeyboardBarOwner } from "../../src/ui/keyboard-bar";
import { connectionServiceFor } from "../fakes/fake-connection-service";
import { FakeApp } from "../fakes/obsidian-app";
import { recordedKeyboardBar, switchedTo } from "../fakes/recorded-keyboard-bar";

const strings = selectStrings("en");

/** A connect window over `bar`, just opened. */
function openedConnectWindow(bar: KeyboardBarOwner): ConnectModal {
	const modal = new ConnectModal(new FakeApp() as never, connectionServiceFor(), strings, "My vault", () => undefined, bar);
	modal.open();
	return modal;
}

/** The Continue button of the login screen of `modal`, once it shows one. */
function continueButton(modal: ConnectModal): HTMLButtonElement | undefined {
	return [...modal.contentEl.querySelectorAll("button")].find((found) => found.textContent === strings.continue);
}

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

describe("the keyboard's bar", () => {
	it("is turned on by opening the connect window, before the login screen shows any field", () => {
		const { bar, switches } = recordedKeyboardBar();

		const modal = openedConnectWindow(bar);

		// The login screen's fields are drawn only after the authorization has started, which takes a turn of the event loop.
		expect(switchedTo(switches)).toEqual([true]);
		expect(modal.contentEl.querySelector("input")).toBeNull();
	});

	it("is turned off by closing the connect window", () => {
		const { bar, switches } = recordedKeyboardBar();
		const modal = openedConnectWindow(bar);

		modal.close();

		expect(switchedTo(switches)).toEqual([true, false]);
	});

	it("stays on while another connect window is open, and is turned off by closing the last", () => {
		const { bar, switches } = recordedKeyboardBar();
		const first = openedConnectWindow(bar);
		const second = openedConnectWindow(bar);

		first.close();
		expect(switchedTo(switches)).toEqual([true]);

		second.close();
		expect(switchedTo(switches)).toEqual([true, false]);
	});

	it("lets the connect window show its login screen when the native bar cannot be switched, and logs it", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const failure = new Error("no Capacitor");
		const bar = createKeyboardBar({ setVisible: () => Promise.reject(failure) });

		const modal = openedConnectWindow(bar);

		await vi.waitFor(() => expect(continueButton(modal)).toBeDefined());
		await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith(expect.stringMatching(/^seamsync:/), failure));
	});

	it("lets the connect window show its login screen when switching the native bar throws at once, and logs it", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const failure = new Error("thrown before any promise");
		const bar = createKeyboardBar({
			setVisible: () => {
				throw failure;
			},
		});

		const modal = openedConnectWindow(bar);

		await vi.waitFor(() => expect(continueButton(modal)).toBeDefined());
		await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith(expect.stringMatching(/^seamsync:/), failure));
	});
});
