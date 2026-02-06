import { useState } from 'react';
import { ScrollText, Save, Hash } from 'lucide-react';

interface LogCategory {
  id: string;
  name: string;
  description: string;
  events: LogEvent[];
}

interface LogEvent {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

const logCategories: LogCategory[] = [
  {
    id: 'messages',
    name: 'Messages',
    description: 'Message edits, deletions, and bulk deletes',
    events: [
      { id: 'messageDelete', name: 'Message Deleted', description: 'Log when messages are deleted', enabled: true },
      { id: 'messageEdit', name: 'Message Edited', description: 'Log when messages are edited', enabled: true },
      { id: 'messageBulkDelete', name: 'Bulk Delete', description: 'Log bulk message deletions', enabled: false },
    ],
  },
  {
    id: 'members',
    name: 'Members',
    description: 'Member joins, leaves, and updates',
    events: [
      { id: 'memberJoin', name: 'Member Joined', description: 'Log when members join', enabled: true },
      { id: 'memberLeave', name: 'Member Left', description: 'Log when members leave', enabled: true },
      { id: 'memberUpdate', name: 'Member Updated', description: 'Log nickname and role changes', enabled: false },
    ],
  },
  {
    id: 'moderation',
    name: 'Moderation',
    description: 'Bans, kicks, mutes, and warnings',
    events: [
      { id: 'memberBan', name: 'Member Banned', description: 'Log when members are banned', enabled: true },
      { id: 'memberUnban', name: 'Member Unbanned', description: 'Log when members are unbanned', enabled: true },
      { id: 'memberKick', name: 'Member Kicked', description: 'Log when members are kicked', enabled: true },
      { id: 'memberWarn', name: 'Member Warned', description: 'Log when members are warned', enabled: true },
      { id: 'memberTimeout', name: 'Member Timed Out', description: 'Log when members are timed out', enabled: false },
    ],
  },
  {
    id: 'server',
    name: 'Server',
    description: 'Channel, role, and server updates',
    events: [
      { id: 'channelCreate', name: 'Channel Created', description: 'Log channel creations', enabled: false },
      { id: 'channelDelete', name: 'Channel Deleted', description: 'Log channel deletions', enabled: false },
      { id: 'roleCreate', name: 'Role Created', description: 'Log role creations', enabled: false },
      { id: 'roleDelete', name: 'Role Deleted', description: 'Log role deletions', enabled: false },
    ],
  },
  {
    id: 'voice',
    name: 'Voice',
    description: 'Voice channel activity',
    events: [
      { id: 'voiceJoin', name: 'Voice Join', description: 'Log when members join voice', enabled: false },
      { id: 'voiceLeave', name: 'Voice Leave', description: 'Log when members leave voice', enabled: false },
      { id: 'voiceMove', name: 'Voice Move', description: 'Log when members move channels', enabled: false },
    ],
  },
];

export default function LoggingPage() {
  const [enabled, setEnabled] = useState(true);
  const [logChannel, setLogChannel] = useState('mod-logs');
  const [categories, setCategories] = useState(logCategories);
  const [splitChannels, setSplitChannels] = useState(false);
  const [categoryChannels, setCategoryChannels] = useState<Record<string, string>>({});

  const toggleEvent = (categoryId: string, eventId: string) => {
    setCategories(prev =>
      prev.map(cat =>
        cat.id === categoryId
          ? {
              ...cat,
              events: cat.events.map(evt =>
                evt.id === eventId ? { ...evt, enabled: !evt.enabled } : evt
              ),
            }
          : cat
      )
    );
  };

  const toggleCategory = (categoryId: string, enabled: boolean) => {
    setCategories(prev =>
      prev.map(cat =>
        cat.id === categoryId
          ? { ...cat, events: cat.events.map(evt => ({ ...evt, enabled })) }
          : cat
      )
    );
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ScrollText className="w-8 h-8 text-discord-blurple" />
          <div>
            <h1 className="text-2xl font-bold">Logging</h1>
            <p className="text-discord-light">Configure event logging for your server</p>
          </div>
        </div>
        <button className="btn btn-primary flex items-center gap-2">
          <Save className="w-4 h-4" />
          Save Changes
        </button>
      </div>

      {/* Enable Toggle */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Enable Logging</h3>
            <p className="text-sm text-discord-light">Log server events to a designated channel</p>
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
          {/* Log Channel */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">Log Channel</h3>
                <p className="text-sm text-discord-light">Where to send log messages</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={splitChannels}
                  onChange={e => setSplitChannels(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm">Use separate channels per category</span>
              </label>
            </div>

            {!splitChannels ? (
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-discord-light" />
                <select
                  value={logChannel}
                  onChange={e => setLogChannel(e.target.value)}
                  className="input w-full pl-9"
                >
                  <option value="">Select channel...</option>
                  <option value="mod-logs">mod-logs</option>
                  <option value="server-logs">server-logs</option>
                  <option value="audit-log">audit-log</option>
                </select>
              </div>
            ) : (
              <div className="space-y-3">
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center gap-4">
                    <span className="w-32 text-sm font-medium">{cat.name}</span>
                    <div className="relative flex-1">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-discord-light" />
                      <select
                        value={categoryChannels[cat.id] || ''}
                        onChange={e => setCategoryChannels(prev => ({ ...prev, [cat.id]: e.target.value }))}
                        className="input w-full pl-9"
                      >
                        <option value="">Select channel...</option>
                        <option value={`${cat.id}-logs`}>{cat.id}-logs</option>
                        <option value="mod-logs">mod-logs</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Event Categories */}
          <div className="space-y-4">
            {categories.map(category => {
              const enabledCount = category.events.filter(e => e.enabled).length;
              const allEnabled = enabledCount === category.events.length;
              const someEnabled = enabledCount > 0 && !allEnabled;

              return (
                <div key={category.id} className="card">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-semibold">{category.name}</h3>
                      <p className="text-sm text-discord-light">{category.description}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-discord-light">
                        {enabledCount}/{category.events.length} enabled
                      </span>
                      <button
                        onClick={() => toggleCategory(category.id, !allEnabled)}
                        className={`relative w-10 h-5 rounded-full transition-colors ${
                          allEnabled ? 'bg-green-500' : someEnabled ? 'bg-yellow-500' : 'bg-discord-dark'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                            allEnabled || someEnabled ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {category.events.map(event => (
                      <div
                        key={event.id}
                        className="bg-discord-dark rounded-lg p-3 flex items-center justify-between"
                      >
                        <div>
                          <p className="font-medium text-sm">{event.name}</p>
                          <p className="text-xs text-discord-light">{event.description}</p>
                        </div>
                        <button
                          onClick={() => toggleEvent(category.id, event.id)}
                          className={`relative w-10 h-5 rounded-full transition-colors ${
                            event.enabled ? 'bg-green-500' : 'bg-discord-darker'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                              event.enabled ? 'translate-x-5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
