# Long Responses + Embed Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Raise custom command response limit to 20,000 characters with automatic multi-message splitting, and add a live Discord-style embed preview in the command editor.

**Architecture:** A new `sendLong` bot utility handles splitting plain-text responses at word/line boundaries into ≤2000-char messages. The backend schema limit is raised to 20,000. The frontend counter is updated to match, and a new `EmbedPreview` component renders a Discord-style card below the response editor when Embed is selected.

**Tech Stack:** TypeScript, discord.js 14, React 18, TailwindCSS — no new dependencies.

---

### Task 1: Bot — create sendLong utility

**Files:**
- Create: `bot/src/utils/sendLong.ts`

**Step 1: Create the file**

```typescript
import type { TextChannel, DMChannel, NewsChannel, ThreadChannel } from 'discord.js';

type Sendable = { send: (content: string) => Promise<unknown> };

/**
 * Send a potentially long text message, splitting into ≤2000-char chunks
 * at the last newline or space boundary before the limit.
 */
export async function sendLong(channel: Sendable, text: string): Promise<void> {
  if (text.length <= 2000) {
    await channel.send(text);
    return;
  }

  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= 2000) {
      await channel.send(remaining);
      break;
    }

    // Find best split point within first 2000 chars
    const slice = remaining.slice(0, 2000);
    let splitAt = slice.lastIndexOf('\n');
    if (splitAt <= 0) splitAt = slice.lastIndexOf(' ');
    if (splitAt <= 0) splitAt = 2000; // hard cut as last resort

    await channel.send(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }
}
```

**Step 2: TypeScript check**

```bash
cd /home/plex/wall-e-bot/bot && node_modules/.bin/tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add bot/src/utils/sendLong.ts
git commit -m "feat: add sendLong utility for splitting responses over 2000 chars"
```

---

### Task 2: Bot — use sendLong in messageCreate

**Files:**
- Modify: `bot/src/events/messageCreate.ts`

**Step 1: Add import**

At the top of the file, add:
```typescript
import { sendLong } from '../utils/sendLong.js';
```

**Step 2: Replace the plain-text send call**

Find:
```typescript
    } else {
      await channel.send(rendered);
    }
```

Replace with:
```typescript
    } else {
      await sendLong(channel, rendered);
    }
```

**Step 3: TypeScript check**

```bash
cd /home/plex/wall-e-bot/bot && node_modules/.bin/tsc --noEmit
```

**Step 4: Commit**

```bash
git add bot/src/events/messageCreate.ts
git commit -m "feat: use sendLong in messageCreate for responses over 2000 chars"
```

---

### Task 3: Bot — use sendLong in reactionAdd and reactionRemove

**Files:**
- Modify: `bot/src/events/reactionAdd.ts`
- Modify: `bot/src/events/reactionRemove.ts`

**Step 1: In reactionAdd.ts, add import at top**

```typescript
import { sendLong } from '../utils/sendLong.js';
```

**Step 2: Replace the plain-text send call in reactionAdd.ts**

Find:
```typescript
      } else {
        await (channel as import('discord.js').TextChannel).send(rendered);
      }
```

Replace with:
```typescript
      } else {
        await sendLong(channel as import('discord.js').TextChannel, rendered);
      }
```

**Step 3: Repeat for reactionRemove.ts** — same import and same replacement.

**Step 4: TypeScript check**

```bash
cd /home/plex/wall-e-bot/bot && node_modules/.bin/tsc --noEmit
```

**Step 5: Commit**

```bash
git add bot/src/events/reactionAdd.ts bot/src/events/reactionRemove.ts
git commit -m "feat: use sendLong in reaction event handlers"
```

---

### Task 4: Bot — use sendLong in SchedulerService

**Files:**
- Modify: `bot/src/services/SchedulerService.ts`

**Step 1: Add import at top of file**

```typescript
import { sendLong } from '../utils/sendLong.js';
```

**Step 2: Replace the plain-text send call in fireIntervalCommand**

Find:
```typescript
      } else {
        await (channel as import('discord.js').TextChannel).send(rendered);
      }
```

Replace with:
```typescript
      } else {
        await sendLong(channel as import('discord.js').TextChannel, rendered);
      }
```

**Step 3: TypeScript check**

```bash
cd /home/plex/wall-e-bot/bot && node_modules/.bin/tsc --noEmit
```

**Step 4: Commit**

```bash
git add bot/src/services/SchedulerService.ts
git commit -m "feat: use sendLong in SchedulerService interval commands"
```

---

### Task 5: Backend — raise response limit to 20,000

**Files:**
- Modify: `dashboard/backend/src/routes/customCommands.ts`

**Step 1: Find and update the schema limit**

Find:
```typescript
  responses: z.array(z.string().min(1).max(2500)).min(1).max(20),
```

Replace with:
```typescript
  responses: z.array(z.string().min(1).max(20000)).min(1).max(20),
```

**Step 2: TypeScript check**

```bash
cd /home/plex/wall-e-bot/dashboard/backend && node_modules/.bin/tsc --noEmit
```

**Step 3: Commit**

```bash
git add dashboard/backend/src/routes/customCommands.ts
git commit -m "feat: raise custom command response limit to 20000 characters"
```

---

### Task 6: Frontend — update counter + add EmbedPreview component

**Files:**
- Modify: `dashboard/frontend/src/pages/guild/CustomCommandsPage.tsx`

**Step 1: Update the character counter**

Find (appears once, inside the response editor section):
```tsx
                <span className={`absolute bottom-1 right-3 text-xs pointer-events-none z-10 ${resp.length >= 2400 ? 'text-red-400' : 'text-discord-light'}`}>
                  {resp.length} / 2500
                </span>
```

Replace with:
```tsx
                <span className={`absolute bottom-1 right-3 text-xs pointer-events-none z-10 ${resp.length >= 19500 ? 'text-red-400' : 'text-discord-light'}`}>
                  {resp.length} / 20000
                </span>
```

**Step 2: Add EmbedPreview component**

Add this component near the other helper components (after the `Toggle` component, before the main `CustomCommandsPage` function):

```tsx
const PREVIEW_PLACEHOLDERS: Record<string, string> = {
  '{{user}}': '@ExampleUser',
  '{{username}}': 'ExampleUser',
  '{{userId}}': '123456789',
  '{{server}}': 'My Server',
  '{{memberCount}}': '42',
  '{{channel}}': '#general',
  '{{channelId}}': '987654321',
  '{{args}}': 'arg1 arg2',
  '{{args.[0]}}': 'arg1',
};

function previewText(template: string): string {
  let result = template;
  for (const [token, value] of Object.entries(PREVIEW_PLACEHOLDERS)) {
    result = result.split(token).join(value);
  }
  // Strip any remaining {{...}} helpers we don't have placeholders for
  result = result.replace(/\{\{[^}]+\}\}/g, '(...)');
  return result;
}

function EmbedPreview({ text, color }: { text: string; color: string | null }) {
  const borderColor = color ?? '#5865F2';
  const preview = previewText(text);
  if (!preview.trim()) return null;
  return (
    <div className="mt-3">
      <p className="text-xs text-discord-light mb-1.5">Embed Preview</p>
      <div
        className="rounded bg-[#2b2d31] px-4 py-3 text-sm text-[#dcddde] whitespace-pre-wrap break-words"
        style={{ borderLeft: `4px solid ${borderColor}` }}
      >
        {preview}
      </div>
    </div>
  );
}
```

**Step 3: Render EmbedPreview below the response editor**

Find the closing of the response type radio section (right after the `</div>` that closes the "Response Type" block):

```tsx
          {/* Response type */}
          <div>
            <label className="block text-sm font-medium mb-2">Response Type</label>
            <div className="flex gap-4">
              {['Plain Text', 'Embed'].map((label, i) => (
                <label key={label} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={i === 0 ? !editingCommand.embed_response : !!editingCommand.embed_response}
                    onChange={() => setEditingCommand(prev => prev ? { ...prev, embed_response: i === 1 } : prev)}
                    className="w-4 h-4" />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
```

Replace with:
```tsx
          {/* Response type */}
          <div>
            <label className="block text-sm font-medium mb-2">Response Type</label>
            <div className="flex gap-4">
              {['Plain Text', 'Embed'].map((label, i) => (
                <label key={label} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={i === 0 ? !editingCommand.embed_response : !!editingCommand.embed_response}
                    onChange={() => setEditingCommand(prev => prev ? { ...prev, embed_response: i === 1 } : prev)}
                    className="w-4 h-4" />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            {editingCommand.embed_response && (
              <EmbedPreview
                text={(editingCommand.responses ?? [''])[0]}
                color={editingCommand.embed_color ?? null}
              />
            )}
          </div>
        </div>
```

**Step 4: TypeScript check**

```bash
cd /home/plex/wall-e-bot/dashboard/frontend && node_modules/.bin/tsc --noEmit
```

**Step 5: Commit**

```bash
git add dashboard/frontend/src/pages/guild/CustomCommandsPage.tsx
git commit -m "feat: raise response counter to 20000 and add live embed preview"
```

---

### Task 7: Push and deploy

**Step 1: Push all commits**

```bash
git push origin main
```

**Step 2: Deploy on VPS**

SSH to 107.174.93.143 (user: root, password: 5Ho7ebArVrXlMA9629) via paramiko and run:

```bash
cd /opt/wall-e-bot && git pull && docker compose -f docker/docker-compose.yml build --no-cache && docker compose -f docker/docker-compose.yml up -d
```

All three containers need rebuilding (bot for sendLong, backend for limit change, frontend for UI).
