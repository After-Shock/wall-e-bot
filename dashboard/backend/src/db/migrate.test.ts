import test from 'node:test';
import assert from 'node:assert/strict';
import { allSteps, sqlSteps } from './migrate.js';

test('migrations are discovered and ordered by version', () => {
  const steps = allSteps();
  assert.ok(steps.length >= 2, 'baseline and the token backfill must both be found');

  const versions = steps.map((s) => s.version);
  const sorted = [...versions].sort();
  assert.deepEqual(versions, sorted, 'steps must be applied in version order');
  assert.equal(versions[0], '0001_baseline');
});

test('every version is unique across sql and data migrations', () => {
  const versions = allSteps().map((s) => s.version);
  assert.equal(new Set(versions).size, versions.length, 'duplicate version prefixes collide');
});

test('migration filenames follow NNNN_name', () => {
  for (const step of sqlSteps()) {
    assert.match(step.version, /^\d{4}_[a-z0-9_]+$/,
      `${step.version} must be NNNN_lower_snake_case so ordering is lexicographic`);
  }
});

test('sql migrations are checksummed, data migrations are not', () => {
  for (const step of sqlSteps()) {
    assert.match(step.checksum ?? '', /^[0-9a-f]{64}$/, `${step.version} needs a sha256`);
  }
  // Data migrations are compiled JS; their text changes between builds, so
  // checksumming them would fail spuriously.
  const data = allSteps().filter((s) => !sqlSteps().some((q) => q.version === s.version));
  for (const step of data) assert.equal(step.checksum, null);
});
