import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRepo, type TempRepo } from "./support";

vi.setConfig({ testTimeout: 30_000 });

const SCRIPT = "scripts/release-checks.sh";
const KEY = { SEAMSYNC_DROPBOX_APP_KEY: "dummy-app-key" };

describe("scripts/release-checks.sh", () => {
	let repo: TempRepo;

	/** Writes manifest.json and package.json with the given versions. */
	function writeVersions(manifest: string, pkg: string): void {
		repo.write("manifest.json", JSON.stringify({ id: "example", version: manifest }));
		repo.write("package.json", JSON.stringify({ name: "example", version: pkg }));
	}

	beforeEach(() => {
		repo = createRepo([SCRIPT]);
		writeVersions("1.2.3", "1.2.3");
	});

	afterEach(() => {
		repo.remove();
	});

	it("passes when the tag equals both versions and the key is set", () => {
		const result = repo.run(SCRIPT, ["1.2.3"], { env: KEY });

		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
	});

	it("fails when the tag differs from the manifest.json version", () => {
		writeVersions("1.2.4", "1.2.3");

		const result = repo.run(SCRIPT, ["1.2.3"], { env: KEY });

		expect(result.status).toBe(1);
		expect(result.stderr).toBe("error: tag 1.2.3 differs from manifest.json version 1.2.4\n");
	});

	it("fails when the tag differs from the package.json version", () => {
		writeVersions("1.2.3", "1.2.4");

		const result = repo.run(SCRIPT, ["1.2.3"], { env: KEY });

		expect(result.status).toBe(1);
		expect(result.stderr).toBe("error: tag 1.2.3 differs from package.json version 1.2.4\n");
	});

	it("fails when the key is unset", () => {
		const result = repo.run(SCRIPT, ["1.2.3"], { env: { SEAMSYNC_DROPBOX_APP_KEY: undefined } });

		expect(result.status).toBe(1);
		expect(result.stderr).toBe("error: SEAMSYNC_DROPBOX_APP_KEY is unset or empty\n");
	});

	it("fails when the key is empty", () => {
		const result = repo.run(SCRIPT, ["1.2.3"], { env: { SEAMSYNC_DROPBOX_APP_KEY: "" } });

		expect(result.status).toBe(1);
		expect(result.stderr).toBe("error: SEAMSYNC_DROPBOX_APP_KEY is unset or empty\n");
	});

	it("reports every failed check at once", () => {
		writeVersions("1.2.4", "1.2.5");

		const result = repo.run(SCRIPT, ["1.2.3"], { env: { SEAMSYNC_DROPBOX_APP_KEY: undefined } });

		expect(result.status).toBe(1);
		expect(result.stderr).toBe(
			"error: tag 1.2.3 differs from manifest.json version 1.2.4\n" +
				"error: tag 1.2.3 differs from package.json version 1.2.5\n" +
				"error: SEAMSYNC_DROPBOX_APP_KEY is unset or empty\n",
		);
	});

	it("prints the usage and exits 2 when called without a tag", () => {
		const result = repo.run(SCRIPT);

		expect(result.status).toBe(2);
		expect(result.stderr).toContain("usage:");
		expect(result.stderr).toContain("<tag>");
		expect(result.stdout).toBe("");
	});
});
