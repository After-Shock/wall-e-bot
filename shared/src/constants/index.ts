export const XP_PER_MESSAGE = { min: 15, max: 25 };
export const XP_COOLDOWN = 60; // seconds

export const COLORS = {
  PRIMARY: 0x5865F2,    // Discord Blurple
  SUCCESS: 0x57F287,    // Green
  WARNING: 0xFEE75C,    // Yellow
  ERROR: 0xED4245,      // Red
  INFO: 0x5865F2,       // Blurple
  MUTED: 0x99AAB5,      // Gray
} as const;

function calculateXpForLevel(level: number): number {
  // Inverse of level formula
  return Math.pow(level / 0.1, 2);
}

export function calculateXpForNextLevel(currentLevel: number): number {
  return calculateXpForLevel(currentLevel + 1);
}
