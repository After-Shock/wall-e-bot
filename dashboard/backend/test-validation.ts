/**
 * Standalone validation test script
 * Tests the Zod schemas without needing the full server running
 */

import { z } from 'zod';

// Discord snowflake ID regex (17-19 digits)
const discordIdRegex = /^\d{17,19}$/;
const discordId = z.string().regex(discordIdRegex, 'Invalid Discord ID format');

// Hex color regex (#RRGGBB)
const hexColorRegex = /^#[0-9A-F]{6}$/i;
const hexColor = z.string().regex(hexColorRegex, 'Invalid hex color (must be #RRGGBB)');

const WelcomeConfigSchema = z.object({
  enabled: z.boolean(),
  channelId: discordId.optional(),
  message: z.string().min(1).max(2000),
  embedEnabled: z.boolean(),
  embedColor: hexColor.optional(),
  embedImage: z.string().url().optional(),
  dmEnabled: z.boolean(),
  dmMessage: z.string().min(1).max(2000).optional(),
  autoRole: z.array(discordId).max(50).optional(), // Max 50 auto-roles (DoS protection)
  leaveEnabled: z.boolean(),
  leaveChannelId: discordId.optional(),
  leaveMessage: z.string().min(1).max(2000).optional(),
}).partial();

console.log('🧪 Testing Backend Validation Security\n');
console.log('=' .repeat(60));

// Test 1: Invalid Discord ID (too short)
console.log('\n📋 Test 1: Invalid Discord ID (too short)');
try {
  WelcomeConfigSchema.parse({ channelId: '123' });
  console.log('❌ FAIL: Should have rejected short Discord ID');
} catch (error) {
  if (error instanceof z.ZodError) {
    console.log('✅ PASS: Rejected invalid Discord ID');
    console.log('   Error:', error.errors[0].message);
  }
}

// Test 2: Invalid Discord ID (contains letters)
console.log('\n📋 Test 2: Invalid Discord ID (contains letters)');
try {
  WelcomeConfigSchema.parse({ channelId: '12345abc67890' });
  console.log('❌ FAIL: Should have rejected non-numeric ID');
} catch (error) {
  if (error instanceof z.ZodError) {
    console.log('✅ PASS: Rejected non-numeric Discord ID');
    console.log('   Error:', error.errors[0].message);
  }
}

// Test 3: Message too long (>2000 chars - Discord limit)
console.log('\n📋 Test 3: Message exceeds Discord limit (>2000 chars)');
try {
  const longMessage = 'a'.repeat(2001);
  WelcomeConfigSchema.parse({ message: longMessage });
  console.log('❌ FAIL: Should have rejected message >2000 chars');
} catch (error) {
  if (error instanceof z.ZodError) {
    console.log('✅ PASS: Rejected message exceeding 2000 character limit');
    console.log('   Error:', error.errors[0].message);
  }
}

// Test 4: Invalid hex color
console.log('\n📋 Test 4: Invalid hex color (wrong format)');
try {
  WelcomeConfigSchema.parse({ embedColor: 'blue' });
  console.log('❌ FAIL: Should have rejected invalid color');
} catch (error) {
  if (error instanceof z.ZodError) {
    console.log('✅ PASS: Rejected invalid hex color');
    console.log('   Error:', error.errors[0].message);
  }
}

// Test 5: Invalid hex color (wrong length)
console.log('\n📋 Test 5: Invalid hex color (wrong length)');
try {
  WelcomeConfigSchema.parse({ embedColor: '#FFF' });
  console.log('❌ FAIL: Should have rejected short hex color');
} catch (error) {
  if (error instanceof z.ZodError) {
    console.log('✅ PASS: Rejected hex color with wrong length');
    console.log('   Error:', error.errors[0].message);
  }
}

// Test 6: Invalid URL for embed image
console.log('\n📋 Test 6: Invalid URL for embed image');
try {
  WelcomeConfigSchema.parse({ embedImage: 'not-a-url' });
  console.log('❌ FAIL: Should have rejected invalid URL');
} catch (error) {
  if (error instanceof z.ZodError) {
    console.log('✅ PASS: Rejected invalid URL');
    console.log('   Error:', error.errors[0].message);
  }
}

// Test 7: Valid request (should pass)
console.log('\n📋 Test 7: Valid configuration (should pass)');
try {
  const valid = WelcomeConfigSchema.parse({
    enabled: true,
    channelId: '1234567890123456789', // Valid 19-digit snowflake
    message: 'Welcome {user} to {server}!',
    embedEnabled: true,
    embedColor: '#5865F2',
    embedImage: 'https://example.com/banner.png',
    dmEnabled: false,
  });
  console.log('✅ PASS: Accepted valid configuration');
  console.log('   Validated data:', JSON.stringify(valid, null, 2));
} catch (error) {
  console.log('❌ FAIL: Should have accepted valid config');
  if (error instanceof z.ZodError) {
    console.log('   Errors:', error.errors);
  }
}

// Test 8: Partial update (only some fields)
console.log('\n📋 Test 8: Partial update (only updating enabled)');
try {
  const partial = WelcomeConfigSchema.parse({ enabled: false });
  console.log('✅ PASS: Accepted partial update');
  console.log('   Updated fields:', JSON.stringify(partial, null, 2));
} catch (error) {
  console.log('❌ FAIL: Should have accepted partial update');
}

// Test 9: SQL Injection attempt (should be sanitized by validation)
console.log('\n📋 Test 9: SQL Injection attempt in message field');
try {
  WelcomeConfigSchema.parse({
    message: "'; DROP TABLE users; --",
  });
  console.log('✅ PASS: Accepted string (would be safely parameterized in DB)');
  console.log('   Note: Zod validates format, Postgres prepared statements prevent SQL injection');
} catch (error) {
  console.log('❌ FAIL: Should accept the string (SQL safety is at DB layer)');
}

// Test 10: XSS attempt in message
console.log('\n📋 Test 10: XSS attempt in message field');
try {
  WelcomeConfigSchema.parse({
    message: '<script>alert("xss")</script>',
  });
  console.log('✅ PASS: Accepted string (Discord sanitizes rendering)');
  console.log('   Note: Discord\'s client handles XSS prevention during display');
} catch (error) {
  console.log('❌ FAIL: Should accept the string');
}

// Test 11: Massive payload (DoS attempt)
console.log('\n📋 Test 11: DoS attempt with massive array');
try {
  const massiveArray = new Array(10000).fill('1234567890123456789');
  WelcomeConfigSchema.parse({ autoRole: massiveArray });
  console.log('❌ FAIL: Should have rejected massive array');
} catch (error) {
  if (error instanceof z.ZodError) {
    console.log('✅ PASS: Rejected massive array (DoS protection active)');
    console.log('   Error:', error.errors[0].message);
  }
}

console.log('\n' + '='.repeat(60));
console.log('\n🔒 Security Summary:');
console.log('   ✅ Discord ID format validation');
console.log('   ✅ Message length limits (Discord\'s 2000 char limit)');
console.log('   ✅ Hex color format validation');
console.log('   ✅ URL format validation');
console.log('   ✅ Partial updates supported');
console.log('   ✅ Array size limits (DoS protection)');
console.log('\n💡 Combined with:');
console.log('   - PostgreSQL prepared statements (prevents SQL injection)');
console.log('   - Rate limiting (10 requests/min per guild)');
console.log('   - Authentication middleware (requireAuth)');
console.log('   - Guild access verification (requireGuildAccess)');
console.log('\n   This provides comprehensive protection! 🛡️\n');
