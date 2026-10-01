import { useState } from 'react';

export interface ServerEmoji {
  id: string;
  name: string;
  animated: boolean;
  value: string; // <:name:id> or <a:name:id>
}

// Custom emoji arrive as <:name:id> / <a:name:id>; render them from the CDN so
// the preview matches what Discord will actually show.
const CUSTOM_EMOJI = /^<(a?):([\w~]+):(\d{17,20})>$/;

const emojiUrl = (id: string, animated: boolean) =>
  `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=32`;

export function EmojiPreview({ emoji }: { emoji: string }) {
  const custom = CUSTOM_EMOJI.exec(emoji.trim());
  if (!custom) return <span>{emoji}</span>;
  return <img src={emojiUrl(custom[3], !!custom[1])} alt={`:${custom[2]}:`} className="w-5 h-5 inline-block" />;
}

const STANDARD = ['🎫', '📋', '📺', '🎬', '📡', '🛠️', '❓', '💬', '💳', '💰', '🔄', '➕', '🆕', '⭐', '✅', '⚠️', '🔒', '📦', '🎮', '🎵', '📚', '🌺', '🍆', '👹'];

export function EmojiPicker({ value, onChange, serverEmojis, fallback = '🎫' }: {
  value: string;
  onChange: (emoji: string) => void;
  serverEmojis: ServerEmoji[];
  fallback?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');

  const pick = (emoji: string) => {
    onChange(emoji);
    setOpen(false);
    setTyped('');
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="input w-full flex items-center gap-2 text-left"
        aria-label="Choose emoji"
        aria-expanded={open}
      >
        <EmojiPreview emoji={value || fallback} />
        <span className="text-xs text-discord-light">{value ? 'Change' : 'Choose emoji'}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute z-50 mt-1 w-72 max-w-[calc(100vw-2rem)] card p-3 space-y-3 shadow-lg"
            onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
          >
            {serverEmojis.length > 0 && (
              <div>
                <p className="text-xs text-discord-light mb-1">Server emojis</p>
                <div className="grid grid-cols-8 gap-1 max-h-40 overflow-y-auto">
                  {serverEmojis.map(e => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => pick(e.value)}
                      className="p-1 rounded hover:bg-discord-mid"
                      title={`:${e.name}:`}
                      aria-label={`:${e.name}:`}
                    >
                      <img src={emojiUrl(e.id, e.animated)} alt="" className="w-6 h-6" loading="lazy" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="text-xs text-discord-light mb-1">Standard</p>
              <div className="grid grid-cols-8 gap-1">
                {STANDARD.map(e => (
                  <button key={e} type="button" onClick={() => pick(e)} className="p-1 rounded hover:bg-discord-mid text-lg">
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <input
                value={typed}
                onChange={e => setTyped(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && typed.trim()) pick(typed.trim()); }}
                maxLength={100}
                className="input flex-1 text-xs"
                placeholder="Any emoji (Win + . to browse)"
                aria-label="Type or paste an emoji"
              />
              <button
                type="button"
                onClick={() => typed.trim() && pick(typed.trim())}
                disabled={!typed.trim()}
                className="btn btn-primary text-xs"
              >
                Use
              </button>
            </div>
            {value && (
              <button type="button" onClick={() => pick('')} className="text-xs text-discord-light hover:text-red-400">
                Remove emoji
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
