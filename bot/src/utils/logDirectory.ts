interface ResolveLogDirectoryOptions {
  logDir?: string;
  nodeEnv?: string;
}

export function resolveLogDirectory({
  logDir = process.env.LOG_DIR,
  nodeEnv = process.env.NODE_ENV,
}: ResolveLogDirectoryOptions = {}): string {
  if (logDir) {
    return logDir;
  }

  if (nodeEnv === 'production') {
    return '/tmp/wall-e-bot/logs';
  }

  return 'logs';
}
