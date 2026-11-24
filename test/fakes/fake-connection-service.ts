import type { ConnectionService } from "../../src/engine/connection";

/**
 * A connection service that starts a login and answers nothing else:
 * every other call is one a UI test never expects, and rejects. Shared by
 * the UI tests that only need a window to open over a service.
 *
 * @param overrides the calls to answer differently, each replacing its default
 * @returns the service
 */
export function connectionServiceFor(overrides: Partial<ConnectionService> = {}): ConnectionService {
	return {
		showStatus: () => Promise.resolve(),
		currentDevice: () => Promise.resolve(null),
		disconnect: () => Promise.resolve({ kind: "disconnected" }),
		startAuthorization: () =>
			Promise.resolve({ authorizeUrl: "https://example.com/authorize", submitCode: () => Promise.reject(new Error("unused")) }),
		renameDevice: () => Promise.reject(new Error("unused")),
		otherDevices: () => Promise.reject(new Error("unused")),
		forgetDevice: () => Promise.reject(new Error("unused")),
		sharedSettings: () => Promise.resolve(null),
		...overrides,
	};
}
