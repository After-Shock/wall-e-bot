import { useState } from 'react';
import { BookOpen, Save, Plus, Trash2, GripVertical, Hash, Eye } from 'lucide-react';

interface Rule {
  id: string;
  title: string;
  description: string;
}

export default function ServerRulesPage() {
  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState({
    rulesChannel: '',
    requireAcceptance: true,
    acceptRole: '',
    acceptEmoji: '✅',
    dmRulesOnJoin: false,
  });
  const [rules, setRules] = useState<Rule[]>([
    { id: '1', title: 'Be Respectful', description: 'Treat everyone with respect. No harassment, hate speech, or personal attacks.' },
    { id: '2', title: 'No Spam', description: 'Avoid excessive messages, emojis, or self-promotion without permission.' },
    { id: '3', title: 'Stay On Topic', description: 'Keep discussions relevant to channel topics.' },
    { id: '4', title: 'No NSFW Content', description: 'Keep all content appropriate for all ages unless in designated channels.' },
  ]);
  const [isAdding, setIsAdding] = useState(false);
  const [newRule, setNewRule] = useState({ title: '', description: '' });

  const updateConfig = (updates: Partial<typeof config>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const addRule = () => {
    if (!newRule.title.trim()) return;
    setRules(prev => [...prev, { id: Date.now().toString(), ...newRule }]);
    setNewRule({ title: '', description: '' });
    setIsAdding(false);
  };

  const removeRule = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const updateRule = (id: string, updates: Partial<Rule>) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="w-8 h-8 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold">Server Rules</h1>
            <p className="text-discord-light">Set up rules display and acceptance</p>
          </div>
        </div>
        <button className="btn btn-primary flex items-center gap-2">
          <Save className="w-4 h-4" />
          Save & Post Rules
        </button>
      </div>

      {/* Enable Toggle */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Enable Rules System</h3>
            <p className="text-sm text-discord-light">
              Display server rules and optionally require acceptance
            </p>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              enabled ? 'bg-discord-blurple' : 'bg-discord-dark'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                enabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {enabled && (
        <>
          {/* Settings */}
          <div className="card space-y-4">
            <h3 className="font-semibold">Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Rules Channel</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-discord-light" />
                  <select
                    value={config.rulesChannel}
                    onChange={e => updateConfig({ rulesChannel: e.target.value })}
                    className="input w-full pl-9"
                  >
                    <option value="">Select channel...</option>
                    <option value="rules">rules</option>
                    <option value="welcome">welcome</option>
                    <option value="info">info</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Accept Emoji</label>
                <select
                  value={config.acceptEmoji}
                  onChange={e => updateConfig({ acceptEmoji: e.target.value })}
                  className="input w-full"
                >
                  <option value="✅">✅ Check Mark</option>
                  <option value="👍">👍 Thumbs Up</option>
                  <option value="✔️">✔️ Check</option>
                  <option value="🟢">🟢 Green Circle</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="font-medium">Require Acceptance</p>
                  <p className="text-sm text-discord-light">
                    Users must react to gain access to the server
                  </p>
                </div>
                <button
                  onClick={() => updateConfig({ requireAcceptance: !config.requireAcceptance })}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    config.requireAcceptance ? 'bg-green-500' : 'bg-discord-dark'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      config.requireAcceptance ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>

              {config.requireAcceptance && (
                <div>
                  <label className="block text-sm font-medium mb-2">Role to Give on Accept</label>
                  <select
                    value={config.acceptRole}
                    onChange={e => updateConfig({ acceptRole: e.target.value })}
                    className="input w-full"
                  >
                    <option value="">Select role...</option>
                    <option value="member">Member</option>
                    <option value="verified">Verified</option>
                    <option value="accepted-rules">Accepted Rules</option>
                  </select>
                </div>
              )}

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="font-medium">DM Rules on Join</p>
                  <p className="text-sm text-discord-light">
                    Send rules to new members via DM
                  </p>
                </div>
                <button
                  onClick={() => updateConfig({ dmRulesOnJoin: !config.dmRulesOnJoin })}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    config.dmRulesOnJoin ? 'bg-green-500' : 'bg-discord-dark'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      config.dmRulesOnJoin ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>
            </div>
          </div>

          {/* Rules List */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Rules ({rules.length})</h3>
              <div className="flex gap-2">
                <button className="btn btn-secondary flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Preview
                </button>
                <button
                  onClick={() => setIsAdding(true)}
                  className="btn btn-secondary flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Rule
                </button>
              </div>
            </div>

            {isAdding && (
              <div className="bg-discord-dark rounded-lg p-4 mb-4 space-y-3">
                <input
                  type="text"
                  value={newRule.title}
                  onChange={e => setNewRule(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Rule title..."
                  className="input w-full"
                />
                <textarea
                  value={newRule.description}
                  onChange={e => setNewRule(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Rule description..."
                  className="input w-full h-20 resize-none"
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setIsAdding(false)} className="btn btn-secondary">Cancel</button>
                  <button onClick={addRule} className="btn btn-primary">Add Rule</button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {rules.map((rule, index) => (
                <div
                  key={rule.id}
                  className="flex gap-3 bg-discord-dark rounded-lg p-4 group"
                >
                  <GripVertical className="w-5 h-5 text-discord-light opacity-0 group-hover:opacity-100 cursor-grab shrink-0 mt-1" />
                  <div className="w-8 h-8 rounded-full bg-discord-blurple flex items-center justify-center text-sm font-bold shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={rule.title}
                      onChange={e => updateRule(rule.id, { title: e.target.value })}
                      className="input w-full font-semibold"
                    />
                    <textarea
                      value={rule.description}
                      onChange={e => updateRule(rule.id, { description: e.target.value })}
                      className="input w-full h-16 resize-none text-sm"
                    />
                  </div>
                  <button
                    onClick={() => removeRule(rule.id)}
                    className="p-2 text-discord-light hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="card">
            <h3 className="font-semibold mb-4">Preview</h3>
            <div className="bg-discord-dark rounded-lg p-4">
              <div className="border-l-4 border-discord-blurple pl-4">
                <h4 className="font-bold text-lg mb-3">📜 Server Rules</h4>
                <p className="text-sm text-discord-light mb-4">
                  Please read and accept the rules to gain access to the server.
                </p>
                <div className="space-y-3">
                  {rules.map((rule, index) => (
                    <div key={rule.id}>
                      <p className="font-semibold">{index + 1}. {rule.title}</p>
                      <p className="text-sm text-discord-light">{rule.description}</p>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-discord-light mt-4 pt-4 border-t border-discord-darker">
                  React with {config.acceptEmoji} to accept and gain access!
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
