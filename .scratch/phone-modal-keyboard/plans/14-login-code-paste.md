# Plan: Paste button for the Login code (#14)

Part of #13. Approved 2026-11-10.

## Decisions

- The Login code row reads: field, Paste, Continue.
- Paste reads `navigator.clipboard.readText()` and replaces the field's
  content through `setValue`, without focusing it, so no keyboard opens.
  It never submits.
- A missing clipboard API counts as a refused read: same message.
- A clipboard holding only spaces and line breaks counts as empty; the
  field is left as it was.
- A refused read is logged to the console, as a refused write is.
- A successful Paste clears a clipboard message shown before it; other
  messages, such as a refused code, stay.
- Clipboard messages have no detail line and no buttons, are not
  connect failures, and keep the pending authorization.

## Steps

- [x] 1. Strings `paste`, `clipboardRefused`, `clipboardEmpty` in English
      and Russian.
- [x] 2. Paste fills the field and submits nothing; Continue after it
      submits the trimmed code (jsdom, both languages).
- [x] 3. Refused and empty clipboard messages at the top, without "Copy
      error", the login not restarted, replaced once the user goes on
      (jsdom, both languages).
- [x] 4. README Disclosures: the clipboard is read only on Paste. An
      iPhone step in "Still checked by hand" of
      `.scratch/check-automation/spec.md`.
- [x] 5. Typecheck, format, lint, Markdown lint, full test suite.
- [x] 6. Code review, then commit with `Closes #14`.
