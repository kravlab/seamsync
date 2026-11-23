// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { capacitorAccessoryBarSetter } from "../../src/obsidian/capacitor-keyboard-bar";

/** Installs a fake Capacitor global whose Keyboard plugin has `setAccessoryBarVisible`. */
function installKeyboard(setAccessoryBarVisible: unknown): void {
	Object.assign(window, { Capacitor: { Plugins: { Keyboard: { setAccessoryBarVisible } } } });
}

afterEach(() => {
	Reflect.deleteProperty(window, "Capacitor");
});

describe("capacitorAccessoryBarSetter", () => {
	it("asks the native Keyboard plugin to show the bar and resolves when it does", async () => {
		const setAccessoryBarVisible = vi.fn(() => Promise.resolve());
		installKeyboard(setAccessoryBarVisible);

		await capacitorAccessoryBarSetter(window)(true);

		expect(setAccessoryBarVisible).toHaveBeenCalledWith({ isVisible: true });
	});

	it("asks the native Keyboard plugin to hide the bar and resolves when it does", async () => {
		const setAccessoryBarVisible = vi.fn(() => Promise.resolve());
		installKeyboard(setAccessoryBarVisible);

		await capacitorAccessoryBarSetter(window)(false);

		expect(setAccessoryBarVisible).toHaveBeenCalledWith({ isVisible: false });
	});

	it("rejects with the error the native call rejected with", async () => {
		const failure = new Error("native failure");
		installKeyboard(vi.fn(() => Promise.reject(failure)));

		await expect(capacitorAccessoryBarSetter(window)(true)).rejects.toBe(failure);
	});

	it("rejects saying there is no Capacitor global when the window has none", async () => {
		await expect(capacitorAccessoryBarSetter(window)(true)).rejects.toThrow(
			new Error("seamsync: there is no Capacitor global on the window"),
		);
	});

	it("rejects saying the Keyboard plugin is missing when Capacitor has none", async () => {
		Object.assign(window, { Capacitor: { Plugins: {} } });

		await expect(capacitorAccessoryBarSetter(window)(true)).rejects.toThrow(
			new Error("seamsync: the Capacitor Keyboard plugin has no setAccessoryBarVisible method"),
		);
	});
});
