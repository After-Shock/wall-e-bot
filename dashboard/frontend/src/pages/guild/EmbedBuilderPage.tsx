import { useState } from 'react';
import { Layout, Save, Copy, Hash, Image, Plus, Trash2 } from 'lucide-react';

interface EmbedField {
  name: string;
  value: string;
  inline: boolean;
}

interface Embed {
  title: string;
  description: string;
  color: string;
  url: string;
  thumbnail: string;
  image: string;
  authorName: string;
  authorIcon: string;
  footerText: string;
  footerIcon: string;
  fields: EmbedField[];
}

export default function EmbedBuilderPage() {
  const [embed, setEmbed] = useState<Embed>({
    title: 'Welcome to our Server!',
    description: 'We are glad to have you here. Please read the rules and enjoy your stay!',
    color: '#5865F2',
    url: '',
    thumbnail: '',
    image: '',
    authorName: '',
    authorIcon: '',
    footerText: 'Server Bot',
    footerIcon: '',
    fields: [
      { name: '📜 Rules', value: 'Read #rules', inline: true },
      { name: '🎭 Roles', value: 'Get roles in #roles', inline: true },
    ],
  });

  const [targetChannel, setTargetChannel] = useState('');

  const updateEmbed = (updates: Partial<Embed>) => {
    setEmbed(prev => ({ ...prev, ...updates }));
  };

  const addField = () => {
    setEmbed(prev => ({
      ...prev,
      fields: [...prev.fields, { name: 'Field Name', value: 'Field Value', inline: false }],
    }));
  };

  const updateField = (index: number, updates: Partial<EmbedField>) => {
    setEmbed(prev => ({
      ...prev,
      fields: prev.fields.map((f, i) => i === index ? { ...f, ...updates } : f),
    }));
  };

  const removeField = (index: number) => {
    setEmbed(prev => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index),
    }));
  };

  const copyJson = () => {
    const json = JSON.stringify(embed, null, 2);
    navigator.clipboard.writeText(json);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layout className="w-8 h-8 text-discord-blurple" />
          <div>
            <h1 className="text-2xl font-bold">Embed Builder</h1>
            <p className="text-discord-light">Create custom embeds with live preview</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={copyJson} className="btn btn-secondary flex items-center gap-2">
            <Copy className="w-4 h-4" />
            Copy JSON
          </button>
          <button className="btn btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" />
            Send Embed
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Editor */}
        <div className="space-y-4">
          {/* Target Channel */}
          <div className="card">
            <label className="block text-sm font-medium mb-2">Send to Channel</label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-discord-light" />
              <select
                value={targetChannel}
                onChange={e => setTargetChannel(e.target.value)}
                className="input w-full pl-9"
              >
                <option value="">Select channel...</option>
                <option value="general">general</option>
                <option value="announcements">announcements</option>
                <option value="welcome">welcome</option>
              </select>
            </div>
          </div>

          {/* Basic Info */}
          <div className="card space-y-4">
            <h3 className="font-semibold">Basic Info</h3>
            <div>
              <label className="block text-sm font-medium mb-2">Title</label>
              <input
                type="text"
                value={embed.title}
                onChange={e => updateEmbed({ title: e.target.value })}
                className="input w-full"
                placeholder="Embed title"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <textarea
                value={embed.description}
                onChange={e => updateEmbed({ description: e.target.value })}
                className="input w-full h-24 resize-none"
                placeholder="Embed description (supports markdown)"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={embed.color}
                    onChange={e => updateEmbed({ color: e.target.value })}
                    className="w-10 h-10 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={embed.color}
                    onChange={e => updateEmbed({ color: e.target.value })}
                    className="input flex-1"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">URL (optional)</label>
                <input
                  type="text"
                  value={embed.url}
                  onChange={e => updateEmbed({ url: e.target.value })}
                  className="input w-full"
                  placeholder="https://..."
                />
              </div>
            </div>
          </div>

          {/* Author */}
          <div className="card space-y-4">
            <h3 className="font-semibold">Author</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Name</label>
                <input
                  type="text"
                  value={embed.authorName}
                  onChange={e => updateEmbed({ authorName: e.target.value })}
                  className="input w-full"
                  placeholder="Author name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Icon URL</label>
                <input
                  type="text"
                  value={embed.authorIcon}
                  onChange={e => updateEmbed({ authorIcon: e.target.value })}
                  className="input w-full"
                  placeholder="https://..."
                />
              </div>
            </div>
          </div>

          {/* Images */}
          <div className="card space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Image className="w-5 h-5 text-green-400" />
              Images
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Thumbnail URL</label>
                <input
                  type="text"
                  value={embed.thumbnail}
                  onChange={e => updateEmbed({ thumbnail: e.target.value })}
                  className="input w-full"
                  placeholder="Small image on right"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Image URL</label>
                <input
                  type="text"
                  value={embed.image}
                  onChange={e => updateEmbed({ image: e.target.value })}
                  className="input w-full"
                  placeholder="Large image at bottom"
                />
              </div>
            </div>
          </div>

          {/* Fields */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Fields ({embed.fields.length}/25)</h3>
              <button
                onClick={addField}
                disabled={embed.fields.length >= 25}
                className="btn btn-secondary btn-sm flex items-center gap-2"
              >
                <Plus className="w-3 h-3" />
                Add Field
              </button>
            </div>
            {embed.fields.map((field, index) => (
              <div key={index} className="bg-discord-dark rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Field {index + 1}</span>
                  <button
                    onClick={() => removeField(index)}
                    className="p-1 text-discord-light hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={field.name}
                    onChange={e => updateField(index, { name: e.target.value })}
                    className="input"
                    placeholder="Name"
                  />
                  <input
                    type="text"
                    value={field.value}
                    onChange={e => updateField(index, { value: e.target.value })}
                    className="input"
                    placeholder="Value"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={field.inline}
                    onChange={e => updateField(index, { inline: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm">Inline</span>
                </label>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="card space-y-4">
            <h3 className="font-semibold">Footer</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Text</label>
                <input
                  type="text"
                  value={embed.footerText}
                  onChange={e => updateEmbed({ footerText: e.target.value })}
                  className="input w-full"
                  placeholder="Footer text"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Icon URL</label>
                <input
                  type="text"
                  value={embed.footerIcon}
                  onChange={e => updateEmbed({ footerIcon: e.target.value })}
                  className="input w-full"
                  placeholder="https://..."
                />
              </div>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="sticky top-6">
          <div className="card">
            <h3 className="font-semibold mb-4">Preview</h3>
            <div className="bg-discord-dark rounded-lg p-4">
              <div className="flex gap-4">
                <div
                  className="w-1 rounded-full shrink-0"
                  style={{ backgroundColor: embed.color }}
                />
                <div className="flex-1 min-w-0">
                  {embed.authorName && (
                    <div className="flex items-center gap-2 mb-2">
                      {embed.authorIcon && (
                        <div className="w-6 h-6 rounded-full bg-discord-darker" />
                      )}
                      <span className="text-sm">{embed.authorName}</span>
                    </div>
                  )}
                  
                  {embed.title && (
                    <h4 className="font-semibold text-discord-blurple mb-2">{embed.title}</h4>
                  )}
                  
                  {embed.description && (
                    <p className="text-sm text-discord-light mb-3 whitespace-pre-wrap">{embed.description}</p>
                  )}
                  
                  {embed.fields.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {embed.fields.map((field, index) => (
                        <div
                          key={index}
                          className={field.inline ? '' : 'col-span-3'}
                        >
                          <p className="text-xs font-semibold">{field.name}</p>
                          <p className="text-sm text-discord-light">{field.value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {embed.image && (
                    <div className="w-full h-32 bg-discord-darker rounded mb-3 flex items-center justify-center text-discord-light text-xs">
                      Image Preview
                    </div>
                  )}
                  
                  {embed.footerText && (
                    <div className="flex items-center gap-2 text-xs text-discord-light">
                      {embed.footerIcon && (
                        <div className="w-4 h-4 rounded-full bg-discord-darker" />
                      )}
                      <span>{embed.footerText}</span>
                    </div>
                  )}
                </div>
                
                {embed.thumbnail && (
                  <div className="w-20 h-20 bg-discord-darker rounded shrink-0 flex items-center justify-center text-discord-light text-xs">
                    Thumb
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
