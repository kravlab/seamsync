// @vitest-environment jsdom
import { Modal } from "obsidian";
import { describe, expect, it } from "vitest";
import { fitForPhone, type PhoneFit } from "../../src/ui/phone-modal";
import { Platform } from "../fakes/obsidian";

/** A window that `fitForPhone` has fitted with `options`, on a phone or not. */
function fitted(phone: boolean, options?: PhoneFit): readonly string[] {
	Platform.isPhone = phone;
	const modal = new Modal({} as never);
	fitForPhone(modal, options);
	return [...modal.modalEl.classList].filter((name) => name.startsWith("seamsync-"));
}

describe("fitForPhone", () => {
	it("marks a window for a phone and, when it has text fields, for the keyboard", () => {
		expect(fitted(true, { textFields: true })).toEqual(["seamsync-phone", "seamsync-phone-fields"]);
	});

	it("marks a window without text fields for a phone only", () => {
		expect(fitted(true)).toEqual(["seamsync-phone"]);
	});

	it("marks nothing off a phone, whatever the window has", () => {
		expect(fitted(false, { textFields: true })).toEqual([]);
	});
});
