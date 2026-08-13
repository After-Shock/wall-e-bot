import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { Smile, Plus, Trash2, Save, Hash, Edit } from 'lucide-react';

interface ReactionRole {
  emoji: string;
  role_id: string;
  label: string;
}

interface ReactionRoleMessage {
  id: number | null;
  channel_id: string;
  message_id?: string;
  title: string;
  description: string;
  color: string;
  type: 'buttons' | 'dropdown';
  roles: ReactionRole[];
}

interface DiscordChannel {
  id: string;
  name: string;
  parent_id: string | null;
}

interface GuildRole {
  id: string;
  name: string;
  color: number;
}

// Custom emoji arrive as <:name:id> / <a:name:id>; render them from the CDN so
// the preview matches what Discord will actually show.
const CUSTOM_EMOJI = /^<(a?):([\w~]+):(\d{17,20})>$/;

function EmojiPreview({ emoji }: { emoji: string }) {
  const custom = CUSTOM_EMOJI.exec(emoji.trim());
  if (!custom) return <span>{emoji}</span>;
  return (
    <img
      src={`https://cdn.discordapp.com/emojis/${custom[3]}.${custom[1] ? 'gif' : 'png'}?size=32`}
      alt={`:${custom[2]}:`}
      className="w-5 h-5 inline-block"
    />
  );
}

const blank = (): ReactionRoleMessage => ({
  id: null,
  channel_id: '',
  title: 'Role Selection',
  description: 'Click a button to get your roles!',
  color: '#5865F2',
  type: 'buttons',
  roles: [],
});

export default function ReactionRolesPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ReactionRoleMessage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: messages = [] } = useQuery<ReactionRoleMessage[]>({
    queryKey: ['reaction-roles', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/reaction-roles`).then(r => r.data),
  });

  const { data: channels = [] } = useQuery<DiscordChannel[]>({
    queryKey: ['channels', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/channels`).then(r => r.data),
  });

  const { data: guildRoles = [] } = useQuery<GuildRole[]>({
    queryKey: ['guild-roles', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/roles`).then(r => r.data),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['reaction-roles', guildId] });
  const apiError = (e: unknown) =>
    setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Request failed');

  const saveMutation = useMutation({
    mutationFn: (m: ReactionRoleMessage) => {
      const body = {
        channel_id: m.channel_id,
        title: m.title,
        description: m.description,
        color: m.color,
        type: m.type,
        roles: m.roles,
      };
      return m.id === null
        ? api.post(`/api/guilds/${guildId}/reaction-roles`, body)
        : api.patch(`/api/guilds/${guildId}/reaction-roles/${m.id}`, body);
    },
    onSuccess: () => { invalidate(); setEditing(null); setError(null); },
    onError: apiError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/guilds/${guildId}/reaction-roles/${id}`),
    onSuccess: () => { invalidate(); setError(null); },
    onError: apiError,
  });

  const channelName = (id: string) => channels.find(c => c.id === id)?.name ?? id;
  const roleName = (id: string) => guildRoles.find(r => r.id === id)?.name ?? 'Unknown role';

  const updateRole = (index: number, updates: Partial<ReactionRole>) => {
    if (!editing) return;
    const roles = [...editing.roles];
    roles[index] = { ...roles[index], ...updates };
    setEditing({ ...editing, roles });
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Smile className="w-8 h-8 text-discord-blurple" />
          <div>
            <h1 className="text-2xl font-bold">Reaction Roles</h1>
            <p className="text-discord-light">Create self-assignable roles with buttons or a dropdown</p>
          </div>
        </div>
        {!editing && (
          <button onClick={() => { setEditing(blank()); setError(null); }} className="btn btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create Message
          </button>
        )}
      </div>

      {error && (
        <div className="card bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
      )}

      {/* Messages List */}
      {!editing && (
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="card text-center py-12">
              <Smile className="w-16 h-16 mx-auto text-discord-light mb-4 opacity-50" />
              <h3 className="text-xl font-semibold mb-2">No Reaction Role Messages</h3>
              <p className="text-discord-light mb-4">
                Create a reaction role message to let members self-assign roles
              </p>
              <button onClick={() => { setEditing(blank()); setError(null); }} className="btn btn-primary">
                Create Your First Message
              </button>
            </div>
          ) : (
            messages.map(message => (
              <div key={message.id} className="card">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Hash className="w-4 h-4 text-discord-light" />
                      <span className="text-sm text-discord-light">{channelName(message.channel_id)}</span>
                    </div>
                    <h3 className="font-semibold text-lg">{message.title}</h3>
                    <p className="text-discord-light text-sm mb-3">{message.description}</p>
                    <div className="flex flex-wrap gap-2">
                      {message.roles.map((role, i) => (
                        <span key={i} className="bg-discord-dark px-3 py-1 rounded-full text-sm flex items-center gap-2">
                          <EmojiPreview emoji={role.emoji} />
                          <span>@{roleName(role.role_id)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditing({ ...message, roles: [...message.roles] }); setError(null); }}
                      className="btn btn-secondary"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => message.id !== null && deleteMutation.mutate(message.id)}
                      disabled={deleteMutation.isPending}
                      className="btn bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Editor */}
      {editing && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="font-semibold mb-4">Message Settings</h3>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-2">Channel</label>
                <select
                  value={editing.channel_id}
                  onChange={e => setEditing({ ...editing, channel_id: e.target.value })}
                  className="input w-full"
                >
                  <option value="">Select channel...</option>
                  {channels.map(c => (
                    <option key={c.id} value={c.id}>#{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Style</label>
                <select
                  value={editing.type}
                  onChange={e => setEditing({ ...editing, type: e.target.value as ReactionRoleMessage['type'] })}
                  className="input w-full"
                >
                  <option value="buttons">Buttons (up to 25)</option>
                  <option value="dropdown">Dropdown menu</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-2">Embed Title</label>
                <input
                  type="text"
                  value={editing.title}
                  onChange={e => setEditing({ ...editing, title: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Embed Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={editing.color}
                    onChange={e => setEditing({ ...editing, color: e.target.value })}
                    className="w-10 h-10 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={editing.color}
                    onChange={e => setEditing({ ...editing, color: e.target.value })}
                    className="input flex-1"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <textarea
                value={editing.description}
                onChange={e => setEditing({ ...editing, description: e.target.value })}
                className="input w-full h-20 resize-none"
              />
            </div>
          </div>

          {/* Roles */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Roles ({editing.roles.length})</h3>
              <button
                onClick={() => setEditing({ ...editing, roles: [...editing.roles, { emoji: '🎮', role_id: '', label: '' }] })}
                disabled={editing.roles.length >= 25}
                className="btn btn-secondary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Role
              </button>
            </div>

            {editing.roles.length === 0 ? (
              <p className="text-discord-light text-center py-4">
                No roles added yet. Click "Add Role" to start.
              </p>
            ) : (
              <div className="space-y-3">
                {editing.roles.map((role, index) => (
                  <div key={index} className="bg-discord-dark rounded-lg p-4 flex items-center gap-4">
                    <div>
                      <label className="block text-xs text-discord-light mb-1">Emoji</label>
                      <input
                        type="text"
                        value={role.emoji}
                        onChange={e => updateRole(index, { emoji: e.target.value })}
                        placeholder="🎮"
                        className="input w-20 text-center"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-discord-light mb-1">Role</label>
                      <select
                        value={role.role_id}
                        onChange={e => {
                          const selected = guildRoles.find(r => r.id === e.target.value);
                          updateRole(index, {
                            role_id: e.target.value,
                            label: role.label || selected?.name || '',
                          });
                        }}
                        className="input w-full"
                      >
                        <option value="">Select role...</option>
                        {guildRoles.map(r => (
                          <option key={r.id} value={r.id}>@{r.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-discord-light mb-1">Label</label>
                      <input
                        type="text"
                        value={role.label}
                        onChange={e => updateRole(index, { label: e.target.value })}
                        className="input w-full"
                      />
                    </div>
                    <button
                      onClick={() => setEditing({ ...editing, roles: editing.roles.filter((_, i) => i !== index) })}
                      className="p-2 text-red-400 hover:bg-red-500/20 rounded mt-4"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-discord-light mt-3">
              Emoji can be unicode (🎮) or custom — type <code>\:name:</code> in Discord to get the
              <code>{'<:name:id>'}</code> form and paste it here. Wall-E's role must sit above every
              role you hand out.
            </p>
          </div>

          {/* Preview */}
          <div className="card">
            <h3 className="font-semibold mb-4">Preview</h3>
            <div className="bg-discord-dark rounded-lg p-4">
              <div className="flex gap-4">
                <div className="w-1 rounded-full shrink-0" style={{ backgroundColor: editing.color }} />
                <div className="flex-1">
                  <h4 className="font-semibold mb-2">{editing.title}</h4>
                  <p className="text-sm text-discord-light mb-3">{editing.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {editing.roles.map((role, i) => (
                      <span key={i} className="bg-discord-darker px-2 py-1 rounded text-sm flex items-center gap-1">
                        <EmojiPreview emoji={role.emoji} />
                        <span>{role.label}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={() => { setEditing(null); setError(null); }} className="btn btn-secondary">
              Cancel
            </button>
            <button
              onClick={() => saveMutation.mutate(editing)}
              disabled={
                saveMutation.isPending ||
                !editing.channel_id ||
                editing.roles.length === 0 ||
                editing.roles.some(r => !r.role_id || !r.emoji.trim() || !r.label.trim())
              }
              className="btn btn-primary flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saveMutation.isPending ? 'Posting...' : editing.id === null ? 'Post to Discord' : 'Update Message'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
