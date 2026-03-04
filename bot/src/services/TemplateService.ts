/**
 * Template Service
 *
 * Renders Handlebars templates for custom command responses.
 * All helpers are registered once at construction time.
 */

import Handlebars from 'handlebars';
import { logger } from '../utils/logger.js';

export interface TemplateContext {
  user: string;       // <@userId>
  username: string;   // display name
  userId: string;
  server: string;
  memberCount: number;
  channel: string;    // #channel-name
  channelId: string;
  args: string[];     // words after the trigger
}

export class TemplateService {
  constructor() {
    this.registerHelpers();
  }

  private registerHelpers() {
    // {{randint 1 100}} → random integer min–max inclusive
    Handlebars.registerHelper('randint', (min: number, max: number) => {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    });

    // {{choose "a" "b" "c"}} → picks one at random
    Handlebars.registerHelper('choose', (...args: unknown[]) => {
      const options = args.slice(0, -1) as string[];
      return options[Math.floor(Math.random() * options.length)];
    });

    Handlebars.registerHelper('upper', (str: string) => String(str).toUpperCase());
    Handlebars.registerHelper('lower', (str: string) => String(str).toLowerCase());

    // {{time "HH:mm"}}
    Handlebars.registerHelper('time', (fmt: string) => {
      const n = new Date();
      return String(fmt)
        .replace('HH', String(n.getHours()).padStart(2, '0'))
        .replace('mm', String(n.getMinutes()).padStart(2, '0'))
        .replace('ss', String(n.getSeconds()).padStart(2, '0'));
    });

    // {{date "YYYY-MM-DD"}}
    Handlebars.registerHelper('date', (fmt: string) => {
      const n = new Date();
      return String(fmt)
        .replace('YYYY', String(n.getFullYear()))
        .replace('MM', String(n.getMonth() + 1).padStart(2, '0'))
        .replace('DD', String(n.getDate()).padStart(2, '0'));
    });
  }

  /**
   * Render a Handlebars template string with the given context.
   * Falls back to the raw template if rendering fails.
   */
  render(template: string, context: Partial<TemplateContext> & Record<string, unknown>): string {
    try {
      const fn = Handlebars.compile(template, { noEscape: true });
      return fn(context);
    } catch (error) {
      logger.warn('Template render error:', error);
      return template;
    }
  }

  /**
   * Validate a template string. Returns { valid: true } or { valid: false, error: string }.
   */
  validate(template: string): { valid: true } | { valid: false; error: string } {
    try {
      Handlebars.precompile(template);
      return { valid: true };
    } catch (error: unknown) {
      return { valid: false, error: (error as Error).message };
    }
  }
}
