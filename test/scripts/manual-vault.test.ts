import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readlinkSync,
	readdirSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRepo, makeTempDir, type TempDir, type TempRepo } from "./support";

vi.setConfig({ testTimeout: 30_000 });

const SCRIPT = "scripts/manual-vault.sh";
const ID = "example";
/** The vaults' configuration folder; scripts/eslint.config.mjs turns off the rule against naming it for this file. */
const CONFIG_DIR = ".obsidian";

describe("scripts/manual-vault.sh", () => {
	let repo: TempRepo;
	let defaultVault: string;
	let temps: TempDir[];

	/** The plugin directory of a vault: the symlink the script creates. */
	function pluginLink(vault: string): string {
		return join(vault, CONFIG_DIR, "plugins", ID);
	}

	/** The file that lists the plugins a vault enables. */
	function pluginList(vault: string): string {
		return join(vault, CONFIG_DIR, "community-plugins.json");
	}

	/** A new empty directory outside the repository, removed after the test. */
	function tempDir(prefix: string): string {
		const temp = makeTempDir(prefix);
		temps.push(temp);
		return temp.dir;
	}

	/**
	 * Asserts that the vault's plugin link is relative and that its text,
	 * read from the physical plugin directory, names the repository's dist/.
	 * The link may dangle (dist/ missing) and dist/ may itself be a symlink.
	 */
	function expectLinkToDist(vault: string): void {
		const link = pluginLink(vault);
		const text = readlinkSync(link);
		expect(isAbsolute(text)).toBe(false);
		expect(resolve(realpathSync(dirname(link)), text)).toBe(join(repo.dir, "dist"));
	}

	beforeEach(() => {
		temps = [];
		repo = createRepo([SCRIPT]);
		repo.write("manifest.json", JSON.stringify({ id: ID }));
		repo.write("dist/manifest.json", JSON.stringify({ id: ID }));
		defaultVault = join(repo.dir, ".e2e", "manual-vault");
	});

	afterEach(() => {
		repo.remove();
		for (const temp of temps) temp.remove();
	});

	it("creates the default vault with a relative link to dist/, the plugin list and a welcome note", () => {
		const result = repo.run(SCRIPT);

		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.stdout).toBe(`${defaultVault}\n`);
		expectLinkToDist(defaultVault);
		expect(JSON.parse(readFileSync(pluginList(defaultVault), "utf8"))).toEqual([ID]);
		expect(readFileSync(join(defaultVault, "Welcome.md"), "utf8")).toContain("# Test vault");
	});

	it("links the default vault to dist/ with the text ../../../../dist", () => {
		repo.run(SCRIPT);

		expect(readlinkSync(pluginLink(defaultVault))).toBe("../../../../dist");
	});

	it("resolves a relative vault path against the current directory, not the toplevel", () => {
		repo.write("sub/.keep", "");
		const cwd = join(repo.dir, "sub");

		const result = repo.run(SCRIPT, ["my-vault"], { cwd });

		const vault = join(cwd, "my-vault");
		expect(result.status).toBe(0);
		expect(result.stdout).toBe(`${vault}\n`);
		expectLinkToDist(vault);
		expect(existsSync(join(repo.dir, "my-vault"))).toBe(false);
	});

	it("creates a vault at an absolute path that contains spaces", () => {
		const vault = join(tempDir("obsync-spaces-"), "my test vault");

		const result = repo.run(SCRIPT, [vault]);

		expect(result.status).toBe(0);
		expect(result.stdout).toBe(`${vault}\n`);
		expectLinkToDist(vault);
		expect(JSON.parse(readFileSync(pluginList(vault), "utf8"))).toEqual([ID]);
	});

	it("names the plugin folder after the manifest id, which may hold dots, dashes and underscores", () => {
		repo.write("manifest.json", JSON.stringify({ id: "my-plugin_1.0" }));

		const result = repo.run(SCRIPT);

		expect(result.status).toBe(0);
		expect(readlinkSync(join(defaultVault, CONFIG_DIR, "plugins", "my-plugin_1.0"))).toBe("../../../../dist");
		expect(JSON.parse(readFileSync(pluginList(defaultVault), "utf8"))).toEqual(["my-plugin_1.0"]);
	});

	it("warns about a missing dist/manifest.json but still creates the vault", () => {
		rmSync(join(repo.dir, "dist", "manifest.json"));

		const result = repo.run(SCRIPT);

		expect(result.status).toBe(0);
		expect(result.stderr).toMatch(/^warning: /);
		expect(result.stderr).toContain("pnpm build");
		expect(result.stderr).toContain("pnpm dev");
		expect(result.stdout).toBe(`${defaultVault}\n`);
		expectLinkToDist(defaultVault);
	});

	it("creates the vault with a dangling link and a warning when dist/ is missing", () => {
		rmSync(join(repo.dir, "dist"), { recursive: true });

		const result = repo.run(SCRIPT);

		expect(result.status).toBe(0);
		expect(result.stderr).toMatch(/^warning: /);
		expect(result.stdout).toBe(`${defaultVault}\n`);
		expectLinkToDist(defaultVault);
		expect(existsSync(pluginLink(defaultVault))).toBe(false);
	});

	it("keeps the correct link and warns when run again after dist/ was removed", () => {
		repo.run(SCRIPT);
		rmSync(join(repo.dir, "dist"), { recursive: true });

		const result = repo.run(SCRIPT);

		expect(result.status).toBe(0);
		expect(result.stderr).toMatch(/^warning: /);
		expect(result.stdout).toBe(`${defaultVault}\n`);
		expectLinkToDist(defaultVault);
	});

	it("keeps the notes and an edited plugin list when run again on an existing vault", () => {
		repo.run(SCRIPT);
		writeFileSync(join(defaultVault, "Note.md"), "my note");
		writeFileSync(pluginList(defaultVault), '["example","other"]');
		writeFileSync(join(defaultVault, "Welcome.md"), "edited welcome");

		const result = repo.run(SCRIPT);

		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.stdout).toBe(`${defaultVault}\n`);
		expectLinkToDist(defaultVault);
		expect(readFileSync(join(defaultVault, "Note.md"), "utf8")).toBe("my note");
		expect(readFileSync(pluginList(defaultVault), "utf8")).toBe('["example","other"]');
		expect(readFileSync(join(defaultVault, "Welcome.md"), "utf8")).toBe("edited welcome");
	});

	it("adds the link, the plugin list and the welcome note to an existing vault that has none of them", () => {
		mkdirSync(join(defaultVault, CONFIG_DIR), { recursive: true });
		writeFileSync(join(defaultVault, "Note.md"), "my note");

		const result = repo.run(SCRIPT);

		expect(result.status).toBe(0);
		expectLinkToDist(defaultVault);
		expect(JSON.parse(readFileSync(pluginList(defaultVault), "utf8"))).toEqual([ID]);
		expect(readFileSync(join(defaultVault, "Welcome.md"), "utf8")).toContain("# Test vault");
		expect(readFileSync(join(defaultVault, "Note.md"), "utf8")).toBe("my note");
	});

	it("links to a symlinked dist/ itself, not to what it points to", () => {
		const target = tempDir("obsync-dist-target-");
		rmSync(join(repo.dir, "dist"), { recursive: true });
		symlinkSync(target, join(repo.dir, "dist"));

		const result = repo.run(SCRIPT);

		expect(result.status).toBe(0);
		expect(readlinkSync(pluginLink(defaultVault))).toBe("../../../../dist");
	});

	it("fails and changes nothing when the plugin path is a real directory", () => {
		const dir = pluginLink(defaultVault);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "main.js"), "foreign");

		const result = repo.run(SCRIPT);

		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/^error: /);
		expect(lstatSync(dir).isDirectory()).toBe(true);
		expect(readFileSync(join(dir, "main.js"), "utf8")).toBe("foreign");
		expect(existsSync(pluginList(defaultVault))).toBe(false);
		expect(existsSync(join(defaultVault, "Welcome.md"))).toBe(false);
	});

	it("fails and changes nothing when the plugin path is a symlink pointing elsewhere", () => {
		const elsewhere = tempDir("obsync-elsewhere-");
		const link = pluginLink(defaultVault);
		mkdirSync(dirname(link), { recursive: true });
		symlinkSync(elsewhere, link);

		const result = repo.run(SCRIPT);

		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/^error: /);
		expect(readlinkSync(link)).toBe(elsewhere);
		expect(existsSync(pluginList(defaultVault))).toBe(false);
		expect(existsSync(join(defaultVault, "Welcome.md"))).toBe(false);
	});

	it("recreates the vault with --force", () => {
		repo.run(SCRIPT);
		writeFileSync(join(defaultVault, "Note.md"), "my note");
		writeFileSync(pluginList(defaultVault), "[]");

		const result = repo.run(SCRIPT, ["--force"]);

		expect(result.status).toBe(0);
		expect(result.stdout).toBe(`${defaultVault}\n`);
		expect(existsSync(join(defaultVault, "Note.md"))).toBe(false);
		expectLinkToDist(defaultVault);
		expect(JSON.parse(readFileSync(pluginList(defaultVault), "utf8"))).toEqual([ID]);
		expect(readFileSync(join(defaultVault, "Welcome.md"), "utf8")).toContain("# Test vault");
	});

	it("announces on stderr which vault --force removes", () => {
		repo.run(SCRIPT);

		const result = repo.run(SCRIPT, ["--force"]);

		expect(result.stderr).toBe(`removing ${defaultVault}\n`);
	});

	it("recreates the vault at an explicit path with --force", () => {
		const vault = join(tempDir("obsync-explicit-"), "vault");
		repo.run(SCRIPT, [vault]);
		writeFileSync(join(vault, "Note.md"), "my note");

		const result = repo.run(SCRIPT, ["--force", vault]);

		expect(result.status).toBe(0);
		expect(result.stdout).toBe(`${vault}\n`);
		expect(existsSync(join(vault, "Note.md"))).toBe(false);
		expectLinkToDist(vault);
	});

	it("recreates the vault with --force even when the plugin link points elsewhere", () => {
		const link = pluginLink(defaultVault);
		mkdirSync(dirname(link), { recursive: true });
		symlinkSync(tempDir("obsync-elsewhere-"), link);

		const result = repo.run(SCRIPT, ["--force"]);

		expect(result.status).toBe(0);
		expectLinkToDist(defaultVault);
	});

	it("creates a missing vault with --force without announcing a removal", () => {
		const result = repo.run(SCRIPT, ["--force"]);

		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.stdout).toBe(`${defaultVault}\n`);
		expectLinkToDist(defaultVault);
		expect(JSON.parse(readFileSync(pluginList(defaultVault), "utf8"))).toEqual([ID]);
	});

	it("refuses --force on a directory that is not a vault and leaves it untouched", () => {
		mkdirSync(defaultVault, { recursive: true });
		writeFileSync(join(defaultVault, "precious.txt"), "keep me");

		const result = repo.run(SCRIPT, ["--force"]);

		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/^error: /);
		expect(readFileSync(join(defaultVault, "precious.txt"), "utf8")).toBe("keep me");
		expect(existsSync(join(defaultVault, CONFIG_DIR))).toBe(false);
	});

	it("refuses --force on the repository itself even when it holds a vault folder, and deletes nothing", () => {
		mkdirSync(join(repo.dir, CONFIG_DIR));
		repo.write("precious.txt", "keep me");

		const result = repo.run(SCRIPT, ["--force", repo.dir]);

		expect(result.status).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe(`error: ${repo.dir} is the repository or contains it\n`);
		expect(existsSync(join(repo.dir, ".git"))).toBe(true);
		expect(readFileSync(join(repo.dir, "precious.txt"), "utf8")).toBe("keep me");
		expect(existsSync(join(repo.dir, SCRIPT))).toBe(true);
		expect(existsSync(join(repo.dir, CONFIG_DIR))).toBe(true);
	});

	it("refuses --force on a directory that contains the repository, and deletes nothing", () => {
		const parent = dirname(repo.dir);

		const result = repo.run(SCRIPT, ["--force", parent]);

		expect(result.status).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe(`error: ${parent} is the repository or contains it\n`);
		expect(existsSync(join(repo.dir, ".git"))).toBe(true);
		expect(existsSync(join(repo.dir, "manifest.json"))).toBe(true);
	});

	it("refuses --force on a symlink to the repository", () => {
		const link = join(tempDir("obsync-repo-link-"), "link");
		symlinkSync(repo.dir, link);

		const result = repo.run(SCRIPT, ["--force", link]);

		expect(result.status).toBe(1);
		expect(result.stderr).toBe(`error: ${link} is the repository or contains it\n`);
		expect(existsSync(join(repo.dir, ".git"))).toBe(true);
	});

	it("fails and creates nothing when manifest.json holds no valid id", () => {
		for (const manifest of [
			"{}",
			'{"id":""}',
			'{"id":5}',
			'{"id":"."}',
			'{"id":".."}',
			'{"id":"../x"}',
			'{"id":"a/b"}',
			'{"id":"a b"}',
		]) {
			repo.write("manifest.json", manifest);

			const result = repo.run(SCRIPT);

			expect(result.status, manifest).toBe(1);
			expect(result.stdout, manifest).toBe("");
			expect(result.stderr, manifest).toBe("error: manifest.json has no valid id\n");
			expect(existsSync(join(repo.dir, ".e2e")), manifest).toBe(false);
		}
	});

	it("takes the arguments after -- as a vault path even when it starts with a dash", () => {
		const vault = join(repo.dir, "-v");

		const result = repo.run(SCRIPT, ["--", "-v"]);

		expect(result.status).toBe(0);
		expect(result.stdout).toBe(`${vault}\n`);
		expectLinkToDist(vault);
		expect(existsSync(defaultVault)).toBe(false);
	});

	it("does not treat a vault named --force after -- as the --force option", () => {
		const vault = join(repo.dir, "--force");
		repo.run(SCRIPT, ["--", "--force"]);
		writeFileSync(join(vault, "Note.md"), "my note");

		const result = repo.run(SCRIPT, ["--", "--force"]);

		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.stdout).toBe(`${vault}\n`);
		expect(readFileSync(join(vault, "Note.md"), "utf8")).toBe("my note");
		expect(existsSync(defaultVault)).toBe(false);
	});

	it("refuses a non-empty directory that is not a vault without --force and leaves it untouched", () => {
		mkdirSync(defaultVault, { recursive: true });
		writeFileSync(join(defaultVault, "precious.txt"), "keep me");

		const result = repo.run(SCRIPT);

		expect(result.status).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe(`error: ${defaultVault} is not empty and is not a vault (no ${CONFIG_DIR}/)\n`);
		expect(readdirSync(defaultVault)).toEqual(["precious.txt"]);
	});

	it("turns an existing empty directory into a vault", () => {
		mkdirSync(defaultVault, { recursive: true });

		const result = repo.run(SCRIPT);

		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
		expectLinkToDist(defaultVault);
		expect(JSON.parse(readFileSync(pluginList(defaultVault), "utf8"))).toEqual([ID]);
	});

	it.each([[[]], [["--force"]]])(
		"refuses a vault path that is a regular file (options %j) and leaves the file untouched",
		(options) => {
			repo.write("some-file", "keep me");
			const vault = join(repo.dir, "some-file");

			const result = repo.run(SCRIPT, [...options, vault]);

			expect(result.status).toBe(1);
			expect(result.stdout).toBe("");
			expect(result.stderr).toBe(`error: ${vault} exists and is not a directory\n`);
			expect(lstatSync(vault).isFile()).toBe(true);
			expect(readFileSync(vault, "utf8")).toBe("keep me");
			expect(existsSync(join(repo.dir, ".e2e"))).toBe(false);
		},
	);

	it("links to the repository's dist/ when the toplevel is reached through a symlink", () => {
		const linkDir = join(tempDir("obsync-toplevel-link-"), "repo-link");
		symlinkSync(repo.dir, linkDir);

		const result = repo.run(SCRIPT, [], { cwd: linkDir });

		expect(result.status).toBe(0);
		expect(result.stdout).toBe(`${defaultVault}\n`);
		expectLinkToDist(defaultVault);
	});

	it("links to the repository's dist/ when the vault path goes through a symlink", () => {
		const linkDir = join(tempDir("obsync-vault-link-"), "repo-link");
		symlinkSync(repo.dir, linkDir);
		const vault = join(linkDir, "nested", "vault");
		mkdirSync(join(repo.dir, "nested"));

		const result = repo.run(SCRIPT, [vault]);

		expect(result.status).toBe(0);
		expect(result.stdout).toBe(`${vault}\n`);
		expectLinkToDist(vault);
	});

	it("links to the repository's dist/ when .e2e is itself a symlink to another directory", () => {
		const other = tempDir("obsync-e2e-target-");
		symlinkSync(other, join(repo.dir, ".e2e"));

		const result = repo.run(SCRIPT);

		expect(result.status).toBe(0);
		expect(result.stdout).toBe(`${defaultVault}\n`);
		expect(existsSync(join(other, "manual-vault"))).toBe(true);
		expectLinkToDist(defaultVault);
	});

	it("prints the usage and exits 2 on an unknown option", () => {
		const result = repo.run(SCRIPT, ["--bogus"]);

		expect(result.status).toBe(2);
		expect(result.stderr).toMatch(/^usage: /);
		expect(result.stdout).toBe("");
		expect(existsSync(join(repo.dir, ".e2e"))).toBe(false);
	});

	it("prints the usage and exits 2 on more than one vault path", () => {
		const result = repo.run(SCRIPT, ["one", "two"]);

		expect(result.status).toBe(2);
		expect(result.stderr).toMatch(/^usage: /);
		expect(result.stdout).toBe("");
		expect(existsSync(join(repo.dir, "one"))).toBe(false);
		expect(existsSync(join(repo.dir, "two"))).toBe(false);
		expect(existsSync(join(repo.dir, ".e2e"))).toBe(false);
	});
});
