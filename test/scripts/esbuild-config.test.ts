import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTempDir, type RunResult, type TempDir } from "./support";

vi.setConfig({ testTimeout: 30_000 });

// The production build runs in a throwaway copy of what it reads, so a
// developer's own .env stays out of it; node_modules is linked, not copied.
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const SOURCES = ["scripts/esbuild.config.mjs", "manifest.json", "tsconfig.json", "src"];
// An invented app key, never a real one.
const KEY = "dummy-app-key";

/** Runs the production build in `dir`, in this process's environment without an app key, plus `env`. */
function build(dir: string, env: Record<string, string> = {}): RunResult {
	const inherited = { ...process.env };
	delete inherited.SEAMSYNC_DROPBOX_APP_KEY;
	const result = spawnSync(process.execPath, ["scripts/esbuild.config.mjs", "production"], {
		cwd: dir,
		env: { ...inherited, ...env },
		encoding: "utf8",
	});
	if (result.error) throw result.error;
	return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** The bundle a build in `dir` wrote. */
function bundle(dir: string): string {
	return readFileSync(join(dir, "dist/main.js"), "utf8");
}

describe("scripts/esbuild.config.mjs production", () => {
	let temp: TempDir;

	beforeEach(() => {
		temp = makeTempDir("obsync-build-");
		for (const path of SOURCES) cpSync(join(repoRoot, path), join(temp.dir, path), { recursive: true });
		symlinkSync(join(repoRoot, "node_modules"), join(temp.dir, "node_modules"));
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		temp.remove();
	});

	it("builds main.js with no app key in the environment and no .env, bundling none and warning", () => {
		// The test process has a key; the build is run without it.
		vi.stubEnv("SEAMSYNC_DROPBOX_APP_KEY", KEY);
		const result = build(temp.dir);

		expect(result.status, result.stderr).toBe(0);
		expect(existsSync(join(temp.dir, "dist/main.js"))).toBe(true);
		expect(bundle(temp.dir)).not.toContain(KEY);
		expect(result.stderr).toContain("SEAMSYNC_DROPBOX_APP_KEY is not set: this build cannot connect to Dropbox.");
	});

	it("bundles the app key from the environment, without the warning", () => {
		const result = build(temp.dir, { SEAMSYNC_DROPBOX_APP_KEY: KEY });

		expect(result.status).toBe(0);
		expect(result.stderr).not.toContain("SEAMSYNC_DROPBOX_APP_KEY is not set");
		expect(bundle(temp.dir)).toContain(KEY);
	});

	it("bundles the app key from .env", () => {
		writeFileSync(join(temp.dir, ".env"), `SEAMSYNC_DROPBOX_APP_KEY=${KEY}\n`);

		expect(build(temp.dir).status).toBe(0);
		expect(bundle(temp.dir)).toContain(KEY);
	});
});
