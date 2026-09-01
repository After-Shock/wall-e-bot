# Migrations

Applied in filename order, one transaction each, recorded in `schema_migrations`.

## Adding one

Create `NNNN_short_name.sql` with the next number:

```sql
-- 0003_add_thing
ALTER TABLE guild_members ADD COLUMN thing TEXT;
```

Then `npm run migrate -w dashboard/backend`. That is all — no registration step.

Needs application code (an encryption key, a parsed config)? Add an entry to
`src/db/dataMigrations.ts` using the same `NNNN_` prefix. Both kinds are
interleaved by version.

## Rules

**Never edit a migration that has been applied.** The runner stores a checksum
of every `.sql` file and refuses to continue if one changes, because at that
point the database no longer matches the file and environments silently drift.
Write a new migration instead.

**Forward-only.** There are no down migrations. Rollback here is "revert the
code and leave the additive column", which is what the deploy process actually
does — see the deploy section in the root README. To undo something, write a new
migration that undoes it.

**Prefer additive changes.** A deploy runs migrations *before* swapping
containers, so for the duration of a deploy the old code runs against the new
schema. Adding a column is invisible to it; dropping or renaming one is not. To
remove a column, ship the code that stops using it first, then drop it in a
later deploy.

## Baseline

`0001_baseline.sql` is the schema as it stood when this was introduced, taken
verbatim from the old `db/migrate.ts`. Every statement is `IF NOT EXISTS`, which
is what let the existing production database adopt it: applying it there was a
no-op that simply got recorded. New migrations do not need to be idempotent —
they run exactly once, inside a transaction.
