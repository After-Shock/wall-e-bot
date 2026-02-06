import { useState } from 'react';
import { Smile, Plus, Trash2, Save, Hash, Edit } from 'lucide-react';

interface ReactionRole {
  emoji: string;
  roleId: string;
  roleName: string;
}

interface ReactionRoleMessage {
  id: string;
  channelId: string;
  messageId?: string;
  title: string;
  description: string;
  color: string;
  roles: ReactionRole[];
  mode: 'normal' | 'unique' | 'verify';
}

const mockRoles = [
  { id: '1', name: 'Announcements', color: '#e74c3c' },
  { id: '2', name: 'Events', color: '#3498db' },
  { id: '3', name: 'Gaming', color: '#9b59b6' },
  { id: '4', name: 'Music', color: '#2ecc71' },
  { id: '5', name: 'Art', color: '#f1c40f' },
];

const defaultEmojis = ['🎮', '🎵', '🎨', '📢', '🎉', '💬', '🔔', '⭐'];

export default function ReactionRolesPage() {
  const [messages, setMessages] = useState<ReactionRoleMessage[]>([]);
  const [editingMessage, setEditingMessage] = useState<ReactionRoleMessage | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const createNewMessage = () => {
    const newMessage: ReactionRoleMessage = {
      id: Date.now().toString(),
      channelId: '',
      title: 'Role Selection',
      description: 'React to get your roles!',
      color: '#5865F2',
      roles: [],
      mode: 'normal',
    };
    setEditingMessage(newMessage);
    setShowEditor(true);
  };

  const saveMessage = () => {
    if (!editingMessage) return;
    
    setMessages(prev => {
      const exists = prev.find(m => m.id === editingMessage.id);
      if (exists) {
        return prev.map(m => m.id === editingMessage.id ? editingMessage : m);
      }
      return [...prev, editingMessage];
    });
    setShowEditor(false);
    setEditingMessage(null);
  };

  const deleteMessage = (id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  };

  const addRoleToMessage = () => {
    if (!editingMessage) return;
    setEditingMessage({
      ...editingMessage,
      roles: [...editingMessage.roles, { emoji: '❓', roleId: '', roleName: '' }],
    });
  };

  const updateRole = (index: number, updates: Partial<ReactionRole>) => {
    if (!editingMessage) return;
    const newRoles = [...editingMessage.roles];
    newRoles[index] = { ...newRoles[index], ...updates };
    setEditingMessage({ ...editingMessage, roles: newRoles });
  };

  const removeRole = (index: number) => {
    if (!editingMessage) return;
    setEditingMessage({
      ...editingMessage,
      roles: editingMessage.roles.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Smile className="w-8 h-8 text-discord-blurple" />
          <div>
            <h1 className="text-2xl font-bold">Reaction Roles</h1>
            <p className="text-discord-light">Create self-assignable roles with reactions</p>
          </div>
        </div>
        <button
          onClick={createNewMessage}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Create Message
        </button>
      </div>

      {/* Messages List */}
      {!showEditor && (
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="card text-center py-12">
              <Smile className="w-16 h-16 mx-auto text-discord-light mb-4 opacity-50" />
              <h3 className="text-xl font-semibold mb-2">No Reaction Role Messages</h3>
              <p className="text-discord-light mb-4">
                Create a reaction role message to let members self-assign roles
              </p>
              <button
                onClick={createNewMessage}
                className="btn btn-primary"
              >
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
                      <span className="text-sm text-discord-light">
                        {message.channelId || 'No channel selected'}
                      </span>
                    </div>
                    <h3 className="font-semibold text-lg">{message.title}</h3>
                    <p className="text-discord-light text-sm mb-3">{message.description}</p>
                    <div className="flex flex-wrap gap-2">
                      {message.roles.map((role, i) => (
                        <span
                          key={i}
                          className="bg-discord-dark px-3 py-1 rounded-full text-sm flex items-center gap-2"
                        >
                          <span>{role.emoji}</span>
                          <span>@{role.roleName || 'Unknown'}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingMessage(message);
                        setShowEditor(true);
                      }}
                      className="btn btn-secondary"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteMessage(message.id)}
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
      {showEditor && editingMessage && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="font-semibold mb-4">Message Settings</h3>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-2">Channel</label>
                <select
                  value={editingMessage.channelId}
                  onChange={e => setEditingMessage({ ...editingMessage, channelId: e.target.value })}
                  className="input w-full"
                >
                  <option value="">Select channel...</option>
                  <option value="roles">roles</option>
                  <option value="get-roles">get-roles</option>
                  <option value="self-assign">self-assign</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Mode</label>
                <select
                  value={editingMessage.mode}
                  onChange={e => setEditingMessage({ ...editingMessage, mode: e.target.value as ReactionRoleMessage['mode'] })}
                  className="input w-full"
                >
                  <option value="normal">Normal (Multiple roles)</option>
                  <option value="unique">Unique (One role only)</option>
                  <option value="verify">Verify (Add on react, keep forever)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-2">Embed Title</label>
                <input
                  type="text"
                  value={editingMessage.title}
                  onChange={e => setEditingMessage({ ...editingMessage, title: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Embed Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={editingMessage.color}
                    onChange={e => setEditingMessage({ ...editingMessage, color: e.target.value })}
                    className="w-10 h-10 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={editingMessage.color}
                    onChange={e => setEditingMessage({ ...editingMessage, color: e.target.value })}
                    className="input flex-1"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <textarea
                value={editingMessage.description}
                onChange={e => setEditingMessage({ ...editingMessage, description: e.target.value })}
                className="input w-full h-20 resize-none"
              />
            </div>
          </div>

          {/* Roles */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Roles ({editingMessage.roles.length})</h3>
              <button
                onClick={addRoleToMessage}
                className="btn btn-secondary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Role
              </button>
            </div>

            {editingMessage.roles.length === 0 ? (
              <p className="text-discord-light text-center py-4">
                No roles added yet. Click "Add Role" to start.
              </p>
            ) : (
              <div className="space-y-3">
                {editingMessage.roles.map((role, index) => (
                  <div key={index} className="bg-discord-dark rounded-lg p-4 flex items-center gap-4">
                    <div>
                      <label className="block text-xs text-discord-light mb-1">Emoji</label>
                      <select
                        value={role.emoji}
                        onChange={e => updateRole(index, { emoji: e.target.value })}
                        className="input w-20"
                      >
                        {defaultEmojis.map(e => (
                          <option key={e} value={e}>{e}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-discord-light mb-1">Role</label>
                      <select
                        value={role.roleId}
                        onChange={e => {
                          const selected = mockRoles.find(r => r.id === e.target.value);
                          updateRole(index, {
                            roleId: e.target.value,
                            roleName: selected?.name || '',
                          });
                        }}
                        className="input w-full"
                      >
                        <option value="">Select role...</option>
                        {mockRoles.map(r => (
                          <option key={r.id} value={r.id}>@{r.name}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={() => removeRole(index)}
                      className="p-2 text-red-400 hover:bg-red-500/20 rounded mt-4"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="card">
            <h3 className="font-semibold mb-4">Preview</h3>
            <div className="bg-discord-dark rounded-lg p-4">
              <div className="flex gap-4">
                <div
                  className="w-1 rounded-full shrink-0"
                  style={{ backgroundColor: editingMessage.color }}
                />
                <div className="flex-1">
                  <h4 className="font-semibold mb-2">{editingMessage.title}</h4>
                  <p className="text-sm text-discord-light mb-3">{editingMessage.description}</p>
                  <div className="flex gap-1">
                    {editingMessage.roles.map((role, i) => (
                      <span key={i} className="bg-discord-darker px-2 py-1 rounded text-lg">
                        {role.emoji}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowEditor(false);
                setEditingMessage(null);
              }}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={saveMessage}
              className="btn btn-primary flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save Message
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
