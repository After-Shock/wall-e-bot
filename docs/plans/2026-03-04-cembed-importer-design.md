# YAGPDB Embed Importer — Design Document

## Goal

Add a collapsible YAGPDB Embed Importer panel inside the custom commands editor. Users paste their existing YAGPDB `cembed` code and see a live Discord-style embed preview as a visual reference when migrating commands to Wall-E.

## Scope

Frontend only — no backend changes. Single new component + parser function inside `CustomCommandsPage.tsx`.

## Parser

`parseCembed(code: string): EmbedData | null`

Transforms YAGPDB Go-template syntax into a structured JS object using string manipulation:

1. Extract the content between `cembed` and the closing `}}`
2. Transform `(sdict "key" "value" ...)` blocks into `{"key": "value", ...}` JSON objects
3. Transform `(cslice ...)` blocks into `[...]` JSON arrays
4. Quote bare integers and booleans as needed
5. Wrap the result in `{}` and `JSON.parse()` it

Returns `null` on any parse error (no throws).

### EmbedData interface

```typescript
interface EmbedData {
  title?: string;
  description?: string;
  color?: number;
  url?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  author?: { name: string; icon_url?: string; url?: string };
  footer?: { text: string; icon_url?: string };
  thumbnail?: string;
  image?: string;
}
```

## CembedImporter Component

Collapsible section rendered at the bottom of `renderEditor()`, above the Save button.

- **Collapsed state:** shows a "YAGPDB Embed Importer" header with a chevron
- **Expanded state:** textarea for pasting code + live embed preview below
- Textarea updates are debounced (or live — no performance concern at this size)
- Parse errors show a small gray "Could not parse — check syntax" note
- No "import" button — purely visual reference

## Discord Embed Preview

Renders from `EmbedData`:

```
┌────────────────────────────────────────┐
│▌ Author Name (if present)              │  ← author row
│                                        │
│  Title text                            │  ← title (bold link if url set)
│  Description text                      │  ← description
│                                        │
│  ┌─────────────┐  ┌─────────────┐      │  ← inline fields side by side
│  │ Field Name  │  │ Field Name  │      │
│  │ Field value │  │ Field value │      │
│  └─────────────┘  └─────────────┘      │
│  ┌────────────────────────────────┐    │  ← non-inline field full width
│  │ Field Name                     │    │
│  │ Field value                    │    │
│  └────────────────────────────────┘    │
│                                        │
│  Footer text                           │  ← footer
└────────────────────────────────────────┘
```

Left border color = `color` converted from integer to hex (e.g. `3066993` → `#2ecc71`). Falls back to `#5865F2` if no color.

## Files Changed

- `dashboard/frontend/src/pages/guild/CustomCommandsPage.tsx` — add `parseCembed`, `EmbedData` type, `CembedImporter` component, render in `renderEditor()`
