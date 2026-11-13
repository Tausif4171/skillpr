---
name: release-notes
description: Turn merged pull requests into release notes that match our house style.
allowed-tools:
  - Read
  - Write
---

# Release notes

Draft release notes from a list of merged pull requests.

## Steps

1. Ask for the range: a tag, a date, or a list of PR numbers.
2. Read each pull request title and body.
3. Group the changes into Features, Fixes, and Internal.
4. Write one line per change. Start with a verb. No ticket numbers.
5. Save to `RELEASE_NOTES.md` in the repo root.

## Style

- Present tense, second person is wrong here — use third person.
- One sentence per item. If it needs two, it is two items.
- Mention the user-visible effect, not the implementation.

## What not to do

- Do not invent a change that is not in a pull request.
- Do not include internal ticket IDs or reviewer names.
- Do not claim a fix if the linked issue is still open.

See `references/style.md` for examples from the last six releases.
