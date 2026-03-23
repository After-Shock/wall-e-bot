import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_HEX = process.env.TOKEN_ENCRYPTION_KEY ?? '';

function getKey(): Buffer {
  if (KEY_HEX.length !== 64) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(KEY_HEX, 'hex');
}

/**
 * Encrypt a Discord OAuth token for storage.
 * Returns: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a stored token. Returns null if not in encrypted format or decryption fails.
 */
export function decryptToken(stored: string): string | null {
  const parts = stored.split(':');
  if (parts.length !== 3) return null;
  try {
    const [ivHex, authTagHex, ciphertextHex] = parts;
    const key = getKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
  } catch {
    return null;
  }
}

/**
 * Returns true if the string is in encrypted format (iv:tag:ct).
 * Used during migration to skip already-encrypted values.
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 3 && parts.every(p => /^[0-9a-f]+$/i.test(p));
}

// Validate key at module load — fail fast if misconfigured
if (process.env.NODE_ENV !== 'test') {
  getKey(); // throws immediately if TOKEN_ENCRYPTION_KEY is missing/invalid
}
