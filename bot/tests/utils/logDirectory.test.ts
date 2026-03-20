import { resolveLogDirectory } from '../../src/utils/logDirectory.js';

describe('resolveLogDirectory', () => {
  test('uses a writable tmp path by default in production', () => {
    expect(resolveLogDirectory({ nodeEnv: 'production' })).toBe('/tmp/wall-e-bot/logs');
  });

  test('keeps the local logs directory in development', () => {
    expect(resolveLogDirectory({ nodeEnv: 'development' })).toBe('logs');
  });

  test('prefers an explicit LOG_DIR override', () => {
    expect(
      resolveLogDirectory({
        nodeEnv: 'production',
        logDir: '/var/log/wall-e-bot',
      }),
    ).toBe('/var/log/wall-e-bot');
  });
});
