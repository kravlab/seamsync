// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectModal } from "../../src/ui/connect-modal";
import { selectStrings } from "../../src/ui/i18n/strings";
import { createKeyboardBar } from "../../src/ui/keyboard-bar";
import { connectionServiceFor } from "../fakes/fake-connection-service";

const strings = selectStrings("en");

/**
 * A keyboard bar whose native calls are recorded: `calls` lists, in order,
 * every `isVisible` it was asked to switch to. Tests assert on this list
 * alone, since it is all the user can ever observe of the bar.
 */
function recordedBar(): { bar: ReturnType<typeof createKeyboardBar>; calls: boolean[] } {
	const calls: boolean[] = [];
	const bar = createKeyboardBar({
		setVisible: (isVisible) => {
			calls.push(isVisible);
			return Promise.resolve();
		},
	});
	return { bar, calls };
}

/** A connect window over `bar`, just opened. */
function openedConnectWindow(bar: ReturnType<typeof createKeyboardBar>): ConnectModal {
	const modal = new ConnectModal({} as never, connectionServiceFor(), strings, "My vault", () => undefined, bar);
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
		const { bar, calls } = recordedBar();

		const modal = openedConnectWindow(bar);

		// The login screen's fields are drawn only after the authorization has started, which takes a turn of the event loop.
		expect(calls).toEqual([true]);
		expect(modal.contentEl.querySelector("input")).toBeNull();
	});

	it("is turned off by closing the connect window", () => {
		const { bar, calls } = recordedBar();
		const modal = openedConnectWindow(bar);

		modal.close();

		expect(calls).toEqual([true, false]);
	});

	it("stays on while another connect window is open, and is turned off by closing the last", () => {
		const { bar, calls } = recordedBar();
		const first = openedConnectWindow(bar);
		const second = openedConnectWindow(bar);

		first.close();
		expect(calls).toEqual([true]);

		second.close();
		expect(calls).toEqual([true, false]);
	});

	it("is turned off by one release of a place that held it twice", () => {
		const { bar, calls } = recordedBar();
		const place = {};

		bar.hold(place);
		bar.hold(place);
		bar.release(place);

		expect(calls).toEqual([true, false]);
	});

	it("is left alone by releasing a place that does not hold it", () => {
		const { bar, calls } = recordedBar();

		bar.release({});

		expect(calls).toEqual([]);
	});

	it("is turned off when the plugin unloads while the connect window is open, and stays untouched after", () => {
		const { bar, calls } = recordedBar();
		const modal = openedConnectWindow(bar);

		bar.dispose();
		expect(calls).toEqual([true, false]);

		modal.close();
		expect(calls).toEqual([true, false]);
	});

	it("is left alone when the plugin unloads with nothing holding it", () => {
		const { bar, calls } = recordedBar();

		bar.dispose();

		expect(calls).toEqual([]);
	});

	it("lets the connect window show its login screen when the native bar cannot be switched, and logs it", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const failure = new Error("no Capacitor");
		const bar = createKeyboardBar({ setVisible: () => Promise.reject(failure) });

		const modal = openedConnectWindow(bar);

		await vi.waitFor(() => expect(continueButton(modal)).toBeDefined());
		await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith(expect.stringMatching(/^seamsync:/), failure));
	});
});
