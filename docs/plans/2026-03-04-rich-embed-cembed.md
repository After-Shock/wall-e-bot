# Rich Embed (cembed) Response Type Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Rich Embed" third response type so users can paste YAGPDB cembed syntax directly into the command editor, see a live preview, save it, and have the bot send a full Discord embed (title, fields, footer, author, color) when the command fires.

**Architecture:** Add `cembed_response BOOLEAN` column to DB. Backend skips Handlebars validation for cembed commands. Bot ports the `parseCembed` parser from the frontend and builds a real `EmbedBuilder` at send time. Frontend replaces the two-option radio with three options; when "Rich Embed" is selected the response textarea is hidden and the cembed textarea becomes the primary editor.

**Tech Stack:** TypeScript, discord.js 14 EmbedBuilder, React 18, TailwindCSS, PostgreSQL, Zod.

---

### Task 1: DB migration — add cembed_response column

**Files:**
- Modify: `dashboard/backend/src/db/migrate.ts`

**Step 1: Add the ALTER TABLE statement**

Find the last `ALTER TABLE custom_commands` block (around line 377) and add one line after it:

```sql
ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS cembed_response BOOLEAN DEFAULT FALSE;
```

**Step 2: TypeScript check**

```bash
cd /home/plex/wall-e-bot && node_modules/.bin/tsc --noEmit -p dashboard/backend/tsconfig.json
```

Expected: no errors.

**Step 3: Commit**

```bash
git add dashboard/backend/src/db/migrate.ts
git commit -m "feat: add cembed_response column to custom_commands"
```

---

### Task 2: Backend — schema + validation + SELECT_COLS

**Files:**
- Modify: `dashboard/backend/src/routes/customCommands.ts`

**Step 1: Add cembed_response to CommandSchema**

In `CommandSchema` (around line 22), after `embed_response: z.boolean().default(false),` add:

```typescript
  cembed_response: z.boolean().default(false),
```

**Step 2: Update SELECT_COLS**

Find (around line 62):
```typescript
  embed_response, embed_color, cooldown, delete_command,
```

Replace with:
```typescript
  embed_response, cembed_response, embed_color, cooldown, delete_command,
```

**Step 3: Skip Handlebars validation for cembed_response**

Find (around line 47):
```typescript
  // Validate Handlebars templates
  for (const response of data.responses) {
    try { Handlebars.precompile(response); } catch (e: unknown) {
      return `Invalid template syntax: ${(e as Error).message}`;
    }
  }
```

Replace with:
```typescript
  // Validate Handlebars templates (skip for cembed — Go template syntax, not Handlebars)
  if (!data.cembed_response) {
    for (const response of data.responses) {
      try { Handlebars.precompile(response); } catch (e: unknown) {
        return `Invalid template syntax: ${(e as Error).message}`;
      }
    }
  }
```

**Step 4: Add cembed_response to INSERT**

Find the INSERT column list (around line 104):
```typescript
    `INSERT INTO custom_commands
       (guild_id, name, trigger_type, group_id, responses, response,
        embed_response, embed_color, cooldown, delete_command,
```

Replace with:
```typescript
    `INSERT INTO custom_commands
       (guild_id, name, trigger_type, group_id, responses, response,
        embed_response, cembed_response, embed_color, cooldown, delete_command,
```

Find the VALUES placeholder line:
```typescript
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
```

Replace with (shift all after embed_response by 1):
```typescript
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
```

Find the values array (around line 114):
```typescript
      guildId, d.name, d.trigger_type, d.group_id ?? null,
      JSON.stringify(d.responses), d.responses[0], // keep response col in sync
      d.embed_response, d.embed_color ?? null, d.cooldown, d.delete_command,
```

Replace with:
```typescript
      guildId, d.name, d.trigger_type, d.group_id ?? null,
      JSON.stringify(d.responses), d.responses[0], // keep response col in sync
      d.embed_response, d.cembed_response, d.embed_color ?? null, d.cooldown, d.delete_command,
```

**Step 5: TypeScript check**

```bash
cd /home/plex/wall-e-bot && node_modules/.bin/tsc --noEmit -p dashboard/backend/tsconfig.json
```

Expected: no errors.

**Step 6: Commit**

```bash
git add dashboard/backend/src/routes/customCommands.ts
git commit -m "feat: add cembed_response to backend schema, SELECT_COLS, INSERT, skip Handlebars validation"
```

---

### Task 3: Shared types

**Files:**
- Modify: `shared/src/types/guild.ts`

**Step 1: Add cembed_response to CustomCommand interface**

Find (around line 231):
```typescript
  embedResponse: boolean;
```

Add after it:
```typescript
  cembedResponse: boolean;
```

**Step 2: TypeScript check**

```bash
cd /home/plex/wall-e-bot && node_modules/.bin/tsc --noEmit -p shared/tsconfig.json
```

Expected: no errors.

**Step 3: Commit**

```bash
git add shared/src/types/guild.ts
git commit -m "feat: add cembedResponse to CustomCommand shared type"
```

---

### Task 4: Bot — parseCembed utility

**Files:**
- Create: `bot/src/utils/parseCembed.ts`

**Step 1: Create the file**

This is a TypeScript port of the parseCembed function currently in `dashboard/frontend/src/pages/guild/CustomCommandsPage.tsx` (around lines 264–335).

```typescript
export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface EmbedData {
  title?: string;
  description?: string;
  color?: number;
  url?: string;
  fields?: EmbedField[];
  author?: { name: string; icon_url?: string; url?: string };
  footer?: { text: string; icon_url?: string };
  thumbnail?: string;
  image?: string;
}

export function parseCembed(code: string): EmbedData | null {
  try {
    const cembedMatch = code.match(/cembed\s+([\s\S]*?)(?:\n\s*\}\}|$)/);
    if (!cembedMatch) return null;
    let body = cembedMatch[1].trim();

    // Replace (sdict "k" "v" ...) with {"k":"v",...} — innermost first
    for (let i = 0; i < 20; i++) {
      const before = body;
      body = body.replace(/\(sdict\s+([\s\S]*?)\)/g, (_match, inner) => {
        const kvPairs: string[] = [];
        const kvRe = /"([^"]+)"\s+("(?:[^"\\]|\\.)*"|true|false|-?\d+(?:\.\d+)?)/g;
        let kv: RegExpExecArray | null;
        while ((kv = kvRe.exec(inner)) !== null) {
          kvPairs.push(`"${kv[1]}": ${kv[2]}`);
        }
        return `{${kvPairs.join(', ')}}`;
      });
      if (body === before) break;
    }

    // Replace (cslice ...) with [...] adding commas between objects
    for (let i = 0; i < 10; i++) {
      const before = body;
      body = body.replace(/\(cslice\s+([\s\S]*?)\)/g, (_match, inner) =>
        `[${inner.trim().replace(/\}\s+\{/g, '}, {')}]`,
      );
      if (body === before) break;
    }

    // Extract top-level key-value pairs
    const jsonPairs: string[] = [];
    const pairRegex = /"([^"]+)"\s+("(?:[^"\\]|\\.)*"|\d+|true|false|\[[\s\S]*?\]|\{[\s\S]*?\})/g;
    let m: RegExpExecArray | null;
    while ((m = pairRegex.exec(body)) !== null) {
      jsonPairs.push(`"${m[1]}": ${m[2]}`);
    }

    if (jsonPairs.length === 0) return null;

    const parsed = JSON.parse(`{${jsonPairs.join(', ')}}`);

    if (parsed.fields && Array.isArray(parsed.fields)) {
      parsed.fields = parsed.fields.map((f: Record<string, unknown>) => ({
        name: String(f.name ?? ''),
        value: String(f.value ?? ''),
        inline: Boolean(f.inline ?? false),
      }));
    }

    return parsed as EmbedData;
  } catch {
    return null;
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
git add bot/src/utils/parseCembed.ts
git commit -m "feat: add parseCembed utility to bot"
```

---

### Task 5: Bot — messageCreate.ts rich embed send path

**Files:**
- Modify: `bot/src/events/messageCreate.ts`

**Step 1: Add parseCembed import**

At the top of the file, after the existing imports, add:

```typescript
import { parseCembed } from '../utils/parseCembed.js';
```

**Step 2: Add cembed_response to the SELECT query**

Find (around line 16):
```typescript
    `SELECT id, name, trigger_type, responses, embed_response, embed_color,
            delete_command, case_sensitive, allowed_roles, allowed_channels
```

Replace with:
```typescript
    `SELECT id, name, trigger_type, responses, embed_response, cembed_response, embed_color,
            delete_command, case_sensitive, allowed_roles, allowed_channels
```

**Step 3: Add cembed_response send path**

Find (around line 95):
```typescript
    if (cmd.embed_response) {
      const { EmbedBuilder } = await import('discord.js');
      const embed = new EmbedBuilder()
        .setDescription(rendered)
        .setColor((cmd.embed_color ?? '#5865F2') as `#${string}`);
      await channel.send({ embeds: [embed] });
    } else {
      await sendLong(channel, rendered);
    }
```

Replace with:
```typescript
    if (cmd.cembed_response) {
      const embedData = parseCembed(rendered);
      if (!embedData) {
        await channel.send('⚠️ Failed to parse embed.');
      } else {
        const { EmbedBuilder } = await import('discord.js');
        const embed = new EmbedBuilder();
        if (embedData.title) embed.setTitle(embedData.title);
        if (embedData.description) embed.setDescription(embedData.description);
        if (embedData.color != null) embed.setColor(embedData.color);
        if (embedData.url) embed.setURL(embedData.url);
        if (embedData.author?.name) embed.setAuthor({ name: embedData.author.name, iconURL: embedData.author.icon_url, url: embedData.author.url });
        if (embedData.footer?.text) embed.setFooter({ text: embedData.footer.text, iconURL: embedData.footer.icon_url });
        if (embedData.thumbnail) embed.setThumbnail(embedData.thumbnail);
        if (embedData.image) embed.setImage(embedData.image);
        if (embedData.fields?.length) embed.addFields(embedData.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline ?? false })));
        await channel.send({ embeds: [embed] });
      }
    } else if (cmd.embed_response) {
      const { EmbedBuilder } = await import('discord.js');
      const embed = new EmbedBuilder()
        .setDescription(rendered)
        .setColor((cmd.embed_color ?? '#5865F2') as `#${string}`);
      await channel.send({ embeds: [embed] });
    } else {
      await sendLong(channel, rendered);
    }
```

**Step 4: TypeScript check**

```bash
cd /home/plex/wall-e-bot/bot && node_modules/.bin/tsc --noEmit
```

**Step 5: Commit**

```bash
git add bot/src/events/messageCreate.ts
git commit -m "feat: add cembed_response rich embed send path to messageCreate"
```

---

### Task 6: Bot — reactionAdd.ts and reactionRemove.ts rich embed send path

**Files:**
- Modify: `bot/src/events/reactionAdd.ts`
- Modify: `bot/src/events/reactionRemove.ts`

**Step 1: Add parseCembed import to reactionAdd.ts**

After existing imports add:
```typescript
import { parseCembed } from '../utils/parseCembed.js';
```

**Step 2: Add cembed_response to SELECT in reactionAdd.ts**

Find (around line 49):
```typescript
    `SELECT id, responses, embed_response, embed_color, reaction_type
```

Replace with:
```typescript
    `SELECT id, responses, embed_response, cembed_response, embed_color, reaction_type
```

**Step 3: Add cembed_response send path in reactionAdd.ts**

Find (around line 80):
```typescript
      if (cmd.embed_response) {
        const { EmbedBuilder } = await import('discord.js');
        const embed = new EmbedBuilder()
          .setDescription(rendered)
          .setColor((cmd.embed_color ?? '#5865F2') as `#${string}`);
        await (channel as import('discord.js').TextChannel).send({ embeds: [embed] });
      } else {
        await sendLong(channel as import('discord.js').TextChannel, rendered);
      }
```

Replace with:
```typescript
      if (cmd.cembed_response) {
        const embedData = parseCembed(rendered);
        if (!embedData) {
          await (channel as import('discord.js').TextChannel).send('⚠️ Failed to parse embed.');
        } else {
          const { EmbedBuilder } = await import('discord.js');
          const embed = new EmbedBuilder();
          if (embedData.title) embed.setTitle(embedData.title);
          if (embedData.description) embed.setDescription(embedData.description);
          if (embedData.color != null) embed.setColor(embedData.color);
          if (embedData.url) embed.setURL(embedData.url);
          if (embedData.author?.name) embed.setAuthor({ name: embedData.author.name, iconURL: embedData.author.icon_url, url: embedData.author.url });
          if (embedData.footer?.text) embed.setFooter({ text: embedData.footer.text, iconURL: embedData.footer.icon_url });
          if (embedData.thumbnail) embed.setThumbnail(embedData.thumbnail);
          if (embedData.image) embed.setImage(embedData.image);
          if (embedData.fields?.length) embed.addFields(embedData.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline ?? false })));
          await (channel as import('discord.js').TextChannel).send({ embeds: [embed] });
        }
      } else if (cmd.embed_response) {
        const { EmbedBuilder } = await import('discord.js');
        const embed = new EmbedBuilder()
          .setDescription(rendered)
          .setColor((cmd.embed_color ?? '#5865F2') as `#${string}`);
        await (channel as import('discord.js').TextChannel).send({ embeds: [embed] });
      } else {
        await sendLong(channel as import('discord.js').TextChannel, rendered);
      }
```

**Step 4: Repeat Steps 1–3 for reactionRemove.ts** — same imports, same SELECT change, same send path replacement.

**Step 5: TypeScript check**

```bash
cd /home/plex/wall-e-bot/bot && node_modules/.bin/tsc --noEmit
```

**Step 6: Commit**

```bash
git add bot/src/events/reactionAdd.ts bot/src/events/reactionRemove.ts
git commit -m "feat: add cembed_response rich embed send path to reaction handlers"
```

---

### Task 7: Bot — SchedulerService.ts rich embed send path

**Files:**
- Modify: `bot/src/services/SchedulerService.ts`

**Step 1: Add parseCembed import**

After existing imports add:
```typescript
import { parseCembed } from '../utils/parseCembed.js';
```

**Step 2: Add cembed_response to the interval command SELECT query**

Find (around line 310):
```typescript
        `SELECT id, guild_id, name, responses, embed_response, embed_color,
                interval_cron, interval_channel_id, case_sensitive
```

Replace with:
```typescript
        `SELECT id, guild_id, name, responses, embed_response, cembed_response, embed_color,
                interval_cron, interval_channel_id, case_sensitive
```

**Step 3: Add cembed_response to the fireIntervalCommand type annotation**

Find (around line 330):
```typescript
    embed_response: boolean;
    embed_color: string | null;
```

Add after:
```typescript
    cembed_response: boolean;
```

**Step 4: Add cembed_response send path in fireIntervalCommand**

Find (around line 358):
```typescript
      if (cmd.embed_response) {
        const { EmbedBuilder } = await import('discord.js');
        const embed = new EmbedBuilder()
          .setDescription(rendered)
          .setColor((cmd.embed_color ?? '#5865F2') as `#${string}`);
        await (channel as import('discord.js').TextChannel).send({ embeds: [embed] });
      } else {
        await sendLong(channel as import('discord.js').TextChannel, rendered);
      }
```

Replace with:
```typescript
      if (cmd.cembed_response) {
        const embedData = parseCembed(rendered);
        if (!embedData) {
          await (channel as import('discord.js').TextChannel).send('⚠️ Failed to parse embed.');
        } else {
          const { EmbedBuilder } = await import('discord.js');
          const embed = new EmbedBuilder();
          if (embedData.title) embed.setTitle(embedData.title);
          if (embedData.description) embed.setDescription(embedData.description);
          if (embedData.color != null) embed.setColor(embedData.color);
          if (embedData.url) embed.setURL(embedData.url);
          if (embedData.author?.name) embed.setAuthor({ name: embedData.author.name, iconURL: embedData.author.icon_url, url: embedData.author.url });
          if (embedData.footer?.text) embed.setFooter({ text: embedData.footer.text, iconURL: embedData.footer.icon_url });
          if (embedData.thumbnail) embed.setThumbnail(embedData.thumbnail);
          if (embedData.image) embed.setImage(embedData.image);
          if (embedData.fields?.length) embed.addFields(embedData.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline ?? false })));
          await (channel as import('discord.js').TextChannel).send({ embeds: [embed] });
        }
      } else if (cmd.embed_response) {
        const { EmbedBuilder } = await import('discord.js');
        const embed = new EmbedBuilder()
          .setDescription(rendered)
          .setColor((cmd.embed_color ?? '#5865F2') as `#${string}`);
        await (channel as import('discord.js').TextChannel).send({ embeds: [embed] });
      } else {
        await sendLong(channel as import('discord.js').TextChannel, rendered);
      }
```

**Step 5: TypeScript check**

```bash
cd /home/plex/wall-e-bot/bot && node_modules/.bin/tsc --noEmit
```

**Step 6: Commit**

```bash
git add bot/src/services/SchedulerService.ts
git commit -m "feat: add cembed_response rich embed send path to SchedulerService"
```

---

### Task 8: Frontend — Rich Embed response type UI

**Files:**
- Modify: `dashboard/frontend/src/pages/guild/CustomCommandsPage.tsx`

**Context:** The file has a `COMMAND_DEFAULTS` object (around line 60) with `embed_response: false`. The response type radio is around line 778. The `CembedImporter` component (around line 343) is a self-contained collapsible panel rendered at line 855. `parseCembed` is already defined in this file. The save button disabled check is on line 863.

**Step 1: Add cembed_response to COMMAND_DEFAULTS**

Find (around line 60):
```typescript
  embed_response: false,
```

Add after:
```typescript
  cembed_response: false,
```

**Step 2: Remove the standalone CembedImporter component (lines ~343–400)**

The `CembedImporter` function is no longer needed as a standalone component — its functionality moves inline into the response type section. Delete the entire `function CembedImporter() { ... }` block.

**Step 3: Replace the Response Type section**

Find (lines ~776–795):
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
```

Replace with:
```tsx
          {/* Response type */}
          <div>
            <label className="block text-sm font-medium mb-2">Response Type</label>
            <div className="flex gap-4 flex-wrap">
              {(['Plain Text', 'Embed', 'Rich Embed'] as const).map((label) => {
                const isChecked =
                  label === 'Rich Embed' ? !!editingCommand.cembed_response :
                  label === 'Embed' ? (!!editingCommand.embed_response && !editingCommand.cembed_response) :
                  (!editingCommand.embed_response && !editingCommand.cembed_response);
                return (
                  <label key={label} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={isChecked}
                      onChange={() => setEditingCommand(prev => prev ? {
                        ...prev,
                        embed_response: label === 'Embed',
                        cembed_response: label === 'Rich Embed',
                      } : prev)}
                      className="w-4 h-4"
                    />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>
            {editingCommand.embed_response && !editingCommand.cembed_response && (
              <EmbedPreview
                text={(editingCommand.responses ?? [''])[0]}
                color={editingCommand.embed_color ?? null}
              />
            )}
          </div>
```

**Step 4: Replace the Responses section to show cembed editor when Rich Embed is selected**

Find (around line 730):
```tsx
        {/* Responses */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">
              Responses
              {(editingCommand.responses?.length ?? 0) > 1 && (
                <span className="ml-2 text-xs text-discord-light font-normal">(picked randomly)</span>
              )}
            </h3>
            <button onClick={addResponse} className="btn btn-secondary text-xs flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Response
            </button>
          </div>

          {(editingCommand.responses ?? ['']).map((resp, idx) => (
```

Replace the entire Responses card (lines ~730–796) with:

```tsx
        {/* Responses */}
        <div className="card space-y-3">
          {editingCommand.cembed_response ? (
            <>
              <h3 className="font-semibold">Rich Embed (cembed)</h3>
              <div className="relative">
                <textarea
                  value={(editingCommand.responses ?? [''])[0]}
                  onChange={e => setEditingCommand(prev => prev ? { ...prev, responses: [e.target.value] } : prev)}
                  className="input w-full h-48 resize-y font-mono text-xs"
                  placeholder={'{{ $embed := cembed \n  "title" "My Title"\n  "description" "Hello!"\n  "color" 3066993\n}}'}
                />
                <span className={`absolute bottom-1 right-3 text-xs pointer-events-none z-10 ${((editingCommand.responses ?? [''])[0].length) >= 19500 ? 'text-red-400' : 'text-discord-light'}`}>
                  {(editingCommand.responses ?? [''])[0].length} / 20000
                </span>
              </div>
              {(() => {
                const raw = (editingCommand.responses ?? [''])[0];
                if (!raw.trim()) return null;
                const embed = parseCembed(raw);
                if (!embed) return <p className="text-xs text-discord-light">Could not parse — check syntax</p>;
                const borderColor = embed.color != null ? '#' + embed.color.toString(16).padStart(6, '0') : '#5865F2';
                return (
                  <div>
                    <p className="text-xs text-discord-light mb-1.5">Preview</p>
                    <div
                      className="rounded bg-[#2b2d31] px-4 py-3 text-sm text-[#dcddde] space-y-2"
                      style={{ borderLeft: `4px solid ${borderColor}` }}
                    >
                      {embed.author?.name && <p className="text-xs text-[#b5bac1] font-medium">{embed.author.name}</p>}
                      {embed.title && <p className="font-bold text-white">{embed.title}</p>}
                      {embed.description && <p className="whitespace-pre-wrap text-[#dbdee1]">{embed.description}</p>}
                      {embed.fields && embed.fields.length > 0 && (
                        <div className="grid gap-2" style={{
                          gridTemplateColumns: embed.fields.every(f => f.inline) ? 'repeat(2, 1fr)' : '1fr',
                        }}>
                          {embed.fields.map((field, i) => (
                            <div key={i} className={field.inline ? '' : 'col-span-full'}>
                              <p className="text-xs font-semibold text-white">{field.name}</p>
                              <p className="text-xs text-[#dbdee1] whitespace-pre-wrap">{field.value}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {embed.footer?.text && (
                        <p className="text-xs text-[#b5bac1] pt-1 border-t border-[#3f4147]">{embed.footer.text}</p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">
                  Responses
                  {(editingCommand.responses?.length ?? 0) > 1 && (
                    <span className="ml-2 text-xs text-discord-light font-normal">(picked randomly)</span>
                  )}
                </h3>
                <button onClick={addResponse} className="btn btn-secondary text-xs flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add Response
                </button>
              </div>

              {(editingCommand.responses ?? ['']).map((resp, idx) => (
                <div key={idx} className="space-y-1">
                  {(editingCommand.responses?.length ?? 0) > 1 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-discord-light">Response {idx + 1}</span>
                      <button onClick={() => removeResponse(idx)} className="text-red-400 hover:text-red-300">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  <div className="relative">
                    {isMobile ? (
                      <textarea
                        value={resp}
                        onChange={e => updateResponse(idx, e.target.value)}
                        className="input w-full h-32 resize-y font-mono text-sm pb-6"
                        placeholder="Response text… use {{user}} for mentions"
                      />
                    ) : (
                      <CodeMirrorEditor
                        ref={el => { editorRefs.current[idx] = el; }}
                        value={resp}
                        onChange={v => updateResponse(idx, v)}
                      />
                    )}
                    <span className={`absolute bottom-1 right-3 text-xs pointer-events-none z-10 ${resp.length >= 19500 ? 'text-red-400' : 'text-discord-light'}`}>
                      {resp.length} / 20000
                    </span>
                  </div>
                </div>
              ))}

              {/* Response type */}
              <div>
                <label className="block text-sm font-medium mb-2">Response Type</label>
                <div className="flex gap-4 flex-wrap">
                  {(['Plain Text', 'Embed', 'Rich Embed'] as const).map((label) => {
                    const isChecked =
                      label === 'Rich Embed' ? !!editingCommand.cembed_response :
                      label === 'Embed' ? (!!editingCommand.embed_response && !editingCommand.cembed_response) :
                      (!editingCommand.embed_response && !editingCommand.cembed_response);
                    return (
                      <label key={label} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={isChecked}
                          onChange={() => setEditingCommand(prev => prev ? {
                            ...prev,
                            embed_response: label === 'Embed',
                            cembed_response: label === 'Rich Embed',
                          } : prev)}
                          className="w-4 h-4"
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>
                {editingCommand.embed_response && !editingCommand.cembed_response && (
                  <EmbedPreview
                    text={(editingCommand.responses ?? [''])[0]}
                    color={editingCommand.embed_color ?? null}
                  />
                )}
              </div>
            </>
          )}
        </div>
```

**Step 5: Remove the old CembedImporter panel render call**

Find (around line 854):
```tsx
        {/* YAGPDB Embed Importer */}
        <CembedImporter />

```

Delete those two lines.

**Step 6: Update the Save button disabled condition**

Find (around line 863):
```typescript
              disabled={!editingCommand.name || !(editingCommand.responses?.some(r => r.trim())) || isSaving}
```

Replace with:
```typescript
              disabled={!editingCommand.name || (editingCommand.cembed_response ? !parseCembed((editingCommand.responses ?? [''])[0] ?? '') : !(editingCommand.responses?.some(r => r.trim()))) || isSaving}
```

**Step 7: TypeScript check**

```bash
cd /home/plex/wall-e-bot && node_modules/.bin/tsc --noEmit -p dashboard/frontend/tsconfig.json
```

Expected: no errors.

**Step 8: Commit**

```bash
git add dashboard/frontend/src/pages/guild/CustomCommandsPage.tsx
git commit -m "feat: add Rich Embed response type with inline cembed editor and live preview"
```

---

### Task 9: Deploy

**Step 1: Push**

```bash
git push origin main
```

**Step 2: Deploy on VPS**

SSH to 107.174.93.143 (user: root, password: 5Ho7ebArVrXlMA9629) via paramiko and run:

```bash
cd /opt/wall-e-bot && git pull && docker compose -f docker/docker-compose.yml build --no-cache && docker compose -f docker/docker-compose.yml up -d && docker compose -f docker/docker-compose.yml exec backend node dist/db/migrate.js
```

All three containers need rebuilding (bot for parseCembed, backend for cembed_response schema, frontend for UI).
