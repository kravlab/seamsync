# Keyless source build, attested release built in CI

The community directory's automated review runs `pnpm run build` in a clean environment, which has no Dropbox app key, so the build must succeed without one: it then bundles no key, and the plugin's connect screen says that this build cannot reach Dropbox instead of opening a Dropbox login that fails. Releases are built by a GitHub Actions workflow, started by pushing a tag equal to the `manifest.json` version, which takes the key from an encrypted Actions secret, refuses to build when that secret is empty, attests `main.js` and `styles.css`, and creates a draft release for a human to publish. We rejected committing the key, although it is public by design (ADR 0004; the login uses PKCE) and ships inside every released `main.js`, because no key or credential of any kind is ever written in the repository.

## Consequences

- A build from source never matches the released `main.js` byte for byte, so a review step that compares the two cannot pass; the attestation, not the rebuild, is what proves where a release came from.
- A release can only be made through the workflow: a `main.js` built anywhere else carries no attestation.
