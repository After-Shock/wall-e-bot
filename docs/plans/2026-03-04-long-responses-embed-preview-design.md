# Long Responses + Embed Preview — Design Document

## Goal

Two enhancements to custom commands: (1) raise the response character limit to 20,000 and split long responses into multiple Discord messages seamlessly, (2) show a live Discord-style embed preview in the command editor when "Embed" response type is selected.

---

## Feature 1: Long Response Splitting

### Limit

Raise from 2,500 → 20,000 characters everywhere:
- Backend: `responses` array item max in `CommandSchema` zod schema
- Frontend: character counter threshold (red at ≥19,500, max shown as 20,000)

### Bot — `sendLong` helper

New file `bot/src/utils/sendLong.ts` exports a single function:

```typescript
export async function sendLong(
  channel: import('discord.js').TextBasedChannel & { send: Function },
  text: string,
): Promise<void>
```

Splitting algorithm (chunks of ≤2000 chars):
1. If `text.length <= 2000` — single `channel.send(text)`
2. Otherwise slice from position 0, find last `\n` before 2000; if none, last ` `; if none, hard-cut at 2000
3. Send chunk, advance position, repeat

Embeds are NOT split — Discord embed descriptions cap at 4096 chars. The UI will show a note: "Embed responses are capped at 4096 characters." Bot truncates embed description to 4096 if over.

### Files changed (bot)

- `bot/src/utils/sendLong.ts` — new
- `bot/src/events/messageCreate.ts` — replace `channel.send(rendered)` with `sendLong`
- `bot/src/events/reactionAdd.ts` — same
- `bot/src/events/reactionRemove.ts` — same
- `bot/src/services/SchedulerService.ts` — same

### Files changed (backend + frontend)

- `dashboard/backend/src/routes/customCommands.ts` — raise `z.string().max(2500)` → `max(20000)`
- `dashboard/frontend/src/pages/guild/CustomCommandsPage.tsx` — counter: `20000`, red threshold: `>= 19500`, embed note

---

## Feature 2: Embed Preview

### Behaviour

When `embed_response === true` in the command editor, a preview card renders below the response text area. It updates live as the user types. Handlebars placeholders are replaced with static sample values for display purposes only.

### Placeholder substitutions for preview

| Template | Preview value |
|---|---|
| `{{user}}` | `@ExampleUser` |
| `{{username}}` | `ExampleUser` |
| `{{userId}}` | `123456789` |
| `{{server}}` | `My Server` |
| `{{memberCount}}` | `42` |
| `{{channel}}` | `#general` |
| `{{channelId}}` | `987654321` |
| `{{args}}` | `arg1 arg2` |
| `{{args.[0]}}` | `arg1` |
| Any other `{{...}}` | *(left as-is or stripped)* |

### Visual design

```
┌─────────────────────────────────────────────┐
│ ▌  Embed Preview                            │  ← section label
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │▌ (colored left border)               │   │  ← border color = embed_color or #5865F2
│  │                                      │   │
│  │  Response text rendered here         │   │
│  │  with placeholder values filled in   │   │
│  │                                      │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

Implemented as a small `EmbedPreview` component in `CustomCommandsPage.tsx`. No new dependencies — pure CSS + React.

### Files changed

- `dashboard/frontend/src/pages/guild/CustomCommandsPage.tsx` — add `EmbedPreview` component, render it in the responses section when `embed_response` is true

---

## Tech Stack

Existing only — no new dependencies.
