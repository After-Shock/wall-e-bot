import { useState } from 'react';
import { Terminal, Plus, Trash2, Search, Save, Edit, Info } from 'lucide-react';

interface CustomCommand {
  id: string;
  name: string;
  response: string;
  embedEnabled: boolean;
  embed?: {
    title: string;
    description: string;
    color: string;
  };
  permissions: string[];
  cooldown: number;
  enabled: boolean;
}

const variables = [
  { name: '{user}', desc: 'User mention' },
  { name: '{username}', desc: 'Username' },
  { name: '{server}', desc: 'Server name' },
  { name: '{channel}', desc: 'Channel name' },
  { name: '{args}', desc: 'All arguments' },
  { name: '{args.1}', desc: 'First argument' },
];

export default function CustomCommandsPage() {
  const [commands, setCommands] = useState<CustomCommand[]>([
    {
      id: '1',
      name: 'rules',
      response: '📜 **Server Rules**\n1. Be respectful\n2. No spam\n3. Have fun!',
      embedEnabled: false,
      permissions: [],
      cooldown: 5,
      enabled: true,
    },
  ]);
  const [editingCommand, setEditingCommand] = useState<CustomCommand | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCommands = commands.filter(cmd =>
    cmd.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const createNewCommand = () => {
    setEditingCommand({
      id: Date.now().toString(),
      name: '',
      response: '',
      embedEnabled: false,
      permissions: [],
      cooldown: 5,
      enabled: true,
    });
    setShowEditor(true);
  };

  const saveCommand = () => {
    if (!editingCommand || !editingCommand.name) return;
    
    setCommands(prev => {
      const exists = prev.find(c => c.id === editingCommand.id);
      if (exists) {
        return prev.map(c => c.id === editingCommand.id ? editingCommand : c);
      }
      return [...prev, editingCommand];
    });
    setShowEditor(false);
    setEditingCommand(null);
  };

  const deleteCommand = (id: string) => {
    setCommands(prev => prev.filter(c => c.id !== id));
  };

  const toggleCommand = (id: string) => {
    setCommands(prev =>
      prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c)
    );
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Terminal className="w-8 h-8 text-discord-blurple" />
          <div>
            <h1 className="text-2xl font-bold">Custom Commands</h1>
            <p className="text-discord-light">Create custom text commands for your server</p>
          </div>
        </div>
        <button
          onClick={createNewCommand}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Create Command
        </button>
      </div>

      {!showEditor ? (
        <>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-discord-light" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search commands..."
              className="input w-full pl-10"
            />
          </div>

          {/* Commands List */}
          <div className="space-y-3">
            {filteredCommands.length === 0 ? (
              <div className="card text-center py-12">
                <Terminal className="w-16 h-16 mx-auto text-discord-light mb-4 opacity-50" />
                <h3 className="text-xl font-semibold mb-2">
                  {searchQuery ? 'No commands found' : 'No Custom Commands'}
                </h3>
                <p className="text-discord-light mb-4">
                  {searchQuery
                    ? 'Try a different search term'
                    : 'Create custom commands for your community'}
                </p>
                {!searchQuery && (
                  <button onClick={createNewCommand} className="btn btn-primary">
                    Create Your First Command
                  </button>
                )}
              </div>
            ) : (
              filteredCommands.map(cmd => (
                <div key={cmd.id} className="card">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => toggleCommand(cmd.id)}
                        className={`relative w-10 h-5 rounded-full transition-colors ${
                          cmd.enabled ? 'bg-green-500' : 'bg-discord-dark'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                            cmd.enabled ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <code className="text-discord-blurple font-semibold">!{cmd.name}</code>
                          {cmd.cooldown > 0 && (
                            <span className="text-xs bg-discord-dark px-2 py-0.5 rounded">
                              {cmd.cooldown}s cooldown
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-discord-light truncate max-w-md">
                          {cmd.response.slice(0, 100)}...
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingCommand(cmd);
                          setShowEditor(true);
                        }}
                        className="btn btn-secondary"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteCommand(cmd.id)}
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
        </>
      ) : (
        /* Editor */
        <div className="space-y-6">
          <div className="card">
            <h3 className="font-semibold mb-4">Command Settings</h3>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-2">Command Name</label>
                <div className="flex">
                  <span className="bg-discord-dark border border-r-0 border-discord-dark px-3 py-2 rounded-l text-discord-light">
                    !
                  </span>
                  <input
                    type="text"
                    value={editingCommand?.name || ''}
                    onChange={e => setEditingCommand(prev => prev ? { ...prev, name: e.target.value.toLowerCase().replace(/\s/g, '-') } : null)}
                    className="input flex-1 rounded-l-none"
                    placeholder="command-name"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Cooldown (seconds)</label>
                <input
                  type="number"
                  value={editingCommand?.cooldown || 0}
                  onChange={e => setEditingCommand(prev => prev ? { ...prev, cooldown: parseInt(e.target.value) || 0 } : null)}
                  className="input w-full"
                  min="0"
                  max="3600"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Response Type</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={!editingCommand?.embedEnabled}
                    onChange={() => setEditingCommand(prev => prev ? { ...prev, embedEnabled: false } : null)}
                    className="w-4 h-4"
                  />
                  <span>Plain Text</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={editingCommand?.embedEnabled}
                    onChange={() => setEditingCommand(prev => prev ? { ...prev, embedEnabled: true } : null)}
                    className="w-4 h-4"
                  />
                  <span>Embed</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Response</label>
              <textarea
                value={editingCommand?.response || ''}
                onChange={e => setEditingCommand(prev => prev ? { ...prev, response: e.target.value } : null)}
                className="input w-full h-32 resize-none font-mono text-sm"
                placeholder="Enter the command response..."
              />
            </div>
          </div>

          {/* Variables */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-discord-blurple" />
              <h3 className="font-semibold">Available Variables</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {variables.map(v => (
                <button
                  key={v.name}
                  onClick={() => {
                    setEditingCommand(prev => prev ? {
                      ...prev,
                      response: prev.response + v.name
                    } : null);
                  }}
                  className="bg-discord-dark hover:bg-discord-blurple/20 px-3 py-1.5 rounded text-sm transition-colors"
                  title={v.desc}
                >
                  <code>{v.name}</code>
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="card">
            <h3 className="font-semibold mb-4">Preview</h3>
            <div className="bg-discord-dark rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-discord-blurple flex items-center justify-center">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Wall-E Bot</span>
                    <span className="text-xs bg-discord-blurple px-1.5 py-0.5 rounded">BOT</span>
                  </div>
                  <p className="text-sm mt-1 whitespace-pre-wrap">
                    {(editingCommand?.response || 'Your response will appear here...')
                      .replace('{user}', '@User')
                      .replace('{username}', 'User')
                      .replace('{server}', 'Your Server')
                      .replace('{channel}', '#general')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowEditor(false);
                setEditingCommand(null);
              }}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={saveCommand}
              disabled={!editingCommand?.name}
              className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              Save Command
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
