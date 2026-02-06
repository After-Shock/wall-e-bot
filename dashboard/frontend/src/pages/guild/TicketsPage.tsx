import { useState } from 'react';
import { Ticket, Save, Plus, Trash2, Hash, Users, Clock, Archive } from 'lucide-react';

interface TicketCategory {
  id: string;
  name: string;
  emoji: string;
  description: string;
  staffRoles: string[];
}

interface ActiveTicket {
  id: string;
  channelName: string;
  userId: string;
  userName: string;
  category: string;
  createdAt: Date;
  status: 'open' | 'claimed' | 'closed';
  claimedBy?: string;
}

export default function TicketsPage() {
  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState({
    categoryId: '',
    transcriptChannel: '',
    maxTicketsPerUser: 1,
    autoCloseHours: 48,
    welcomeMessage: 'Welcome! Please describe your issue and a staff member will assist you shortly.',
  });

  const [categories, setCategories] = useState<TicketCategory[]>([
    { id: '1', name: 'General Support', emoji: '🎫', description: 'General questions and help', staffRoles: ['Support'] },
    { id: '2', name: 'Report User', emoji: '🚨', description: 'Report rule violations', staffRoles: ['Moderator', 'Admin'] },
    { id: '3', name: 'Partnership', emoji: '🤝', description: 'Partnership inquiries', staffRoles: ['Admin'] },
  ]);

  const [activeTickets] = useState<ActiveTicket[]>([
    { id: '1', channelName: 'ticket-0001', userId: '1', userName: 'User1', category: 'General Support', createdAt: new Date(Date.now() - 3600000), status: 'open' },
    { id: '2', channelName: 'ticket-0002', userId: '2', userName: 'User2', category: 'Report User', createdAt: new Date(Date.now() - 7200000), status: 'claimed', claimedBy: 'Moderator' },
    { id: '3', channelName: 'ticket-0003', userId: '3', userName: 'User3', category: 'General Support', createdAt: new Date(Date.now() - 86400000), status: 'closed' },
  ]);

  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: '', emoji: '🎫', description: '' });

  const updateConfig = (updates: Partial<typeof config>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const addCategory = () => {
    if (!newCategory.name.trim()) return;
    setCategories(prev => [...prev, {
      id: Date.now().toString(),
      ...newCategory,
      staffRoles: [],
    }]);
    setNewCategory({ name: '', emoji: '🎫', description: '' });
    setIsAddingCategory(false);
  };

  const removeCategory = (id: string) => {
    setCategories(prev => prev.filter(c => c.id !== id));
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      open: 'bg-green-500/20 text-green-400',
      claimed: 'bg-yellow-500/20 text-yellow-400',
      closed: 'bg-gray-500/20 text-gray-400',
    };
    return styles[status] || 'bg-gray-500/20 text-gray-400';
  };

  const formatTime = (date: Date) => {
    const diff = Date.now() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Ticket className="w-8 h-8 text-green-400" />
          <div>
            <h1 className="text-2xl font-bold">Tickets</h1>
            <p className="text-discord-light">Set up a support ticket system</p>
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
            <h3 className="font-semibold">Enable Ticket System</h3>
            <p className="text-sm text-discord-light">
              Allow members to create support tickets
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
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="card text-center">
              <p className="text-3xl font-bold text-green-400">{activeTickets.filter(t => t.status === 'open').length}</p>
              <p className="text-sm text-discord-light">Open</p>
            </div>
            <div className="card text-center">
              <p className="text-3xl font-bold text-yellow-400">{activeTickets.filter(t => t.status === 'claimed').length}</p>
              <p className="text-sm text-discord-light">Claimed</p>
            </div>
            <div className="card text-center">
              <p className="text-3xl font-bold text-gray-400">{activeTickets.filter(t => t.status === 'closed').length}</p>
              <p className="text-sm text-discord-light">Closed Today</p>
            </div>
            <div className="card text-center">
              <p className="text-3xl font-bold">156</p>
              <p className="text-sm text-discord-light">Total This Month</p>
            </div>
          </div>

          {/* Settings */}
          <div className="card space-y-4">
            <h3 className="font-semibold">Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Tickets Category</label>
                <select
                  value={config.categoryId}
                  onChange={e => updateConfig({ categoryId: e.target.value })}
                  className="input w-full"
                >
                  <option value="">Select category...</option>
                  <option value="tickets">Tickets</option>
                  <option value="support">Support</option>
                </select>
                <p className="text-xs text-discord-light mt-1">Ticket channels will be created here</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Transcript Channel</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-discord-light" />
                  <select
                    value={config.transcriptChannel}
                    onChange={e => updateConfig({ transcriptChannel: e.target.value })}
                    className="input w-full pl-9"
                  >
                    <option value="">No transcripts</option>
                    <option value="transcripts">transcripts</option>
                    <option value="ticket-logs">ticket-logs</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Max Tickets Per User</label>
                <input
                  type="number"
                  value={config.maxTicketsPerUser}
                  onChange={e => updateConfig({ maxTicketsPerUser: parseInt(e.target.value) || 1 })}
                  className="input w-full"
                  min="1"
                  max="10"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Auto-Close After (hours)</label>
                <input
                  type="number"
                  value={config.autoCloseHours}
                  onChange={e => updateConfig({ autoCloseHours: parseInt(e.target.value) || 0 })}
                  className="input w-full"
                  min="0"
                />
                <p className="text-xs text-discord-light mt-1">0 = never auto-close</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Welcome Message</label>
              <textarea
                value={config.welcomeMessage}
                onChange={e => updateConfig({ welcomeMessage: e.target.value })}
                className="input w-full h-20 resize-none"
                placeholder="Welcome message when ticket is created..."
              />
            </div>
          </div>

          {/* Categories */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Ticket Categories ({categories.length})</h3>
              <button
                onClick={() => setIsAddingCategory(true)}
                className="btn btn-secondary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Category
              </button>
            </div>

            {isAddingCategory && (
              <div className="bg-discord-dark rounded-lg p-4 mb-4 space-y-3">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Emoji</label>
                    <input
                      type="text"
                      value={newCategory.emoji}
                      onChange={e => setNewCategory(prev => ({ ...prev, emoji: e.target.value }))}
                      className="input w-full text-center"
                      maxLength={2}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-2">Name</label>
                    <input
                      type="text"
                      value={newCategory.name}
                      onChange={e => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
                      className="input w-full"
                      placeholder="Category name"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <input
                    type="text"
                    value={newCategory.description}
                    onChange={e => setNewCategory(prev => ({ ...prev, description: e.target.value }))}
                    className="input w-full"
                    placeholder="Brief description..."
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setIsAddingCategory(false)} className="btn btn-secondary">Cancel</button>
                  <button onClick={addCategory} className="btn btn-primary">Add</button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {categories.map(category => (
                <div key={category.id} className="flex items-center gap-4 bg-discord-dark rounded-lg p-3">
                  <span className="text-2xl">{category.emoji}</span>
                  <div className="flex-1">
                    <p className="font-semibold">{category.name}</p>
                    <p className="text-sm text-discord-light">{category.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-discord-light" />
                    <span className="text-sm text-discord-light">{category.staffRoles.join(', ') || 'No roles'}</span>
                  </div>
                  <button
                    onClick={() => removeCategory(category.id)}
                    className="p-2 text-discord-light hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Active Tickets */}
          <div className="card">
            <h3 className="font-semibold mb-4">Active Tickets</h3>
            <div className="space-y-2">
              {activeTickets.filter(t => t.status !== 'closed').map(ticket => (
                <div key={ticket.id} className="flex items-center gap-4 bg-discord-dark rounded-lg p-3">
                  <Hash className="w-5 h-5 text-discord-light" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{ticket.channelName}</span>
                      <span className={`px-2 py-0.5 rounded text-xs capitalize ${getStatusBadge(ticket.status)}`}>
                        {ticket.status}
                      </span>
                    </div>
                    <p className="text-sm text-discord-light">
                      {ticket.userName} • {ticket.category}
                      {ticket.claimedBy && ` • Claimed by ${ticket.claimedBy}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-discord-light">
                    <Clock className="w-4 h-4" />
                    {formatTime(ticket.createdAt)}
                  </div>
                  <button className="p-2 text-discord-light hover:text-red-400 transition-colors">
                    <Archive className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
