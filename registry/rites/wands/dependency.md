---
id: dependency
title: The Dependency
trigger: Use before adding a new dependency, or when vendoring third-party code.
default_bind:
  change_types: [dependency-add]
---
Every coupling is a commitment. Before taking on a new dependency, work
through this — in the PR or commit, record the answers, not just the result.

1. **Exhaust what you have.** Can the standard library, an existing
   dependency, or a small amount of local code do this? A dependency that
   replaces fewer than ~50 lines of straightforward code is usually not
   worth its ongoing cost.
2. **Vet the candidate.** Maintenance activity and bus factor; open security
   advisories; license compatibility; install scripts and postinstall hooks;
   the size of the transitive tree it drags in; whether the name could be a
   typosquat of something more popular.
3. **Take the smallest dose.** Prefer the focused package over the
   framework; import the module you need, not the meta-package.
4. **Pin and lock.** The version is pinned to a known-good release and the
   lockfile change is committed and reviewed like code.
5. **Contain the blast radius.** If the dependency touches core logic, wrap
   it behind a small local interface so it can be replaced without a
   codebase-wide rewrite.
6. **Record the why.** The commit or PR states what was evaluated and why
   this dependency won — future removals depend on that record.
