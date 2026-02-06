import { useState } from 'react';
import { Zap, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

interface Trigger {
  id: string;
  name: string;
  triggerType: 'contains' | 'exact' | 'startsWith' | 'regex';
  triggerValue: string;
  responseType: 'message' | 'reaction' | 'role';
  response: string;
  caseSensitive: boolean;
  enabled: boolean;
}

export default function TriggersPage() {
  const [triggers, setTriggers] = useState<Trigger[]>([
    { id: '1', name: 'FAQ Response', triggerType: 'contains', triggerValue: '!faq', responseType: 'message', response: 'Check out our FAQ at #faq!', caseSensitive: false, enabled: true },
    { id: '2', name: 'Hello Reaction', triggerType: 'exact', triggerValue: 'hello', responseType: 'reaction', response: '👋', caseSensitive: false, enabled: true },
    { id: '3', name: 'Auto Role', triggerType: 'startsWith', triggerValue: '!role', responseType: 'role', response: 'member', caseSensitive: false, enabled: false },
  ]);

  const [isAdding, setIsAdding] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newTrigger, setNewTrigger] = useState<Partial<Trigger>>({
    name: '',
    triggerType: 'contains',
    triggerValue: '',
    responseType: 'message',
    response: '',
    caseSensitive: false,
  });

  const addTrigger = () => {
    if (!newTrigger.name?.trim() || !newTrigger.triggerValue?.trim()) return;
    setTriggers(prev => [...prev, {
      ...newTrigger as Trigger,
      id: Date.now().toString(),
      enabled: true,
    }]);
    setNewTrigger({
      name: '',
      triggerType: 'contains',
      triggerValue: '',
      responseType: 'message',
      response: '',
      caseSensitive: false,
    });
    setIsAdding(false);
  };

  const toggleTrigger = (id: string) => {
    setTriggers(prev => prev.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t));
  };

  const removeTrigger = (id: string) => {
    setTriggers(prev => prev.filter(t => t.id !== id));
  };

  const getTriggerTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      contains: 'bg-blue-500/20 text-blue-400',
      exact: 'bg-green-500/20 text-green-400',
      startsWith: 'bg-yellow-500/20 text-yellow-400',
      regex: 'bg-purple-500/20 text-purple-400',
    };
    return colors[type] || 'bg-gray-500/20 text-gray-400';
  };

  const getResponseTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      message: 'bg-discord-blurple/20 text-discord-blurple',
      reaction: 'bg-yellow-500/20 text-yellow-400',
      role: 'bg-green-500/20 text-green-400',
    };
    return colors[type] || 'bg-gray-500/20 text-gray-400';
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-8 h-8 text-yellow-400" />
          <div>
            <h1 className="text-2xl font-bold">Triggers</h1>
            <p className="text-discord-light">Auto-respond to messages with text, reactions, or roles</p>
          </div>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Trigger
        </button>
      </div>

      {/* Add Trigger Form */}
      {isAdding && (
        <div className="card border-2 border-discord-blurple">
          <h3 className="font-semibold mb-4">New Trigger</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Trigger Name</label>
              <input
                type="text"
                value={newTrigger.name}
                onChange={e => setNewTrigger(prev => ({ ...prev, name: e.target.value }))}
                className="input w-full"
                placeholder="My Trigger"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Match Type</label>
                <select
                  value={newTrigger.triggerType}
                  onChange={e => setNewTrigger(prev => ({ ...prev, triggerType: e.target.value as any }))}
                  className="input w-full"
                >
                  <option value="contains">Contains</option>
                  <option value="exact">Exact Match</option>
                  <option value="startsWith">Starts With</option>
                  <option value="regex">Regex</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Trigger Text</label>
                <input
                  type="text"
                  value={newTrigger.triggerValue}
                  onChange={e => setNewTrigger(prev => ({ ...prev, triggerValue: e.target.value }))}
                  className="input w-full"
                  placeholder="hello"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Response Type</label>
                <select
                  value={newTrigger.responseType}
                  onChange={e => setNewTrigger(prev => ({ ...prev, responseType: e.target.value as any }))}
                  className="input w-full"
                >
                  <option value="message">Send Message</option>
                  <option value="reaction">Add Reaction</option>
                  <option value="role">Give Role</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Response</label>
                <input
                  type="text"
                  value={newTrigger.response}
                  onChange={e => setNewTrigger(prev => ({ ...prev, response: e.target.value }))}
                  className="input w-full"
                  placeholder={newTrigger.responseType === 'message' ? 'Hello!' : newTrigger.responseType === 'reaction' ? '👋' : 'Role name'}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newTrigger.caseSensitive}
                onChange={e => setNewTrigger(prev => ({ ...prev, caseSensitive: e.target.checked }))}
                className="w-4 h-4 rounded"
              />
              <span>Case Sensitive</span>
            </label>

            <div className="flex justify-end gap-2">
              <button onClick={() => setIsAdding(false)} className="btn btn-secondary">Cancel</button>
              <button onClick={addTrigger} className="btn btn-primary">Add Trigger</button>
            </div>
          </div>
        </div>
      )}

      {/* Triggers List */}
      <div className="space-y-3">
        {triggers.length === 0 ? (
          <div className="card text-center py-12 text-discord-light">
            <Zap className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No triggers configured</p>
            <p className="text-sm mt-1">Add triggers to auto-respond to messages</p>
          </div>
        ) : (
          triggers.map(trigger => (
            <div key={trigger.id} className={`card ${!trigger.enabled ? 'opacity-60' : ''}`}>
              <div
                className="flex items-center gap-4 cursor-pointer"
                onClick={() => setExpandedId(expandedId === trigger.id ? null : trigger.id)}
              >
                <button
                  onClick={e => { e.stopPropagation(); toggleTrigger(trigger.id); }}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    trigger.enabled ? 'bg-green-500' : 'bg-discord-dark'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      trigger.enabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{trigger.name}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${getTriggerTypeBadge(trigger.triggerType)}`}>
                      {trigger.triggerType}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs ${getResponseTypeBadge(trigger.responseType)}`}>
                      {trigger.responseType}
                    </span>
                  </div>
                  <p className="text-sm text-discord-light">
                    Trigger: <code className="bg-discord-dark px-1 rounded">{trigger.triggerValue}</code>
                  </p>
                </div>

                <button
                  onClick={e => { e.stopPropagation(); removeTrigger(trigger.id); }}
                  className="p-2 text-discord-light hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                {expandedId === trigger.id ? (
                  <ChevronUp className="w-5 h-5 text-discord-light" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-discord-light" />
                )}
              </div>

              {expandedId === trigger.id && (
                <div className="mt-4 pt-4 border-t border-discord-dark">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-discord-light mb-1">Response:</p>
                      <p className="bg-discord-dark rounded px-3 py-2">{trigger.response}</p>
                    </div>
                    <div>
                      <p className="text-sm text-discord-light mb-1">Options:</p>
                      <p className="text-sm">
                        Case Sensitive: <span className={trigger.caseSensitive ? 'text-green-400' : 'text-red-400'}>
                          {trigger.caseSensitive ? 'Yes' : 'No'}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
