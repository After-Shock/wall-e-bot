/**
 * Migration runner.
 *
 * Replaces a single 523-line idempotent script that had no version table, no
 * ordering, and no way to express anything but "add this if absent" — so
 * renaming a column, changing a type, or backfilling data had nowhere to live.
 *
 * How it works:
 *   - migrations/NNNN_name.sql are applied in filename order, one transaction
 *     each, and recorded in schema_migrations.
 *   - Data migrations that need application code live in dataMigrations.ts and
 *     are interleaved by the same NNNN prefix.
 *   - A session-level advisory lock serialises concurrent deploys, so two
 *     containers starting at once cannot both apply the same migration.
 *   - Applied .sql files are checksummed. Editing one after it has run is a
 *     hard error: the database no longer matches what the file says, and
 *     silently continuing is how schemas drift apart between environments.
 *
 * Forward-only by design. There are no down migrations: rollback here is
 * "revert the code and leave the additive column in place", which is what the
 * deploy process actually does. If a migration ever needs undoing, write a new
 * one that undoes it.
 *
 * @module db/migrate
 */

import 'dotenv/config';
import pg from 'pg';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataMigrations } from './dataMigrations.js';

const { Pool } = pg;

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

/** Arbitrary but fixed: every deployer must pick the same number to serialise. */
const ADVISORY_LOCK_KEY = 8410231;

export interface Step {
  version: string;
  /** null for data migrations — their checksum would change with every rebuild. */
  checksum: string | null;
  apply(client: pg.PoolClient): Promise<void>;
}

export function sqlSteps(): Step[] {
  let files: string[];
  try {
    files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  } catch (err) {
    throw new Error(`Cannot read migrations directory ${MIGRATIONS_DIR}: ${(err as Error).message}`);
  }

  return files.sort().map((file) => {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    return {
      version: file.replace(/\.sql$/, ''),
      checksum: createHash('sha256').update(sql).digest('hex'),
      async apply(client: pg.PoolClient) {
        await client.query(sql);
      },
    };
  });
}

export function allSteps(): Step[] {
  const steps = [
    ...sqlSteps(),
    ...dataMigrations.map((m) => ({
      version: m.version,
      checksum: null,
      apply: (client: pg.PoolClient) => m.run(client),
    })),
  ];

  const seen = new Set<string>();
  for (const s of steps) {
    if (seen.has(s.version)) throw new Error(`Duplicate migration version: ${s.version}`);
    seen.add(s.version);
  }

  return steps.sort((a, b) => a.version.localeCompare(b.version));
}

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  let locked = false;

  try {
    // Lock FIRST, before any DDL — including creating the bookkeeping table.
    // Two deploys starting together would otherwise both run
    // CREATE TABLE IF NOT EXISTS schema_migrations and collide in the Postgres
    // catalog ("duplicate key value violates unique constraint
    // pg_type_typname_nsp_index"), which IF NOT EXISTS does not protect against
    // concurrently. The advisory lock needs no table to exist.
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    locked = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    TEXT PRIMARY KEY,
        checksum   TEXT,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows } = await client.query('SELECT version, checksum FROM schema_migrations');
    const applied = new Map<string, string | null>(rows.map((r) => [r.version, r.checksum]));

    const steps = allSteps();
    let ran = 0;

    for (const step of steps) {
      if (applied.has(step.version)) {
        const recorded = applied.get(step.version);
        if (step.checksum && recorded && recorded !== step.checksum) {
          throw new Error(
            `Migration ${step.version} has changed since it was applied.\n` +
            `  recorded: ${recorded}\n  current:  ${step.checksum}\n` +
            'The database no longer matches this file. Add a new migration instead of editing it.',
          );
        }
        continue;
      }

      console.log(`applying ${step.version}`);
      try {
        await client.query('BEGIN');
        await step.apply(client);
        await client.query(
          'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)',
          [step.version, step.checksum],
        );
        await client.query('COMMIT');
        ran++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${step.version} failed: ${(err as Error).message}`);
      }
    }

    console.log(
      ran === 0
        ? `Schema up to date (${steps.length} migration(s) already applied).`
        : `Applied ${ran} migration(s); ${steps.length} total.`,
    );
  } catch (error) {
    console.error('Migration failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    if (locked) {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => {});
    }
    client.release();
    await pool.end();
  }
}

// Only run when executed directly. Importing this module (tests) must not
// start a migration against whatever DATABASE_URL happens to be set.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  migrate();
}
