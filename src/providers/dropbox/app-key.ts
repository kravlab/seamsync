/** Replaced by the build with the key from the build environment (scripts/esbuild.config.mjs). */
declare const SEAMSYNC_DROPBOX_APP_KEY: string;

/**
 * The app key of the plugin's own Dropbox app (spec, "Dropbox provider";
 * ADR 0004). It is public by design: the login uses PKCE, so the app has
 * no client secret and the key is bundled in `main.js`. It is never written
 * in the repository: the build takes it from `SEAMSYNC_DROPBOX_APP_KEY`.
 * A build without it has an empty key and cannot connect to Dropbox
 * (ADR 0005).
 */
export const DROPBOX_APP_KEY = SEAMSYNC_DROPBOX_APP_KEY;

/** The build setting that gives the plugin its Dropbox app key (scripts/esbuild.config.mjs). */
export const DROPBOX_APP_KEY_VARIABLE = "SEAMSYNC_DROPBOX_APP_KEY";
