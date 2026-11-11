// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { expectAboveKeyboard, KEYBOARD_HELPERS, type KeyboardFound } from "./keyboard-page";
import { runInPage } from "./page-runner";

afterEach(() => {
	document.body.replaceChildren();
});

/** What `aboveKeyboard` finds on a phone whose 800 px high page has a 300 px keyboard: a window at the top below a 24 px status bar and above the keyboard, the field and the Cancel and Save buttons above the keyboard, the normal size back after closing. */
function foundAboveKeyboard(): KeyboardFound {
	return {
		safeTop: 24,
		windowTop: 24,
		windowBottom: 480,
		keyboard: 300,
		visibleBottom: 500,
		stillOpen: true,
		elements: [
			{ name: "field", top: 100, bottom: 300 },
			{ name: "Cancel", top: 320, bottom: 364 },
			{ name: "Save", top: 320, bottom: 364 },
		],
		closed: { keyboard: 0, maxHeight: 776, normalMaxHeight: 776 },
	};
}

describe("expectAboveKeyboard()", () => {
	it("passes for a window at the top with every element above the keyboard and its normal size after closing", () => {
		expect(() => expectAboveKeyboard(foundAboveKeyboard())).not.toThrow();
	});

	it("fails when the window is centred instead of at the top", () => {
		expect(() => expectAboveKeyboard({ ...foundAboveKeyboard(), windowTop: 180 })).toThrow();
	});

	it("fails when the window reaches below the keyboard's top by more than 1 px, though every element is above it", () => {
		expect(() => expectAboveKeyboard({ ...foundAboveKeyboard(), windowBottom: 502 })).toThrow();
	});

	it("passes when the window ends within 1 px below the keyboard's top, for fractional layout pixels", () => {
		expect(() => expectAboveKeyboard({ ...foundAboveKeyboard(), windowBottom: 501 })).not.toThrow();
	});

	it("fails naming a button whose bottom is below the keyboard's top", () => {
		const found = foundAboveKeyboard();
		const hidden = { name: "Save", top: 480, bottom: 524 };
		expect(() => expectAboveKeyboard({ ...found, elements: [found.elements[0], found.elements[1], hidden] })).toThrow(/Save/);
	});

	it("passes when an element ends 1 px below the keyboard's top, for fractional layout pixels, and fails 2 px below", () => {
		const found = foundAboveKeyboard();
		const ends = (bottom: number) => ({ ...found, elements: [...found.elements, { name: "Save", top: 480, bottom }] });
		expect(() => expectAboveKeyboard(ends(501))).not.toThrow();
		expect(() => expectAboveKeyboard(ends(502))).toThrow(/Save/);
	});

	it("fails naming an element above the top of the screen", () => {
		const found = foundAboveKeyboard();
		expect(() => expectAboveKeyboard({ ...found, elements: [{ name: "field", top: -10, bottom: 190 }, found.elements[1]] })).toThrow(
			/field/,
		);
	});

	it("fails when the keyboard did not open", () => {
		expect(() => expectAboveKeyboard({ ...foundAboveKeyboard(), keyboard: 0 })).toThrow();
	});

	it("fails when the keyboard closed during the scrolling", () => {
		expect(() => expectAboveKeyboard({ ...foundAboveKeyboard(), stillOpen: false })).toThrow();
	});

	it("fails when only the field was measured, with no button", () => {
		const found = foundAboveKeyboard();
		expect(() => expectAboveKeyboard({ ...found, elements: [found.elements[0]] })).toThrow();
	});

	it("passes with only the field measured when no buttons are expected", () => {
		const found = foundAboveKeyboard();
		expect(() => expectAboveKeyboard({ ...found, elements: [found.elements[0]] }, { buttons: "none" })).not.toThrow();
	});

	it("still fails a field below the keyboard when no buttons are expected", () => {
		const found = foundAboveKeyboard();
		expect(() => expectAboveKeyboard({ ...found, elements: [{ name: "field", top: 480, bottom: 524 }] }, { buttons: "none" })).toThrow(
			/field/,
		);
	});

	it("fails when no element was measured at all, even when no buttons are expected", () => {
		expect(() => expectAboveKeyboard({ ...foundAboveKeyboard(), elements: [] }, { buttons: "none" })).toThrow();
	});

	it("fails when the keyboard height is not back to 0 after closing", () => {
		const found = foundAboveKeyboard();
		expect(() => expectAboveKeyboard({ ...found, closed: { ...found.closed, keyboard: 12 } })).toThrow();
	});

	it("fails when after closing the window's max-height is still reduced", () => {
		const found = foundAboveKeyboard();
		expect(() => expectAboveKeyboard({ ...found, closed: { ...found.closed, maxHeight: 476 } })).toThrow();
	});

	it("passes when after closing the max-height is within 1 px of the normal one", () => {
		const found = foundAboveKeyboard();
		expect(() => expectAboveKeyboard({ ...found, closed: { ...found.closed, maxHeight: 775.5 } })).not.toThrow();
	});
});

/** Sets the custom properties on the page's root element, as Obsidian does for `--keyboard-height`, replacing the ones set before. */
function setRootProps(props: Record<string, string>): void {
	document.documentElement.setAttribute(
		"style",
		Object.entries(props)
			.map(([name, value]) => `${name}: ${value}`)
			.join("; "),
	);
}

describe("KEYBOARD_HELPERS", () => {
	/**
	 * The page's globals for the keyboard helpers: jsdom's style computation for
	 * the root element, where the custom properties are, for any other element a
	 * computed `max-height` of 776 px (jsdom has no layout to give one) and no
	 * `transform`, and a frame that comes at once.
	 */
	function keyboardPage(): Record<string, unknown> {
		return {
			getComputedStyle: (element: Element) =>
				element === document.documentElement ? window.getComputedStyle(element) : { maxHeight: "776px", transform: "none" },
			requestAnimationFrame: (run: () => void) => setTimeout(run, 0),
			innerHeight: 800,
		};
	}

	it("px reads a custom property of the root element as a number, and is 0 when it is not set", async () => {
		setRootProps({ "--keyboard-height": "295.2381px" });
		try {
			const read = await runInPage(`${KEYBOARD_HELPERS} return [px("--keyboard-height"), px("--not-set")];`, keyboardPage());
			expect(read).toEqual([295.2381, 0]);
		} finally {
			setRootProps({});
		}
	});

	/**
	 * A window of a field and a button whose layout is `windowRect` (the window's
	 * own) and `rects` (the field's and the button's, as `scrollIntoView` leaves
	 * them), with a keyboard that opens when the field is focused and closes when
	 * it is blurred, `scrolled` listing the calls to `scrollIntoView` in order.
	 */
	function windowWithField(windowRect: { top: number; bottom: number }, rects: { field: DOMRect; button: DOMRect }) {
		const modal = document.body.createDiv({ cls: "modal" });
		const field = modal.createEl("input");
		const button = modal.createEl("button", { text: "Save" });
		const scrolled: string[] = [];
		modal.getBoundingClientRect = () => ({ ...windowRect }) as DOMRect;
		for (const [name, element, rect] of [
			["field", field, rects.field],
			["Save", button, rects.button],
		] as const) {
			element.scrollIntoView = (options) => scrolled.push(`${name} ${JSON.stringify(options)}`);
			element.getBoundingClientRect = () => rect;
		}
		setRootProps({ "--safe-area-inset-top": "24px", "--keyboard-height": "0px" });
		field.focus = () => setRootProps({ "--safe-area-inset-top": "24px", "--keyboard-height": "300px" });
		field.blur = () => setRootProps({ "--safe-area-inset-top": "24px", "--keyboard-height": "0px" });
		return { modal, scrolled };
	}

	afterEach(() => {
		setRootProps({});
	});

	it("aboveKeyboard measures the window with the keyboard open, then each element after scrolling it into view, then the window with it closed", async () => {
		const { scrolled } = windowWithField(
			{ top: 24, bottom: 480 },
			{ field: { top: 100, bottom: 300 } as DOMRect, button: { top: 320, bottom: 364 } as DOMRect },
		);
		const found = (await runInPage(
			`${KEYBOARD_HELPERS} const modal = activeDocument.querySelector(".modal"); return await aboveKeyboard(modal, modal.querySelector("input"), [...modal.querySelectorAll("button")]);`,
			keyboardPage(),
		)) as KeyboardFound;
		expect(found).toEqual({
			safeTop: 24,
			windowTop: 24,
			windowBottom: 480,
			keyboard: 300,
			visibleBottom: 500,
			stillOpen: true,
			elements: [
				{ name: "field", top: 100, bottom: 300 },
				{ name: "Save", top: 320, bottom: 364 },
			],
			closed: { keyboard: 0, maxHeight: 776, normalMaxHeight: 776 },
		});
		expect(scrolled).toEqual(['field {"block":"nearest"}', 'Save {"block":"nearest"}']);
		expectAboveKeyboard(found);
	});

	it("aboveKeyboard waits for the window to finish sliding in before it focuses the field and measures", async () => {
		const { modal } = windowWithField(
			{ top: 24, bottom: 480 },
			{ field: { top: 100, bottom: 300 } as DOMRect, button: { top: 320, bottom: 364 } as DOMRect },
		);
		let transform = "translateY(889px)";
		modal.getBoundingClientRect = () => (transform === "none" ? { top: 24, bottom: 480 } : { top: 913, bottom: 1369 }) as DOMRect;
		const page = keyboardPage();
		const computed = page.getComputedStyle as (element: Element) => object;
		let looks = 0;
		// The window slides in from the bottom and is in place by the second time the page looks at its style.
		page.getComputedStyle = (element: Element) => {
			if (element !== modal) return computed(element);
			if (++looks === 2) transform = "none";
			return { ...computed(element), transform };
		};
		const found = (await runInPage(
			`${KEYBOARD_HELPERS} const modal = activeDocument.querySelector(".modal"); return await aboveKeyboard(modal, modal.querySelector("input"), [...modal.querySelectorAll("button")]);`,
			page,
		)) as KeyboardFound;
		expect([found.windowTop, found.windowBottom]).toEqual([24, 480]);
		expectAboveKeyboard(found);
	});

	it("aboveKeyboard fails naming the keyboard when it does not open", async () => {
		const { modal } = windowWithField({ top: 24, bottom: 480 }, { field: {} as DOMRect, button: {} as DOMRect });
		modal.querySelector("input")!.focus = () => undefined;
		await expect(
			runInPage(
				`${KEYBOARD_HELPERS} const modal = activeDocument.querySelector(".modal"); await aboveKeyboard(modal, modal.querySelector("input"), []);`,
				keyboardPage(),
			),
		).rejects.toThrow(/the keyboard/);
	});
});
