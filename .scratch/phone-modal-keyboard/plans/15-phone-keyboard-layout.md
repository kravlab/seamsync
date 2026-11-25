# Plan: windows with text fields above the phone's keyboard (#15)

Part of #13. Approved 2026-11-10.

## Decisions

- `fitForPhone(modal, { textFields: true })` marks a window with text
  fields: on a phone it gets `seamsync-phone-fields` besides
  `seamsync-phone`. The connect window and the Edit… dialog opt in.
- The stylesheet applies only to `.modal.seamsync-phone-fields`: the
  window sits at the top of the screen, its maximum height leaves out
  `--keyboard-height`, and its content scrolls.
- jsdom: on a phone the connect window and the Edit… dialog carry the
  marker; other windows, tablets and desktop do not.
- Android run, check 21: a shared scenario in `test/e2e/support/page.ts`
  opens a real keyboard by focusing the field in a DevTools evaluation
  (which runs as a user's gesture), then checks that the window starts
  at the top and that the field and every button of its row scroll
  fully above the keyboard. `AndroidPhone.start` sets
  `show_ime_with_hard_keyboard` to 1, so the emulator, which has a
  hardware keyboard, shows the on-screen one whatever the device kept.
  (Changed after the spike, 2026-11-10: no tap through DevTools.)

## Spike findings (Obsidian 1.14.4 on the emulator)

- Focusing the field in an evaluation opens the keyboard
  (`dumpsys input_method`: `mInputShown=true`).
- Obsidian writes `--keyboard-height` (295.24 px here) and the same value
  as `--safe-area-inset-bottom` into the root element's inline style;
  both go back to `0px` once the field loses focus.
- `innerHeight` and `visualViewport.height` stay 914 with the keyboard
  open: the area above it is `innerHeight` minus `--keyboard-height`.
- The connect window is centred (top 263 px); the Code field's bottom
  (635 px) is under the keyboard (618.8 px).

## Steps

- [x] 1. Spike on the emulator (throwaway): how a real keyboard opens,
      where `--keyboard-height` is set, whether `innerHeight` changes.
- [x] 2. The marker on a phone for the connect window and the Edit…
      dialog only (jsdom).
- [x] 3. The stylesheet rules for the marker.
- [x] 4. E2E support: `AndroidPhone.start` shows the on-screen keyboard
      with the emulator's hardware keyboard
      (`show_ime_with_hard_keyboard`).
- [x] 5. Scenario check 21, run by `test/e2e/android/phone.test.ts`
      before check 1; 21 in the run's checks; run it on the emulator.
- [x] 6. Check 21 in `.scratch/check-automation/spec.md`; the iPhone item
      in "Still checked by hand" extended.
- [x] 7. Typecheck, format, lint, Markdown lint, spelling, knip, full
      test suite.
- [ ] 8. Code review, then commit with `Closes #15`.

## Review fixes (approved 2026-11-10)

- [x] Check 21 also requires the whole window above the keyboard.
- [x] Check 21 in its own module, `test/e2e/support/keyboard-page.ts`.
- [x] The connect window's Remote screen measured in the Android run,
      right after check 1's login.
- [x] No duplicate marker test in `test/ui/connect-modal.test.ts`.
- [x] `fitForPhone` reads `textFields` without `=== true`.
- [x] Check 14 run again on Android and on the desktop.
- [ ] The Remote screen's check 21 test run on the emulator: not run
      yet, it needs a full Android run with a real Dropbox login.
