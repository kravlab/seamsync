import { createKeyboardBar, type KeyboardBarOwner } from "../../src/ui/keyboard-bar";

/** One switch of the native keyboard bar, with what `observe` saw at the moment it was asked for. */
export interface RecordedSwitch<T> {
	readonly isVisible: boolean;
	readonly observed: T;
}

/**
 * A keyboard bar whose native calls are recorded: `switches` lists, in order,
 * every call it was asked to make, as the `isVisible` it was asked to switch
 * to; nothing is observed besides that, so each `observed` is `undefined`.
 * Tests assert on these alone, since they are all the user can ever observe
 * of the bar.
 *
 * @returns the bar and the recorded switches
 */
export function recordedKeyboardBar(): {
	readonly bar: KeyboardBarOwner;
	readonly switches: RecordedSwitch<undefined>[];
};
/**
 * A keyboard bar whose native calls are recorded, as in the overload without
 * `observe`, with what `observe` returned at each switch. `observe` is called
 * late, at each switch, so it may read something that only exists later (a
 * window or tab built after the bar).
 *
 * @param observe reads whatever the test wants to know at each switch
 * @returns the bar and the recorded switches
 */
export function recordedKeyboardBar<T>(observe: () => T): { readonly bar: KeyboardBarOwner; readonly switches: RecordedSwitch<T>[] };
/**
 * Implementation of both overloads: without `observe`, nothing is observed.
 *
 * @param observe reads whatever the test wants to know at each switch, if given
 * @returns the bar and the recorded switches
 */
export function recordedKeyboardBar(observe?: () => unknown): {
	readonly bar: KeyboardBarOwner;
	readonly switches: RecordedSwitch<unknown>[];
} {
	const switches: RecordedSwitch<unknown>[] = [];
	const bar = createKeyboardBar({
		setVisible: (isVisible) => {
			switches.push({ isVisible, observed: observe?.() });
			return Promise.resolve();
		},
	});
	return { bar, switches };
}

/**
 * The `isVisible` of each of `switches`, in order.
 *
 * @param switches the recorded switches
 * @returns what the bar was asked to switch to, in order
 */
export function switchedTo(switches: readonly { readonly isVisible: boolean }[]): boolean[] {
	return switches.map((entry) => entry.isVisible);
}
