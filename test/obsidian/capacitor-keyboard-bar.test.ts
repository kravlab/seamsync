// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { capacitorAccessoryBarSetter } from "../../src/obsidian/capacitor-keyboard-bar";
import { installNativeKeyboard, removeCapacitor } from "../fakes/fake-capacitor";

afterEach(() => {
	removeCapacitor();
});

describe("capacitorAccessoryBarSetter", () => {
	it("asks the native Keyboard plugin to show the bar and resolves when it does", async () => {
		const setAccessoryBarVisible = vi.fn(() => Promise.resolve());
		installNativeKeyboard(setAccessoryBarVisible);

		await capacitorAccessoryBarSetter(window)(true);

		expect(setAccessoryBarVisible).toHaveBeenCalledWith({ isVisible: true });
	});

	it("asks the native Keyboard plugin to hide the bar and resolves when it does", async () => {
		const setAccessoryBarVisible = vi.fn(() => Promise.resolve());
		installNativeKeyboard(setAccessoryBarVisible);

		await capacitorAccessoryBarSetter(window)(false);

		expect(setAccessoryBarVisible).toHaveBeenCalledWith({ isVisible: false });
	});

	it("rejects with the error the native call rejected with", async () => {
		const failure = new Error("native failure");
		installNativeKeyboard(vi.fn(() => Promise.reject(failure)));

		await expect(capacitorAccessoryBarSetter(window)(true)).rejects.toBe(failure);
	});

	it("rejects saying there is no Capacitor global when the window has none", async () => {
		await expect(capacitorAccessoryBarSetter(window)(true)).rejects.toThrow(new Error("there is no Capacitor global on the window"));
	});

	it("rejects saying the Keyboard plugin is missing when Capacitor has none", async () => {
		Object.assign(window, { Capacitor: { Plugins: {} } });

		await expect(capacitorAccessoryBarSetter(window)(true)).rejects.toThrow(
			new Error("the Capacitor Keyboard plugin has no setAccessoryBarVisible method"),
		);
	});
});
