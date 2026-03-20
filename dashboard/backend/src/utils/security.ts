const PRIVATE_HOSTNAME_SUFFIXES = ['.local', '.internal', '.localhost'];
const PRIVATE_IPV4_PATTERNS = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
];

export function assertValidSessionSecret(secret: string | undefined): string {
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters long');
  }

  return secret;
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  if (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    normalized.endsWith('.localhost')
  ) {
    return true;
  }

  if (PRIVATE_HOSTNAME_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) {
    return true;
  }

  return PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isSafeExternalImageUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return false;
  }

  if (parsed.username || parsed.password) {
    return false;
  }

  return !isPrivateHostname(parsed.hostname);
}

export function isSafeDiscordOAuthRedirect(
  dashboardUrl: string,
  redirectTarget: string,
): boolean {
  try {
    const base = new URL(dashboardUrl);
    const resolved = new URL(redirectTarget, base);
    return resolved.origin === base.origin;
  } catch {
    return false;
  }
}
