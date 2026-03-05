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
