import { describe, expect, it } from '@jest/globals';
import { readdirSync } from 'fs';
import { join } from 'path';

// Wall-E slash commands are staff-only by default; per-role access is granted in
// Server Settings → Integrations, which only affects Wall-E (not Edna's /signup, /expires).
describe('slash command defaults', () => {
  it('every command sets default member permissions', async () => {
    const root = join(process.cwd(), 'src', 'commands');
    const open: string[] = [];
    for (const folder of readdirSync(root)) {
      for (const file of readdirSync(join(root, folder)).filter(f => f.endsWith('.ts'))) {
        const { default: command } = await import(join(root, folder, file));
        if (!command.data.toJSON().default_member_permissions) open.push(command.data.name);
      }
    }
    expect(open).toEqual([]);
  });
});
