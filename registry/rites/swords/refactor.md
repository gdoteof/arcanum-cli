---
id: refactor
title: The Refactor
trigger: Use when restructuring existing code without changing its behavior.
default_bind:
  change_types: [refactor]
---
Refactors follow this workflow. The invariant: observable behavior identical
before and after, and provably so.

1. **Green before.** The affected area's tests pass before you start. If the
   area has no meaningful tests, write characterization tests first — capture
   what the code *does*, even where that differs from what it should do.
2. **No mixed changes.** Behavior changes and refactoring never share a
   commit. If the refactor exposes a bug, note it, finish the refactor, fix
   the bug separately.
3. **Small mechanical steps.** Prefer a sequence of individually safe moves
   (rename, extract, inline, move) over one big rewrite; commit at each
   stable point.
4. **Green after, honestly.** The same tests pass unmodified. Editing a
   test's assertions during a refactor means behavior changed — stop and
   reconsider. Renames and import-path updates in tests are fine.
5. **Sweep your orphans.** Remove code, exports, and imports that your
   restructuring made dead. Leave pre-existing dead code alone — report it
   instead.
