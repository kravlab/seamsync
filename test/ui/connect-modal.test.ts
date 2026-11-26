// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	AuthorizationOutcome,
	ConnectionService,
	CreateRemoteOutcome,
	JoinOutcome,
	RemoteCandidate,
	RemoteChooser,
} from "../../src/engine/connection";
import { NoAppKeyError } from "../../src/engine/connect-step";
import { ProviderError } from "../../src/engine/provider";
import { ConnectModal } from "../../src/ui/connect-modal";
import { fill } from "../../src/ui/i18n/fill";
import { selectStrings } from "../../src/ui/i18n/strings";
import { createKeyboardBar } from "../../src/ui/keyboard-bar";
import { connectionServiceFor } from "../fakes/fake-connection-service";
import { Notice } from "../fakes/obsidian";

const strings = selectStrings("en");

/** What the fake connection service answers at each step; a function that throws plays a failure. */
interface Script {
	/** Starts a login; by default one whose code is answered as `submitCode` says. */
	startAuthorization?: ConnectionService["startAuthorization"];
	submitCode?: () => Promise<AuthorizationOutcome>;
	list?: () => Promise<readonly RemoteCandidate[]>;
	useFolder?: () => Promise<JoinOutcome>;
	createRemote?: () => Promise<CreateRemoteOutcome>;
}

/** A connection service that starts logins and answers the code as `script` says. */
function serviceFor(script: Pick<Script, "startAuthorization" | "submitCode">): ConnectionService {
	const { submitCode = () => Promise.reject(new Error("unused")) } = script;
	return connectionServiceFor({
		startAuthorization:
			script.startAuthorization ??
			(() => Promise.resolve({ authorizeUrl: "https://example.com/authorize", submitCode: () => submitCode() })),
	});
}

/** A Remote choice offering the folder "Notes", answering as `script` says. */
function remotesFor(script: Omit<Script, "submitCode">): RemoteChooser {
	return {
		list: script.list ?? (() => Promise.resolve([{ root: "/Notes", name: "Notes", isRemote: true }])),
		useFolder: script.useFolder ?? (() => Promise.resolve({ kind: "connected" })),
		createRemote: script.createRemote ?? (() => Promise.resolve({ kind: "connected" })),
	};
}

/** The connect window over `service`, in the language of `windowStrings`, just opened. */
function newWindow(
	service: ConnectionService,
	windowStrings = strings,
	onConnected: (kind: "connected" | "reconnected") => void = () => undefined,
): ConnectModal {
	const keyboardBar = createKeyboardBar({ setVisible: () => Promise.resolve() });
	const modal = new ConnectModal({} as never, service, windowStrings, "My vault", onConnected, keyboardBar);
	modal.open();
	return modal;
}

/** The open connect window, after it showed the login screen; it tells `onConnected` once connected. */
async function openWindow(
	script: Pick<Script, "submitCode">,
	onConnected: (kind: "connected" | "reconnected") => void = () => undefined,
): Promise<ConnectModal> {
	const modal = newWindow(serviceFor(script), strings, onConnected);
	await vi.waitFor(() => expect(button(modal, strings.continue)).toBeDefined());
	return modal;
}

/** The button of `modal` with the text `text`, if it shows one. */
function button(modal: ConnectModal, text: string): HTMLButtonElement | undefined {
	return [...modal.contentEl.querySelectorAll("button")].find((found) => found.textContent === text);
}

/** The Login code field of `modal`'s login screen. */
function codeField(modal: ConnectModal): HTMLInputElement {
	const input = modal.contentEl.querySelector("input");
	if (input === null) throw new Error("no code field");
	return input;
}

/** Types `code` into the login screen of `modal`, as the user would. */
function typeCode(modal: ConnectModal, code: string): void {
	const input = codeField(modal);
	input.value = code;
	input.dispatchEvent(new Event("input"));
}

/** Pastes a code into the login screen of `modal` and presses Continue. */
function submitCode(modal: ConnectModal): void {
	typeCode(modal, "code");
	button(modal, strings.continue)?.click();
}

/** The message, detail line and copy button `modal`, in the language of `windowStrings`, shows at the top. */
function shown(modal: ConnectModal, windowStrings = strings): { message: string; detail: string; copy: boolean } {
	return {
		message: modal.contentEl.querySelector(".seamsync-message")?.textContent ?? "",
		detail: modal.contentEl.querySelector(".seamsync-message-detail")?.textContent ?? "",
		copy: button(modal, windowStrings.copyError) !== undefined,
	};
}

/**
 * The connect window in `language`, on its login screen, with the login it
 * started and what the code is answered: `outcome`, a login to another
 * account by default, which stays on the screen.
 */
async function openLogin(language = "en", outcome: AuthorizationOutcome = { kind: "otherAccount" }) {
	const languageStrings = selectStrings(language);
	const submitted = vi.fn((_code: string) => Promise.resolve(outcome));
	const startAuthorization = vi.fn(() => Promise.resolve({ authorizeUrl: "https://example.com/authorize", submitCode: submitted }));
	const modal = newWindow(serviceFor({ startAuthorization }), languageStrings);
	await vi.waitFor(() => expect(button(modal, languageStrings.continue)).toBeDefined());
	return { modal, languageStrings, startAuthorization, submitted };
}

/**
 * Logs in, then presses `choice`: "Use" on the folder "Notes", or "Create"
 * for a new Remote. `useFolder`, when given, takes the place of the
 * script's, seeing the arguments it is called with.
 */
async function chooseFolder(
	script: Omit<Script, "submitCode">,
	choice = strings.useFolder,
	useFolder?: RemoteChooser["useFolder"],
): Promise<ConnectModal> {
	const remotes = { ...remotesFor(script), ...(useFolder === undefined ? {} : { useFolder }) };
	const modal = await openWindow({ submitCode: () => Promise.resolve({ kind: "authorized", remotes }) });
	submitCode(modal);
	await vi.waitFor(() => expect(button(modal, choice)).toBeDefined());
	button(modal, choice)?.click();
	return modal;
}

/** The clipboard the window writes to and reads from; jsdom has none of its own. */
let clipboard: {
	writeText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;
	readText: ReturnType<typeof vi.fn<() => Promise<string>>>;
};

beforeEach(() => {
	clipboard = {
		writeText: vi.fn<(text: string) => Promise<void>>(() => Promise.resolve()),
		readText: vi.fn<() => Promise<string>>(() => Promise.resolve("")),
	};
	Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
});

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

describe("the connect window's failures", () => {
	it.each([
		[
			"en",
			"This build of the plugin has no Dropbox app key, so it cannot connect to Dropbox. Install the official release, or build the plugin with SEAMSYNC_DROPBOX_APP_KEY set.",
		],
		[
			"ru",
			"В этой сборке плагина нет ключа приложения Dropbox, поэтому она не может подключиться к Dropbox. Установите официальный релиз или соберите плагин с заданной переменной SEAMSYNC_DROPBOX_APP_KEY.",
		],
	])("tells at once, in %s, that a build without an app key cannot connect, offering to copy it", async (language, message) => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const languageStrings = selectStrings(language);
		const keyless = new NoAppKeyError("SEAMSYNC_DROPBOX_APP_KEY");
		const modal = newWindow(serviceFor({ startAuthorization: () => Promise.reject(keyless) }), languageStrings);

		await vi.waitFor(() => expect(modal.contentEl.querySelector(".seamsync-message")?.textContent).toBe(message));
		button(modal, languageStrings.copyError)?.click();

		expect(modal.contentEl.querySelector(".seamsync-message-detail")?.textContent).toBe("");
		expect(button(modal, languageStrings.openDropbox)).toBeUndefined();
		expect(clipboard.writeText).toHaveBeenCalledWith(message);
		expect(consoleError).not.toHaveBeenCalled();
	});

	it("names in that message the build setting the failure carries", async () => {
		const keyless = new NoAppKeyError("EXAMPLE_APP_KEY");
		const modal = newWindow(serviceFor({ startAuthorization: () => Promise.reject(keyless) }), strings);

		await vi.waitFor(() =>
			expect(modal.contentEl.querySelector(".seamsync-message")?.textContent).toBe(
				fill(strings.noAppKey, { variable: "EXAMPLE_APP_KEY" }),
			),
		);
	});

	it("shows a refused code with the service's answer and a button that copies both", async () => {
		const modal = await openWindow({ submitCode: () => Promise.resolve({ kind: "codeRejected", detail: "invalid_grant" }) });

		submitCode(modal);
		await vi.waitFor(() => expect(shown(modal).copy).toBe(true));
		button(modal, strings.copyError)?.click();

		expect(shown(modal)).toEqual({ message: strings.codeRejected, detail: "Details: invalid_grant", copy: true });
		expect(clipboard.writeText).toHaveBeenCalledWith(`${strings.codeRejected}\nDetails: invalid_grant`);
		await vi.waitFor(() => expect(Notice.shown).toEqual([strings.errorCopied]));
	});

	it("shows a login to another account with the copy button", async () => {
		const modal = await openWindow({ submitCode: () => Promise.resolve({ kind: "otherAccount" }) });

		submitCode(modal);

		await vi.waitFor(() => expect(shown(modal)).toEqual({ message: strings.otherAccount, detail: "", copy: true }));
	});

	it("shows a provider failure with its detail and the copy button", async () => {
		const modal = await openWindow({
			submitCode: () => Promise.reject(new ProviderError({ category: "permanent" }, "HTTP 400: bad client_id")),
		});

		submitCode(modal);

		await vi.waitFor(() =>
			expect(shown(modal)).toEqual({ message: strings.errorFailed, detail: "Details: HTTP 400: bad client_id", copy: true }),
		);
	});

	it("shows an unexpected failure with its name and message, instead of dropping it", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const unexpected = new TypeError("boom");
		const modal = await openWindow({ submitCode: () => Promise.reject(unexpected) });

		submitCode(modal);

		await vi.waitFor(() =>
			expect(shown(modal)).toEqual({ message: strings.connectUnexpected, detail: "Details: TypeError: boom", copy: true }),
		);
		expect(consoleError).toHaveBeenCalledWith("seamsync: connecting failed unexpectedly", unexpected);
	});

	it.each([
		["a taken name", { kind: "nameTaken" }, strings.folderTaken],
		["a name with a slash", { kind: "invalidName" }, strings.folderNameInvalid],
	] as const)("shows %s for a new Remote with the copy button", async (_, outcome, message) => {
		const modal = await chooseFolder({ createRemote: () => Promise.resolve(outcome) }, strings.create);

		await vi.waitFor(() => expect(shown(modal)).toEqual({ message, detail: "", copy: true }));
	});

	it("shows a folder the provider cannot sync with the copy button", async () => {
		const modal = await chooseFolder({ useFolder: () => Promise.resolve({ kind: "unsupportedProvider" }) });

		await vi.waitFor(() => expect(shown(modal)).toEqual({ message: strings.providerUnsupported, detail: "", copy: true }));
	});

	it("shows another device's First sync with the copy button", async () => {
		const modal = await chooseFolder({
			useFolder: () => Promise.resolve({ kind: "firstSyncInProgress", deviceName: "Tablet" }),
		});

		await vi.waitFor(() => expect(shown(modal).copy).toBe(true));
		expect(shown(modal).message).toBe(fill(strings.firstSyncInProgress, { device: "Tablet" }));
	});

	it("shows an unexpected failure while setting up a folder, with the copy button", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const modal = await chooseFolder({ useFolder: () => Promise.reject(new TypeError("boom")) });

		await vi.waitFor(() =>
			expect(shown(modal)).toEqual({ message: strings.connectUnexpected, detail: "Details: TypeError: boom", copy: true }),
		);
	});

	it("shows a provider failure while setting up a folder, with its detail and the copy button", async () => {
		const modal = await chooseFolder({
			useFolder: () => Promise.reject(new ProviderError({ category: "transient" }, "no response")),
		});

		await vi.waitFor(() =>
			expect(shown(modal)).toEqual({ message: strings.errorUnreachable, detail: "Details: no response", copy: true }),
		);
	});

	it("tells the user when the clipboard refuses the error", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		clipboard.writeText.mockImplementation(() => Promise.reject(new Error("denied")));
		const modal = await openWindow({ submitCode: () => Promise.resolve({ kind: "otherAccount" }) });

		submitCode(modal);
		await vi.waitFor(() => expect(shown(modal).copy).toBe(true));
		button(modal, strings.copyError)?.click();

		await vi.waitFor(() => expect(Notice.shown).toEqual([strings.errorNotCopied]));
		expect(consoleError).toHaveBeenCalled();
	});
});

describe("the connect window's Paste", () => {
	it.each([
		["en", "Paste"],
		["ru", "Вставить"],
	])("shows a Paste button, in %s, in the Login code row", async (language, label) => {
		const { modal, languageStrings } = await openLogin(language);

		const row = codeField(modal).closest(".setting-item");
		expect([...(row?.querySelectorAll("button") ?? [])].map((found) => found.textContent)).toEqual([label, languageStrings.continue]);
	});

	it("puts the clipboard's text into the code field, replacing what was typed, and submits nothing", async () => {
		clipboard.readText.mockResolvedValue("  ab12-cd34\n");
		const { modal, submitted } = await openLogin();
		typeCode(modal, "typed");

		button(modal, strings.paste)?.click();

		await vi.waitFor(() => expect(codeField(modal).value).toBe("  ab12-cd34"));
		expect(document.activeElement).not.toBe(codeField(modal));
		expect(submitted).not.toHaveBeenCalled();
	});

	it("submits the pasted code trimmed on Continue, as a typed one", async () => {
		clipboard.readText.mockResolvedValue("  ab12-cd34\n");
		const { modal, submitted } = await openLogin();

		button(modal, strings.paste)?.click();
		await vi.waitFor(() => expect(codeField(modal).value).toBe("  ab12-cd34"));
		button(modal, strings.continue)?.click();

		await vi.waitFor(() => expect(submitted).toHaveBeenCalledWith("ab12-cd34"));
	});

	it.each([
		["en", "Could not read the clipboard. Paste the code into the field."],
		["ru", "Не удалось прочитать буфер обмена. Вставьте код в поле."],
	])("tells, in %s, that the clipboard refused, without Copy error, keeping the login", async (language, message) => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const refusal = new DOMException("denied", "NotAllowedError");
		clipboard.readText.mockRejectedValue(refusal);
		const { modal, languageStrings, startAuthorization, submitted } = await openLogin(language);

		button(modal, languageStrings.paste)?.click();
		await vi.waitFor(() => expect(shown(modal, languageStrings)).toEqual({ message, detail: "", copy: false }));
		typeCode(modal, "ab12");
		button(modal, languageStrings.continue)?.click();

		await vi.waitFor(() => expect(submitted).toHaveBeenCalledWith("ab12"));
		expect(startAuthorization).toHaveBeenCalledTimes(1);
		expect(consoleError).toHaveBeenCalledWith("seamsync: reading the clipboard failed", refusal);
	});

	it("tells a platform without a clipboard to read as a refused read", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
		const { modal } = await openLogin();

		button(modal, strings.paste)?.click();

		await vi.waitFor(() => expect(shown(modal)).toEqual({ message: strings.clipboardRefused, detail: "", copy: false }));
	});

	it.each([
		["en", "The clipboard has no text. Copy the code that Dropbox shows first."],
		["ru", "В буфере обмена нет текста. Сначала скопируйте код, который показывает Dropbox."],
	])("tells, in %s, that the clipboard has no text, without Copy error, keeping the login", async (language, message) => {
		const { modal, languageStrings, startAuthorization, submitted } = await openLogin(language);

		button(modal, languageStrings.paste)?.click();
		await vi.waitFor(() => expect(shown(modal, languageStrings)).toEqual({ message, detail: "", copy: false }));
		typeCode(modal, "ab12");
		button(modal, languageStrings.continue)?.click();

		await vi.waitFor(() => expect(submitted).toHaveBeenCalledWith("ab12"));
		expect(startAuthorization).toHaveBeenCalledTimes(1);
	});

	it("takes a clipboard of only spaces and line breaks for one with no text, leaving the field as it was", async () => {
		clipboard.readText.mockResolvedValue(" \n\t");
		const { modal } = await openLogin();
		typeCode(modal, "typed");

		button(modal, strings.paste)?.click();

		await vi.waitFor(() => expect(shown(modal).message).toBe(strings.clipboardEmpty));
		expect(codeField(modal).value).toBe("typed");
	});

	it("takes the clipboard message away once a Paste succeeds", async () => {
		const { modal } = await openLogin();
		button(modal, strings.paste)?.click();
		await vi.waitFor(() => expect(shown(modal).message).toBe(strings.clipboardEmpty));
		clipboard.readText.mockResolvedValue("ab12");

		button(modal, strings.paste)?.click();

		await vi.waitFor(() => expect(codeField(modal).value).toBe("ab12"));
		expect(shown(modal)).toEqual({ message: "", detail: "", copy: false });
	});

	it("replaces the clipboard message with the answer to the code sent next", async () => {
		const { modal } = await openLogin();
		button(modal, strings.paste)?.click();
		await vi.waitFor(() => expect(shown(modal).message).toBe(strings.clipboardEmpty));

		submitCode(modal);

		await vi.waitFor(() => expect(shown(modal)).toEqual({ message: strings.otherAccount, detail: "", copy: true }));
	});

	it("keeps a refused code's message when a Paste succeeds after it", async () => {
		clipboard.readText.mockResolvedValue("ab12");
		const { modal } = await openLogin("en", { kind: "codeRejected", detail: "invalid_grant" });
		submitCode(modal);
		await vi.waitFor(() => expect(shown(modal).message).toBe(strings.codeRejected));

		button(modal, strings.paste)?.click();

		await vi.waitFor(() => expect(codeField(modal).value).toBe("ab12"));
		expect(shown(modal).message).toBe(strings.codeRejected);
	});

	it("drops a clipboard read that settles after the user went on to the next screen", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		let refuse: (reason: unknown) => void = () => undefined;
		clipboard.readText.mockReturnValue(
			new Promise<string>((_resolve, reject) => {
				refuse = reject;
			}),
		);
		const { modal } = await openLogin("en", { kind: "authorized", remotes: remotesFor({}) });
		button(modal, strings.paste)?.click();
		submitCode(modal);
		await vi.waitFor(() => expect(button(modal, strings.useFolder)).toBeDefined());

		refuse(new DOMException("denied", "NotAllowedError"));
		await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());

		expect(shown(modal).message).toBe("");
	});
});

describe("the connect window's Connect anyway", () => {
	/** How many "Connect anyway" buttons `modal` shows. */
	const connectAnywayButtons = (modal: ConnectModal): number =>
		[...modal.contentEl.querySelectorAll("button")].filter((found) => found.textContent === strings.connectAnyway).length;

	/** Presses the button of `modal` with the text `text`; fails when there is none. */
	const press = (modal: ConnectModal, text: string): void => {
		const found = button(modal, text);
		if (found === undefined) throw new Error(`no button ${text}`);
		found.click();
	};

	it("shows one button however often the folder is chosen again", async () => {
		const devices = ["Tablet", "Phone"];
		const modal = await chooseFolder({
			useFolder: () => Promise.resolve({ kind: "firstSyncInProgress", deviceName: devices.shift() ?? "none" }),
		});
		await vi.waitFor(() => expect(connectAnywayButtons(modal)).toBe(1));

		press(modal, strings.useFolder);
		await vi.waitFor(() => expect(shown(modal).message).toBe(fill(strings.firstSyncInProgress, { device: "Phone" })));

		expect(connectAnywayButtons(modal)).toBe(1);
	});

	it("goes away when another message replaces its own", async () => {
		const modal = await chooseFolder({
			useFolder: () => Promise.resolve({ kind: "firstSyncInProgress", deviceName: "Tablet" }),
			createRemote: () => Promise.resolve({ kind: "nameTaken" }),
		});
		await vi.waitFor(() => expect(connectAnywayButtons(modal)).toBe(1));

		press(modal, strings.create);

		await vi.waitFor(() => expect(shown(modal).message).toBe(strings.folderTaken));
		expect(connectAnywayButtons(modal)).toBe(0);
	});

	it("connects to the folder anyway when pressed", async () => {
		const useFolder = vi.fn((_root: string, _name: string, options?: { readonly evenDuringFirstSync?: boolean }) =>
			Promise.resolve<JoinOutcome>(
				options?.evenDuringFirstSync === true ? { kind: "connected" } : { kind: "firstSyncInProgress", deviceName: "Tablet" },
			),
		);
		const modal = await chooseFolder({}, strings.useFolder, useFolder);
		await vi.waitFor(() => expect(connectAnywayButtons(modal)).toBe(1));

		press(modal, strings.connectAnyway);

		await vi.waitFor(() => expect(Notice.shown).toEqual([strings.noticeConnected]));
		expect(useFolder).toHaveBeenLastCalledWith("/Notes", strings.deviceDesktop, { evenDuringFirstSync: true });
	});
});

describe("the connect window's end", () => {
	it("tells a new Connection as connected", async () => {
		const onConnected = vi.fn();
		const remotes = remotesFor({});
		const modal = await openWindow({ submitCode: () => Promise.resolve({ kind: "authorized", remotes }) }, onConnected);
		submitCode(modal);
		await vi.waitFor(() => expect(button(modal, strings.useFolder)).toBeDefined());

		button(modal, strings.useFolder)?.click();

		await vi.waitFor(() => expect(onConnected).toHaveBeenCalledWith("connected"));
	});

	it("tells a login again to the same account as reconnected", async () => {
		const onConnected = vi.fn();
		const modal = await openWindow({ submitCode: () => Promise.resolve({ kind: "reconnected" }) }, onConnected);

		submitCode(modal);

		await vi.waitFor(() => expect(onConnected).toHaveBeenCalledWith("reconnected"));
	});
});
