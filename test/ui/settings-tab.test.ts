// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionService } from "../../src/engine/connection";
import { DEFAULT_REMOTE_SETTINGS, type DeviceRecord, type RemoteSettings } from "../../src/engine/remote-metadata";
import { ObsidianConfigurationCategoriesStore } from "../../src/obsidian/configuration-categories-store";
import { ObsidianDeletionGuardStore } from "../../src/obsidian/deletion-guard-store";
import { ObsidianRequestLimitStore } from "../../src/obsidian/request-limit-store";
import { ObsidianScheduleStore } from "../../src/obsidian/schedule-store";
import { fill } from "../../src/ui/i18n/fill";
import { selectStrings } from "../../src/ui/i18n/strings";
import { createKeyboardBar, type KeyboardBar } from "../../src/ui/keyboard-bar";
import { SeamsyncSettingTab } from "../../src/ui/settings-tab";
import { Notice, Plugin, openSettingTab, playApiVersion } from "../fakes/obsidian";
import { FakeApp } from "../fakes/obsidian-app";
import { recordedKeyboardBar, switchedTo, type RecordedSwitch } from "../fakes/recorded-keyboard-bar";

const strings = selectStrings("en");

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

/**
 * The settings tab of a connected device named "Laptop", that knows the
 * default shared settings, not yet drawn nor read; the connection service
 * answers as `overrides` say, Apply calls `changeSettings` and Help
 * `openHelp`, and the tab holds `keyboardBar`, by default one whose switch
 * does nothing.
 */
function builtTab(
	overrides: Partial<ConnectionService> = {},
	changeSettings: (base: RemoteSettings, wanted: RemoteSettings) => Promise<void> = () => Promise.resolve(),
	openHelp: () => void = () => undefined,
	keyboardBar: KeyboardBar = createKeyboardBar({ setVisible: () => Promise.resolve() }),
): SeamsyncSettingTab {
	const app = new FakeApp();
	const service: ConnectionService = {
		showStatus: () => Promise.resolve(),
		currentDevice: () => Promise.resolve({ id: "laptop-id", name: "Laptop" }),
		startAuthorization: () => Promise.reject(new Error("unused")),
		disconnect: () => Promise.resolve({ kind: "disconnected" }),
		renameDevice: () => Promise.resolve({ kind: "renamed" }),
		otherDevices: () => Promise.resolve([]),
		forgetDevice: () => Promise.resolve({ kind: "forgotten" }),
		sharedSettings: () => Promise.resolve(DEFAULT_REMOTE_SETTINGS),
		...overrides,
	};
	return new SeamsyncSettingTab(
		app as never,
		new Plugin(app, { id: "seamsync", version: "0.1.0" }) as never,
		service,
		strings,
		() => undefined,
		() => undefined,
		changeSettings,
		openHelp,
		new ObsidianRequestLimitStore(app as never),
		new ObsidianScheduleStore(app as never),
		new ObsidianDeletionGuardStore(app as never),
		new ObsidianConfigurationCategoriesStore(app as never),
		keyboardBar,
	);
}

/** The settings tab of `builtTab`, read and drawn into the document. */
async function connectedTab(
	overrides: Partial<ConnectionService> = {},
	changeSettings: (base: RemoteSettings, wanted: RemoteSettings) => Promise<void> = () => Promise.resolve(),
	openHelp: () => void = () => undefined,
	keyboardBar?: KeyboardBar,
): Promise<SeamsyncSettingTab> {
	const tab = builtTab(overrides, changeSettings, openHelp, keyboardBar);
	await tab.reload();
	document.body.appendChild(tab.containerEl);
	return tab;
}

/** Presses the button with the text `text`; fails when there is none. */
function press(text: string): void {
	const found = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent === text);
	if (found === undefined) throw new Error(`no button ${text}`);
	found.click();
}

describe("the settings tab's Disconnect", () => {
	it("tells the user it is disconnected", async () => {
		await connectedTab({ disconnect: () => Promise.resolve({ kind: "disconnected" }) });

		press(strings.disconnect);

		await vi.waitFor(() => expect(Notice.shown).toEqual([strings.noticeDisconnected]));
	});

	it("tells the user a Disconnect that failed unexpectedly, and logs it, instead of leaving it unhandled", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const bug = new TypeError("boom");
		await connectedTab({ disconnect: () => Promise.reject(bug) });

		press(strings.disconnect);

		await vi.waitFor(() => expect(Notice.shown).toEqual([strings.noticeDisconnectFailed]));
		expect(consoleError).toHaveBeenCalledWith("seamsync: disconnecting failed", bug);
	});
});

/** The settings row named `name`; fails when there is none. */
function row(name: string): HTMLElement {
	const found = [...document.querySelectorAll<HTMLElement>(".setting-item")].find(
		(candidate) => candidate.querySelector(".setting-item-name")?.textContent === name,
	);
	if (found === undefined) throw new Error(`no row ${name}`);
	return found;
}

/** Types `value` into the field of the row named `name`, as the user would. */
function type(name: string, value: string): void {
	const field = row(name).querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
	if (field === null) throw new Error(`no field in ${name}`);
	field.value = value;
	field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? "change" : "input"));
}

describe("the settings tab's shared settings", () => {
	it("applies the typed values to all devices", async () => {
		const changeSettings = vi.fn(() => Promise.resolve());
		await connectedTab({}, changeSettings);

		type(strings.settingsNamePolicy, "encodeReversibly");
		type(strings.settingsTextExtensions, "md, txt, org");
		type(strings.settingsIgnoreList, "Archive/\n*.tmp");
		type(strings.settingsSizeCeiling, "50");
		press(strings.settingsApplyShared);

		expect(changeSettings).toHaveBeenCalledWith(DEFAULT_REMOTE_SETTINGS, {
			namePolicy: "encodeReversibly",
			textExtensions: ["md", "txt", "org"],
			ignoreList: ["Archive/", "*.tmp"],
			sizeCeilingBytes: 50 * 1024 * 1024,
		});
	});

	it("makes a second change from the values applied first, before its sync is done", async () => {
		const changeSettings = vi.fn((_base: RemoteSettings, _wanted: RemoteSettings) => new Promise<void>(() => undefined));
		await connectedTab({}, changeSettings);
		type(strings.settingsSizeCeiling, "200");
		press(strings.settingsApplyShared);

		type(strings.settingsSizeCeiling, "100");
		press(strings.settingsApplyShared);

		const raised = { ...DEFAULT_REMOTE_SETTINGS, sizeCeilingBytes: 200 * 1024 * 1024 };
		expect(changeSettings).toHaveBeenLastCalledWith(raised, DEFAULT_REMOTE_SETTINGS);
	});

	it("keeps the size limit when the typed one is not a whole number, and says why", async () => {
		const changeSettings = vi.fn(() => Promise.resolve());
		await connectedTab({}, changeSettings);

		type(strings.settingsSizeCeiling, "1.5");
		press(strings.settingsApplyShared);

		expect(row(strings.settingsSizeCeiling).textContent).toContain(strings.settingsSizeCeilingInvalid);
		expect(changeSettings).toHaveBeenCalledWith(DEFAULT_REMOTE_SETTINGS, DEFAULT_REMOTE_SETTINGS);
	});

	it("shows the settings a sync brought, when the user is not editing them", async () => {
		const brought = { ...DEFAULT_REMOTE_SETTINGS, ignoreList: ["Archive/"] };
		const sharedSettings = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(brought);
		const tab = await connectedTab({ sharedSettings });

		await tab.refreshShared();

		expect(row(strings.settingsIgnoreList).querySelector("textarea")?.value).toBe("Archive/");
	});

	it("keeps the user's edits not applied yet when a sync brings settings", async () => {
		const brought = { ...DEFAULT_REMOTE_SETTINGS, ignoreList: ["Archive/"] };
		const sharedSettings = vi.fn().mockResolvedValueOnce(DEFAULT_REMOTE_SETTINGS).mockResolvedValue(brought);
		const changeSettings = vi.fn(() => Promise.resolve());
		const tab = await connectedTab({ sharedSettings }, changeSettings);
		type(strings.settingsSizeCeiling, "50");

		await tab.refreshShared();
		press(strings.settingsApplyShared);

		expect(changeSettings).toHaveBeenCalledWith(DEFAULT_REMOTE_SETTINGS, {
			...DEFAULT_REMOTE_SETTINGS,
			sizeCeilingBytes: 50 * 1024 * 1024,
		});
	});

	it("asks for a sync first while no sync has read them", async () => {
		await connectedTab({ sharedSettings: () => Promise.resolve(null) });

		expect(document.body.textContent).toContain(strings.settingsSharedUnknown);
		expect(document.body.textContent).not.toContain(strings.settingsApplyShared);
	});
});

describe("the settings tab's device name", () => {
	it("renames this device", async () => {
		const renameDevice = vi.fn(() => Promise.resolve({ kind: "renamed" as const }));
		await connectedTab({ renameDevice });

		type(strings.deviceName, "Work laptop");
		press(strings.rename);

		expect(renameDevice).toHaveBeenCalledWith("Work laptop");
	});

	it("tells the user a blank name is not taken", async () => {
		await connectedTab({ renameDevice: () => Promise.resolve({ kind: "emptyName" }) });

		type(strings.deviceName, "  ");
		press(strings.rename);

		await vi.waitFor(() => expect(Notice.shown).toEqual([strings.deviceNameInvalid]));
	});
});

describe("the settings tab's other devices", () => {
	const phone: DeviceRecord = { device: { id: "phone-id", name: "Phone" }, revision: "r1" };

	it("are read only when asked for, then listed by name", async () => {
		const otherDevices = vi.fn(() => Promise.resolve([phone]));
		await connectedTab({ otherDevices });
		expect(otherDevices).not.toHaveBeenCalled();

		press(strings.showDevices);

		await vi.waitFor(() => expect(row("Phone").textContent).toContain(strings.settingsDeviceDescription));
	});

	it("tells the user when they could not be read", async () => {
		await connectedTab({ otherDevices: () => Promise.reject(new Error("offline")) });

		press(strings.showDevices);

		await vi.waitFor(() => expect(document.body.textContent).toContain(strings.settingsDevicesUnavailable));
	});

	it("forget one once the user confirms, and tell it", async () => {
		const forgetDevice = vi.fn(() => Promise.resolve({ kind: "forgotten" as const }));
		await connectedTab({ otherDevices: () => Promise.resolve([phone]), forgetDevice });
		press(strings.showDevices);
		await vi.waitFor(() => row("Phone"));

		press(strings.forgetDevice);
		expect(forgetDevice).not.toHaveBeenCalled();
		const confirm = [...document.querySelectorAll("button")].filter((button) => button.textContent === strings.forgetDevice).at(-1);
		confirm?.click();

		await vi.waitFor(() => expect(Notice.shown).toEqual([fill(strings.noticeDeviceForgotten, { device: "Phone" })]));
		expect(forgetDevice).toHaveBeenCalledWith(phone);
	});

	it("keep one the user did not confirm forgetting", async () => {
		const forgetDevice = vi.fn(() => Promise.resolve({ kind: "forgotten" as const }));
		await connectedTab({ otherDevices: () => Promise.resolve([phone]), forgetDevice });
		press(strings.showDevices);
		await vi.waitFor(() => row("Phone"));

		press(strings.forgetDevice);
		press(strings.cancel);

		await Promise.resolve();
		expect(forgetDevice).not.toHaveBeenCalled();
		expect(Notice.shown).toEqual([]);
		expect(row("Phone")).toBeDefined();
	});
});

describe("the settings tab's help", () => {
	it("opens the help", async () => {
		const openHelp = vi.fn();
		await connectedTab({}, undefined, openHelp);

		expect(row(strings.settingsHelp).textContent).toContain(strings.settingsHelpDescription);
		press(strings.openHelp);

		expect(openHelp).toHaveBeenCalledOnce();
	});
});

/**
 * A settings tab holding a recording keyboard bar, and the switches that
 * reach its native bar, in order, each with how many text fields the tab had
 * drawn when it was asked. The tab does not exist yet when the bar is made,
 * so the switches count its fields through `built`, set once it is.
 */
function tabWithRecordingBar(overrides: Partial<ConnectionService> = {}): {
	readonly tab: SeamsyncSettingTab;
	readonly switches: RecordedSwitch<number>[];
} {
	let built: SeamsyncSettingTab | undefined;
	const { bar, switches } = recordedKeyboardBar(() => built?.containerEl.querySelectorAll("input, textarea").length ?? 0);
	const tab = builtTab(overrides, undefined, undefined, bar);
	built = tab;
	return { tab, switches };
}

/** Lets what a shown tab started asynchronously (the read `display` ends with) finish, so nothing leaks into the next test. */
function settle(): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, 0));
}

describe.each(["1.12.7", "1.13.0"])("the settings tab's keyboard bar on Obsidian %s", (version) => {
	beforeEach(() => playApiVersion(version));

	it("is switched on when the tab is shown, before any of its fields is drawn", async () => {
		const { tab, switches } = tabWithRecordingBar();

		openSettingTab(tab);
		await settle();

		expect(switches[0]).toEqual({ isVisible: true, observed: 0 });
	});

	it("is switched off when the tab is hidden", async () => {
		const { tab, switches } = tabWithRecordingBar();
		openSettingTab(tab);
		await settle();

		tab.hide();

		expect(switchedTo(switches)).toEqual([true, false]);
	});

	it("is not switched on again when the shown tab is drawn again", async () => {
		let reads = 0;
		const differentEachTime = (): Promise<RemoteSettings> =>
			Promise.resolve({ ...DEFAULT_REMOTE_SETTINGS, ignoreList: [String(reads++)] });
		const { tab, switches } = tabWithRecordingBar({ sharedSettings: differentEachTime });
		openSettingTab(tab);
		await settle();

		await tab.reload();
		await tab.refreshShared();
		tab.hide();

		expect(switchedTo(switches)).toEqual([true, false]);
	});

	it("is left alone when a tab that was never shown is hidden", () => {
		const { tab, switches } = tabWithRecordingBar();

		tab.hide();

		expect(switches).toEqual([]);
	});

	it("is left alone when the tab is drawn while it is not shown", async () => {
		const { tab, switches } = tabWithRecordingBar();

		await tab.reload();

		expect(switches).toEqual([]);
	});
});
