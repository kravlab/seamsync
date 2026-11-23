// @vitest-environment jsdom
import "fake-indexeddb/auto";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi, type MockInstance } from "vitest";
import SeamsyncPlugin from "../src/main";
import type { HttpRequest } from "../src/providers/dropbox/http";
import { selectStrings } from "../src/ui/i18n/strings";
import { FakeDropbox, json, type FakeDropboxAccount } from "./fakes/fake-dropbox";
import { Notice, Platform, answerRequestsWith, type Plugin as FakePlugin } from "./fakes/obsidian";
import { FakeApp } from "./fakes/obsidian-app";
import {
	PLUGIN_WAIT,
	RequestsUnderWay,
	buttonIn,
	connectThroughSettings,
	logIn as logInAs,
	openConnectWindow,
	pluginManifest,
	runCommand,
} from "./support/plugin-run";

const strings = selectStrings("en");

/** The app key the test build carries (test/vitest.config.mjs). */
const APP_KEY = "test-app-key";

/** The plugins started by a test, unloaded after it. */
const started: FakePlugin[] = [];

/** The requests to the fake service of the running test. */
let requests: RequestsUnderWay;

/** The browser the connect window opens pages in: it opens nothing, keeping the pages asked for. */
let opened: MockInstance<(url?: string | URL) => Window | null>;

beforeEach(() => {
	requests = new RequestsUnderWay();
	opened = vi.spyOn(window, "open").mockImplementation(() => null);
});

afterEach(async () => {
	for (const plugin of started.splice(0)) plugin.unload();
	// A sync under way when the plugin unloads finishes its requests; nothing of it may reach the next test.
	await requests.settle();
	document.body.replaceChildren();
	vi.restoreAllMocks();
	// The native bar belongs to the test that installed it.
	Reflect.deleteProperty(window, "Capacitor");
});

/** Makes `requestUrl` reach `dropbox`, which takes the plugin's requests as the Dropbox provider sends them. */
function answerWith(dropbox: FakeDropbox): void {
	answerRequestsWith(requests.counting((request) => dropbox.requestUrl(request as HttpRequest)));
}

/** Starts the plugin in `app` and makes the layout ready; returns it as the fake Plugin it runs on. */
async function startPlugin(app: FakeApp): Promise<FakePlugin> {
	const plugin = new SeamsyncPlugin(app as never, pluginManifest(app) as never);
	await plugin.onload();
	app.workspace.makeLayoutReady();
	const fake = plugin as unknown as FakePlugin;
	started.push(fake);
	return fake;
}

/** The button in the document with the text `text`; fails when there is none. */
function button(text: string): HTMLButtonElement {
	return buttonIn(document, text);
}

/** The authorize page the connect window opened last. */
function lastAuthorizeUrl(): string {
	const calls = opened.mock.calls;
	return String(calls[calls.length - 1]?.[0] ?? "");
}

/** Logs in on the open connect window as `account` approves it on `dropbox`'s page. */
async function logIn(dropbox: FakeDropbox, account: FakeDropboxAccount): Promise<void> {
	await logInAs({ root: document.body, dropbox, account, lastOpened: lastAuthorizeUrl });
}

/**
 * Connects through the settings tab and the connect window, as the user
 * does: Connect, Open Dropbox, the code `dropbox` shows `account`, then
 * a new Remote named after the vault.
 */
async function connect(plugin: FakePlugin, dropbox: FakeDropbox, account: FakeDropboxAccount): Promise<void> {
	await connectThroughSettings({
		root: document.body,
		dropbox,
		account,
		lastOpened: lastAuthorizeUrl,
		plugin,
		notices: () => Notice.shown,
	});
}

/** A plugin started on a vault holding one note, with a fake Dropbox account to connect to. */
async function startedWithNote() {
	const dropbox = new FakeDropbox(APP_KEY);
	const account = dropbox.addAccount("account-1");
	answerWith(dropbox);
	const app = new FakeApp("My vault");
	app.vault.seed("note.md", "hello");
	const plugin = await startPlugin(app);
	/** What the status bar item says now. */
	const status = (): string => plugin.statusBarItems[0]?.textContent ?? "";
	return { dropbox, account, plugin, status };
}

/** Makes the platform the one of Obsidian's iOS app. */
function onIos(): void {
	Object.assign(Platform, { isIosApp: true, isMobile: true, isPhone: true, isDesktop: false });
}

/** Makes the platform the one of Obsidian's Android app. */
function onAndroid(): void {
	Object.assign(Platform, { isAndroidApp: true, isMobile: true, isPhone: true, isDesktop: false });
}

/**
 * Installs a native Keyboard plugin on the window, as Obsidian mobile has
 * one, and returns what it was asked to do: the `isVisible` of each call
 * to `setAccessoryBarVisible`, in order.
 */
function installNativeKeyboard(): boolean[] {
	const calls: boolean[] = [];
	Object.assign(window, {
		Capacitor: {
			Plugins: {
				Keyboard: {
					setAccessoryBarVisible: ({ isVisible }: { isVisible: boolean }): Promise<void> => {
						calls.push(isVisible);
						return Promise.resolve();
					},
				},
			},
		},
	});
	return calls;
}

/**
 * Presses the Edit… button of the Conflict block in a note's editor, which
 * runs with the extensions `plugin` registered, so that the Edit… dialog
 * opens in the document; the editor is destroyed after the test. Needs the
 * platform set before `plugin` starts, since the plugin reads it then.
 */
function pressEditOfConflictBlock(plugin: FakePlugin): void {
	const text = "note\n<<<<<<< Phone\nmine\n=======\ntheirs\n>>>>>>> Remote\n";
	const view = new EditorView({ doc: text, extensions: plugin.editorExtensions as Extension[], parent: document.body });
	onTestFinished(() => view.destroy());
	buttonIn(view.dom, strings.conflictEdit).click();
}

describe("the plugin unloaded before Obsidian's layout is ready", () => {
	it("starts no engine and listens for nothing once the layout gets ready", async () => {
		const app = new FakeApp("My vault");
		const plugin = new SeamsyncPlugin(app as never, pluginManifest(app) as never);
		await plugin.onload();
		(plugin as unknown as FakePlugin).unload();
		const documentListeners = vi.spyOn(document, "addEventListener");
		const windowListeners = vi.spyOn(window, "addEventListener");
		const vaultListeners = vi.spyOn(app.vault, "on");
		const timers = vi.spyOn(window, "setTimeout");

		app.workspace.makeLayoutReady();
		// Anything started would have run by the next task.
		await new Promise((resolve) => window.setTimeout(resolve, 0));

		expect(documentListeners).not.toHaveBeenCalled();
		expect(windowListeners).not.toHaveBeenCalled();
		expect(vaultListeners).not.toHaveBeenCalled();
		expect(timers).toHaveBeenCalledTimes(1);
	});

	it("draws no settings tab once unloaded while onload was waiting", async () => {
		const app = new FakeApp("My vault");
		const plugin = new SeamsyncPlugin(app as never, pluginManifest(app) as never);

		const loading = plugin.onload();
		(plugin as unknown as FakePlugin).unload();
		await loading;

		expect((plugin as unknown as FakePlugin).settingTabs[0]?.containerEl.childElementCount).toBe(0);
	});
});

describe("the plugin after connecting", () => {
	it("syncs at once after a new Connection, so the First sync preview opens", async () => {
		const { dropbox, account, plugin } = await startedWithNote();

		await connect(plugin, dropbox, account);

		await vi.waitFor(() => button(strings.firstSyncStart), PLUGIN_WAIT);
	});

	it("syncs at once after a login again ends a pause for Reconnect needed", async () => {
		const { dropbox, account, plugin, status } = await startedWithNote();
		await connect(plugin, dropbox, account);
		await vi.waitFor(() => button(strings.firstSyncStart), PLUGIN_WAIT);
		button(strings.firstSyncStart).click();
		await vi.waitFor(() => expect(status()).toContain(strings.statusSynced), PLUGIN_WAIT);
		// Dropbox refuses the next request's login, as for a revoked app.
		dropbox.interceptions.push(json(401, { error_summary: "invalid_access_token/", error: { ".tag": "invalid_access_token" } }));
		runCommand(plugin, "sync-now");
		await vi.waitFor(() => expect(status()).toContain(strings.statusReconnectNeeded), PLUGIN_WAIT);

		runCommand(plugin, "reconnect");
		await logIn(dropbox, account);

		await vi.waitFor(() => expect(Notice.shown).toContain(strings.noticeReconnected), PLUGIN_WAIT);
		await vi.waitFor(() => expect(status()).toContain(strings.statusSynced), PLUGIN_WAIT);
		// The refused login is told in one notice only.
		// The vault was synced before, so logging in again opens no First sync preview.
		expect(Notice.shown.filter((message) => message === strings.noticeReconnectNeeded)).toHaveLength(1);
		expect(() => button(strings.firstSyncStart)).toThrow(/no button/);
	});
});

describe("the keyboard's bar", () => {
	it("is turned on, then off, on iOS when connecting closes the connect window", async () => {
		onIos();
		const bar = installNativeKeyboard();
		const { dropbox, account, plugin } = await startedWithNote();

		await connect(plugin, dropbox, account);

		expect(bar).toEqual([true, false]);
	});

	it("is turned on, then off, on iOS when the Edit… window of a Conflict block opens and is cancelled", async () => {
		onIos();
		const bar = installNativeKeyboard();
		const { plugin } = await startedWithNote();

		pressEditOfConflictBlock(plugin);
		button(strings.cancel).click();

		expect(bar).toEqual([true, false]);
	});

	it("is never touched on desktop when the Edit… window of a Conflict block opens and is cancelled", async () => {
		const bar = installNativeKeyboard();
		const { plugin } = await startedWithNote();

		pressEditOfConflictBlock(plugin);
		button(strings.cancel).click();

		expect(bar).toEqual([]);
	});

	it("is turned off on iOS when the plugin unloads while the connect window is open", async () => {
		onIos();
		const bar = installNativeKeyboard();
		const { plugin } = await startedWithNote();
		openConnectWindow(document.body, plugin);
		await vi.waitFor(() => button(strings.openDropbox), PLUGIN_WAIT);

		plugin.unload();

		expect(bar).toEqual([true, false]);
	});

	it("is never touched on desktop when the connect window opens", async () => {
		const bar = installNativeKeyboard();
		const { plugin } = await startedWithNote();

		openConnectWindow(document.body, plugin);
		await vi.waitFor(() => button(strings.openDropbox), PLUGIN_WAIT);

		expect(bar).toEqual([]);
	});

	it("is never touched on Android when the connect window opens", async () => {
		onAndroid();
		const bar = installNativeKeyboard();
		const { plugin } = await startedWithNote();

		openConnectWindow(document.body, plugin);
		await vi.waitFor(() => button(strings.openDropbox), PLUGIN_WAIT);

		expect(bar).toEqual([]);
	});

	it("is skipped on iOS without the native Keyboard plugin: the login screen still shows and the failure is logged", async () => {
		onIos();
		const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const { plugin } = await startedWithNote();

		openConnectWindow(document.body, plugin);

		await vi.waitFor(() => button(strings.continue), PLUGIN_WAIT);
		await vi.waitFor(() =>
			expect(logged).toHaveBeenCalledWith(
				"seamsync: switching the keyboard's bar failed",
				new Error("seamsync: there is no Capacitor global on the window"),
			),
		);
	});
});
