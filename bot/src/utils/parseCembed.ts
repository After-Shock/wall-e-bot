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

// String token: quoted string that handles escape sequences (including ) { } [ ] inside quotes)
const STR_TOK = '"(?:[^"\\\\]|\\\\.)*"';
// Bare value token: boolean or number
const BARE_TOK = '(?:true|false|-?\\d+(?:\\.\\d+)?)';
// One sdict KV pair: <ws> "key" <ws> value
const SDICT_KV = `(?:\\s+${STR_TOK}\\s+(?:${STR_TOK}|${BARE_TOK}))`;
// JSON object (string-aware, handles special chars inside strings)
const OBJ_TOK = `\\{(?:[^{}"']|${STR_TOK})*\\}`;
// JSON array (string-aware)
const ARR_TOK = `\\[(?:[^\\[\\]"']|${STR_TOK})*\\]`;

const SDICT_RE = new RegExp(`\\(sdict(${SDICT_KV}+)\\s*\\)`, 'g');
const SDICT_KV_RE = new RegExp(`"([^"]+)"\\s+(${STR_TOK}|${BARE_TOK})`, 'g');
const CSLICE_RE = new RegExp(`\\(cslice((?:\\s*${OBJ_TOK})+)\\s*\\)`, 'g');
const OBJ_RE = new RegExp(OBJ_TOK, 'g');
const PAIR_RE = new RegExp(`"([^"]+)"\\s+(${STR_TOK}|\\d+|true|false|${ARR_TOK}|${OBJ_TOK})`, 'g');

export function parseCembed(code: string): EmbedData | null {
  try {
    const cembedMatch = code.match(/cembed\s+([\s\S]*?)(?:\n\s*\}\}|$)/);
    if (!cembedMatch) return null;
    let body = cembedMatch[1].trim();

    // Replace (sdict "k" v ...) with {"k": v, ...}
    // The explicit KV pattern means ) inside string values never terminates the match early
    body = body.replace(SDICT_RE, (_match, inner) => {
      const kvPairs: string[] = [];
      let kv: RegExpExecArray | null;
      SDICT_KV_RE.lastIndex = 0;
      while ((kv = SDICT_KV_RE.exec(inner)) !== null) {
        kvPairs.push(`"${kv[1]}": ${kv[2]}`);
      }
      return `{${kvPairs.join(', ')}}`;
    });

    // Replace (cslice {...} ...) with [{...}, ...]
    // String-aware object pattern so ) inside string values doesn't end the match early
    body = body.replace(CSLICE_RE, (_match, inner) => {
      const items = inner.trim().match(OBJ_RE) ?? [];
      return `[${items.join(', ')}]`;
    });

    // Extract top-level key-value pairs
    // String-aware array/object patterns so ] or } inside string values don't terminate early
    const jsonPairs: string[] = [];
    let m: RegExpExecArray | null;
    PAIR_RE.lastIndex = 0;
    while ((m = PAIR_RE.exec(body)) !== null) {
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
