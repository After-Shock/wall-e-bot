/**
 * Data migrations.
 *
 * Some migrations cannot be expressed in SQL — this one needs the application's
 * encryption key. They are versioned and recorded alongside the .sql files so
 * they run exactly once, in order, rather than on every deploy.
 *
 * Name them with the same NNNN_ prefix convention; the runner interleaves both
 * kinds by version.
 *
 * @module db/dataMigrations
 */

import type { PoolClient } from 'pg';
import { encryptToken, isEncrypted } from '../utils/crypto.js';

export interface DataMigration {
  version: string;
  run(client: PoolClient): Promise<void>;
}

export const dataMigrations: DataMigration[] = [
  {
    // Previously re-run on every single deploy as an unconditional post-step.
    // It was idempotent so that was harmless, just wasteful and untracked.
    version: '0002_encrypt_oauth_tokens',
    async run(client) {
      const { rows } = await client.query(
        'SELECT discord_id, access_token, refresh_token FROM users WHERE access_token IS NOT NULL',
      );

      let count = 0;
      for (const row of rows) {
        const newAccess = isEncrypted(row.access_token)
          ? row.access_token
          : encryptToken(row.access_token);
        const newRefresh = row.refresh_token && !isEncrypted(row.refresh_token)
          ? encryptToken(row.refresh_token)
          : row.refresh_token;

        if (newAccess !== row.access_token || newRefresh !== row.refresh_token) {
          await client.query(
            'UPDATE users SET access_token = $1, refresh_token = $2 WHERE discord_id = $3',
            [newAccess, newRefresh, row.discord_id],
          );
          count++;
        }
      }
      console.log(`  encrypted ${count} user token(s)`);
    },
  },
];
