/**
 * Input Sanitization Utilities
 * 
 * Functions to sanitize user input and prevent common attacks.
 * 
 * @module utils/sanitize
 */

import { z } from 'zod';

/**
 * Characters that could be used for Discord mention exploits.
 */
const MENTION_PATTERN = /@(everyone|here|&\d{17,20})/g;

/**
 * Characters that could cause issues in messages.
 */
const UNSAFE_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g;

/**
 * URL pattern for detecting links.
 */
const URL_PATTERN = /https?:\/\/[^\s]+/gi;

/**
 * Discord invite pattern.
 */
const INVITE_PATTERN = /discord\.(gg|com\/invite)\/[a-zA-Z0-9]+/gi;

/**
 * Sanitize a custom command response.
 * 
 * - Escapes @everyone and @here mentions
 * - Removes zero-width characters
 * - Limits length
 * 
 * @param input - Raw user input
 * @param maxLength - Maximum allowed length (default 2000 for Discord)
 * @returns Sanitized string
 */
export function sanitizeCommandResponse(input: string, maxLength = 2000): string {
  return input
    // Replace mentions with escaped versions
    .replace(/@everyone/gi, '@\u200Beveryone')
    .replace(/@here/gi, '@\u200Bhere')
    // Remove invisible characters (except the one we just added)
    .replace(/[\u0000-\u001F\u007F-\u009F\uFEFF]/g, '')
    // Remove excessive newlines
    .replace(/\n{4,}/g, '\n\n\n')
    // Trim and limit length
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitize user-provided embed content.
 */
export function sanitizeEmbedContent(input: string, maxLength = 4096): string {
  return sanitizeCommandResponse(input, maxLength);
}

/**
 * Sanitize a title or name field.
 */
export function sanitizeTitle(input: string, maxLength = 256): string {
  return input
    .replace(UNSAFE_CHARS, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * Check if a string contains Discord invites.
 */
export function containsInvite(input: string): boolean {
  return INVITE_PATTERN.test(input);
}

/**
 * Check if a string contains URLs.
 */
export function containsUrl(input: string): boolean {
  return URL_PATTERN.test(input);
}

/**
 * Remove all mentions from a string.
 */
export function stripMentions(input: string): string {
  return input
    .replace(MENTION_PATTERN, '[mention]')
    .replace(/<@!?\d{17,20}>/g, '[user]')
    .replace(/<#\d{17,20}>/g, '[channel]')
    .replace(/<@&\d{17,20}>/g, '[role]');
}

/**
 * Zod schemas for common input validation.
 */
export const schemas = {
  /** Discord snowflake ID */
  snowflake: z.string().regex(/^\d{17,20}$/, 'Invalid Discord ID'),
  
  /** Custom command name */
  commandName: z
    .string()
    .min(1, 'Command name is required')
    .max(32, 'Command name must be 32 characters or less')
    .regex(/^[a-z0-9-]+$/, 'Command name must be lowercase alphanumeric with hyphens'),
  
  /** Custom command response */
  commandResponse: z
    .string()
    .min(1, 'Response is required')
    .max(2000, 'Response must be 2000 characters or less')
    .transform((val) => sanitizeCommandResponse(val)),
  
  /** Embed title */
  embedTitle: z
    .string()
    .max(256, 'Title must be 256 characters or less')
    .transform((val) => sanitizeTitle(val)),
  
  /** Embed description */
  embedDescription: z
    .string()
    .max(4096, 'Description must be 4096 characters or less')
    .transform((val) => sanitizeEmbedContent(val)),
  
  /** Hex color code */
  hexColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color (use format #RRGGBB)'),
  
  /** Duration in minutes */
  durationMinutes: z
    .number()
    .int()
    .min(1, 'Duration must be at least 1 minute')
    .max(525600, 'Duration cannot exceed 1 year'),
  
  /** Reason for moderation action */
  moderationReason: z
    .string()
    .max(512, 'Reason must be 512 characters or less')
    .optional()
    .transform((val) => val ? sanitizeTitle(val, 512) : undefined),
};

/**
 * Validate and sanitize custom command input.
 */
export function validateCustomCommand(input: {
  name: string;
  response: string;
  embed?: boolean;
  embedColor?: string;
}): { success: true; data: typeof input } | { success: false; error: string } {
  try {
    const schema = z.object({
      name: schemas.commandName,
      response: schemas.commandResponse,
      embed: z.boolean().optional(),
      embedColor: schemas.hexColor.optional(),
    });
    
    const result = schema.parse(input);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return { success: false, error: 'Invalid input' };
  }
}
