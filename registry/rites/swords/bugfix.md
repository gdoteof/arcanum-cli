---
id: bugfix
title: The Bugfix
trigger: Use when fixing a bug, regression, or defect of any kind.
default_bind:
  change_types: [bugfix]
---
Bug fixes follow this workflow, in this order.

1. **Reproduce first.** Write a failing test that captures the bug before
   touching the fix. If the bug cannot be captured in a test, reproduce it
   manually and record the exact steps in the commit message.
2. **Find the root cause.** Trace the failure to its origin before changing
   anything. A fix at the symptom site (a null check that hides the real
   problem, a retry that papers over a race) is not a fix.
3. **Fix minimally.** Change what the root cause requires and nothing else —
   no drive-by refactoring in the same commit.
4. **Prove it.** The reproduction test now passes, and the whole suite is
   green. If the fix changed behavior a test depended on, understand why
   before updating that test.
5. **Hunt the siblings.** Search for the same pattern elsewhere in the
   codebase; the mistake that happened once usually happened twice. Fix or
   report what you find.
6. **Record the cause.** The commit message states the root cause, not just
   the symptom.
