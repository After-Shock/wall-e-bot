# YAGPDB Embed Importer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a collapsible YAGPDB Embed Importer panel inside the custom commands editor that parses `cembed` syntax and renders a live Discord-style embed preview.

**Architecture:** All frontend, no backend changes. A `parseCembed()` function transforms YAGPDB Go-template syntax into a JS object via string manipulation + JSON.parse. A `CembedImporter` component renders a textarea + live preview. It's inserted in `renderEditor()` between the Behavior section and the Save button.

**Tech Stack:** React 18, TailwindCSS — no new dependencies.

---

### Task 1: Add parseCembed function and CembedImporter component

**Files:**
- Modify: `dashboard/frontend/src/pages/guild/CustomCommandsPage.tsx`

**Step 1: Add the EmbedData type, parseCembed function, and CembedImporter component**

Find the `EmbedPreview` component in the file (around line 245). Add the following code **after** the closing brace of `EmbedPreview` (i.e. after the `}` on the line after `</div>`), before the `// ─── Main Component` comment:

```tsx
// ─── YAGPDB Embed Importer ────────────────────────────────────────────────────

interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

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

function parseCembed(code: string): EmbedData | null {
  try {
    // Extract the body of the cembed call
    const cembedMatch = code.match(/cembed\s+([\s\S]*?)(?:\n\s*\}\}|$)/);
    if (!cembedMatch) return null;
    let body = cembedMatch[1].trim();

    // Replace (sdict "k" "v" ...) with {"k":"v",...}
    // Process innermost first, repeat until no more sdict blocks
    for (let i = 0; i < 20; i++) {
      const before = body;
      body = body.replace(/\(sdict\s+((?:"[^"]*"\s+(?:"[^"]*"|true|false|\d+)\s*)+)\)/g, (_match, inner) => {
        const pairs = inner.trim();
        const jsonObj = pairs.replace(
          /"([^"]+)"\s+("(?:[^"\\]|\\.)*"|true|false|\d+)/g,
          '"$1": $2',
        );
        return `{${jsonObj.split(/,?\s+"/).join(', "').replace(/^\{/, '{')}}`;
      });
      if (body === before) break;
    }

    // Replace (cslice ...) with [...]
    for (let i = 0; i < 10; i++) {
      const before = body;
      body = body.replace(/\(cslice\s+([\s\S]*?)\)/g, (_match, inner) => `[${inner.trim()}]`);
      if (body === before) break;
    }

    // Now body should be: "key" value "key" value ...
    // Convert to JSON object
    // Match "key" followed by a value (string, number, bool, array, object)
    const jsonPairs: string[] = [];
    const pairRegex = /"([^"]+)"\s+("(?:[^"\\]|\\.)*"|\d+|true|false|\[[\s\S]*?\]|\{[\s\S]*?\})/g;
    let m: RegExpExecArray | null;
    while ((m = pairRegex.exec(body)) !== null) {
      jsonPairs.push(`"${m[1]}": ${m[2]}`);
    }

    if (jsonPairs.length === 0) return null;

    const json = `{${jsonPairs.join(', ')}}`;
    const parsed = JSON.parse(json);

    // Normalize fields
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

function intToHex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

function CembedImporter() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const embed = code.trim() ? parseCembed(code) : null;
  const borderColor = embed?.color != null ? intToHex(embed.color) : '#5865F2';

  return (
    <div className="card">
      <button
        className="flex items-center gap-2 w-full text-left"
        onClick={() => setOpen(v => !v)}
      >
        <span className="text-base">📥</span>
        <span className="font-semibold text-sm">YAGPDB Embed Importer</span>
        {open ? <ChevronDown className="w-4 h-4 ml-auto" /> : <ChevronRight className="w-4 h-4 ml-auto" />}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <textarea
            value={code}
            onChange={e => setCode(e.target.value)}
            className="input w-full h-40 resize-y font-mono text-xs"
            placeholder={'{{ $embed := cembed \n  "title" "My Title"\n  "description" "My description"\n  "color" 3066993\n}}'}
          />

          {code.trim() && (
            embed ? (
              <div>
                <p className="text-xs text-discord-light mb-1.5">Preview</p>
                <div
                  className="rounded bg-[#2b2d31] px-4 py-3 text-sm text-[#dcddde] space-y-2"
                  style={{ borderLeft: `4px solid ${borderColor}` }}
                >
                  {embed.author?.name && (
                    <p className="text-xs text-[#b5bac1] font-medium">{embed.author.name}</p>
                  )}
                  {embed.title && (
                    <p className="font-bold text-white">{embed.title}</p>
                  )}
                  {embed.description && (
                    <p className="whitespace-pre-wrap text-[#dbdee1]">{embed.description}</p>
                  )}
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
            ) : (
              <p className="text-xs text-discord-light">Could not parse — check syntax</p>
            )
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Insert CembedImporter into renderEditor()**

Find the `{/* Save actions */}` comment inside `renderEditor()` (around line 703):

```tsx
        {/* Save actions */}
        <div className="space-y-2">
```

Replace with:

```tsx
        {/* YAGPDB Embed Importer */}
        <CembedImporter />

        {/* Save actions */}
        <div className="space-y-2">
```

**Step 3: TypeScript check**

```bash
cd /home/plex/wall-e-bot && node_modules/.bin/tsc --noEmit -p dashboard/frontend/tsconfig.json
```

Expected: no errors. If there are errors about the regex or JSON.parse, they will need fixing.

**Step 4: Commit**

```bash
git add dashboard/frontend/src/pages/guild/CustomCommandsPage.tsx
git commit -m "feat: add YAGPDB cembed importer with live embed preview in command editor"
```

---

### Task 2: Deploy

**Step 1: Push**

```bash
git push origin main
```

**Step 2: Deploy frontend only on VPS**

SSH to 107.174.93.143 (user: root, password: 5Ho7ebArVrXlMA9629) via paramiko and run:

```bash
cd /opt/wall-e-bot && git pull && docker compose -f docker/docker-compose.yml build --no-cache frontend && docker compose -f docker/docker-compose.yml up -d frontend
```

Only the frontend container needs rebuilding.
