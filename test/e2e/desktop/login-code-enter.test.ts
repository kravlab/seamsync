// On a phone, Enter in the connect window's Login code field hides the
// keyboard, as it does in the plugin's other text fields. Obsidian's mobile
// emulation stands in for the phone: Obsidian blurs a field on Enter only
// where it has no physical keyboard, and the emulation has none. Obsidian
// runs with no network (as every desktop scenario that needs no login does),
// so the window is reached without a login and nothing reaches Dropbox.
import { describe, expect, it } from "vitest";
import { useDesktopObsidian } from "../support/desktop-obsidian";
import { PAGE_HELPERS } from "../support/page";

const obsidian = useDesktopObsidian("login-code-enter", { phone: true });

describe("the connect window on a phone", () => {
	it("hides the keyboard when Enter is pressed in the Login code field", async () => {
		const strings = await obsidian().strings();
		const stillFocused = await obsidian().eval(`
			${PAGE_HELPERS}
			try {
				const sync = await openSyncWindow();
				(await button(${JSON.stringify(strings.connect)}, sync)).click();
				const input = await until(() => activeDocument.querySelector(".modal input[type=text]"), 10000, "the code field");
				input.focus();
				input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
				return activeDocument.activeElement === input;
			} finally {
				await closeModals();
			}`);
		expect(stillFocused).toBe(false);
	});
});
