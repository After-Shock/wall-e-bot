# Rich Embed (cembed) Response Type — Design Document

## Goal

Add a "Rich Embed" response type to custom commands. When selected, the cembed importer textarea becomes the primary editor and the bot sends a full Discord embed (title, fields, footer, author, color) when the command fires.

## Scope

- DB: one new column on `custom_commands`
- Bot: cembed parser utility + rich embed send path
- Backend: schema + validation update
- Frontend: 3rd response type option, cembed as primary editor

---

## DB

Add one column:

```sql
ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS cembed_response BOOLEAN DEFAULT FALSE;
```

`embed_response` stays untouched — existing simple-embed commands are unaffected.

---

## Backend (`dashboard/backend/src/routes/customCommands.ts`)

- Add `cembed_response: z.boolean().optional().default(false)` to `CommandSchema`
- Add `cembed_response` to `SELECT_COLS`, INSERT, and UPDATE
- In `validateCommand`: skip Handlebars validation when `cembed_response = true` (cembed syntax is not valid Handlebars)

---

## Shared Types (`shared/src/types/guild.ts`)

Add `cembed_response?: boolean` to `CustomCommand` interface.

---

## Bot

### New file: `bot/src/utils/parseCembed.ts`

Port the `parseCembed` function from the frontend. Returns `EmbedData | null`.

```typescript
interface EmbedField { name: string; value: string; inline?: boolean }
interface EmbedData {
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
export function parseCembed(code: string): EmbedData | null { ... }
```

### Send sites

In `messageCreate.ts`, `reactionAdd.ts`, `reactionRemove.ts`, `SchedulerService.ts`:

When `cmd.cembed_response = true`:
```typescript
import { EmbedBuilder } from 'discord.js';
import { parseCembed } from '../utils/parseCembed.js';

const embedData = parseCembed(rendered);
if (!embedData) {
  await channel.send('⚠️ Failed to parse embed.');
  return;
}
const embed = new EmbedBuilder();
if (embedData.title) embed.setTitle(embedData.title);
if (embedData.description) embed.setDescription(embedData.description);
if (embedData.color != null) embed.setColor(embedData.color);
if (embedData.url) embed.setURL(embedData.url);
if (embedData.author?.name) embed.setAuthor({ name: embedData.author.name, iconURL: embedData.author.icon_url, url: embedData.author.url });
if (embedData.footer?.text) embed.setFooter({ text: embedData.footer.text, iconURL: embedData.footer.icon_url });
if (embedData.fields?.length) embed.addFields(embedData.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline ?? false })));
if (embedData.thumbnail) embed.setThumbnail(embedData.thumbnail);
if (embedData.image) embed.setImage(embedData.image);
await channel.send({ embeds: [embed] });
```

---

## Frontend (`dashboard/frontend/src/pages/guild/CustomCommandsPage.tsx`)

### Response Type radio

Change from 2 options to 3:
- Plain Text
- Embed
- Rich Embed

### When Rich Embed is selected

- Hide the regular response textarea
- Show the cembed textarea (full height, monospace, with live Discord-style embed preview directly below)
- Remove the separate collapsible CembedImporter panel
- Save button disabled if `parseCembed(responses[0])` returns null or `responses[0]` is empty

### State

`editingCommand.cembed_response` drives the display. The raw cembed code is stored in `editingCommand.responses[0]` as usual.

---

## Files Changed

- `dashboard/backend/src/db/migrate.ts` — add `cembed_response` column
- `dashboard/backend/src/routes/customCommands.ts` — schema + validation
- `shared/src/types/guild.ts` — interface update
- `bot/src/utils/parseCembed.ts` — new
- `bot/src/events/messageCreate.ts` — rich embed send path
- `bot/src/events/reactionAdd.ts` — rich embed send path
- `bot/src/events/reactionRemove.ts` — rich embed send path
- `bot/src/services/SchedulerService.ts` — rich embed send path
- `dashboard/frontend/src/pages/guild/CustomCommandsPage.tsx` — UI overhaul
