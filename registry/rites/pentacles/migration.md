---
id: migration
title: The Migration
trigger: Use when making any database schema change — adding or altering tables, columns, indexes, or constraints — or writing a data migration.
default_bind:
  change_types: [schema]
---
Schema changes follow this workflow. Do not improvise the order.

1. **One migration per change.** Write a new migration file; never edit a
   migration that may already have run anywhere. Include a working down/
   rollback step, or state explicitly why rollback is impossible.
2. **Stay deploy-compatible.** Code that is already running must work against
   both the old and new schema during the deploy window. For breaking shapes,
   use expand → migrate → contract: add the new form, move readers/writers
   over, remove the old form in a later change.
3. **Separate schema from data.** Backfills and data rewrites are their own
   migration (or job), not a side effect of a schema statement — they have
   different failure modes and different rollbacks.
4. **Mind the locks.** For large or hot tables, check what locks each
   statement takes on the production engine; prefer online/concurrent index
   creation where the engine offers it.
5. **Test both directions.** Run the migration up and down against realistic
   data — including rows with nulls, duplicates, and maximum lengths — not
   just an empty database.
6. **Reconcile the models.** After the final state, ORM models, generated
   types, and fixtures match the schema exactly.
