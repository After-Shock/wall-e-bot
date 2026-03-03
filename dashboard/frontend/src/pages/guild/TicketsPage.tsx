import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Ticket, Save, Plus, Trash2, Hash, Clock,
  ChevronDown, ChevronRight, FileText, Loader2
} from 'lucide-react';
import { ticketApi } from '../../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormField {
  id?: number;
  label: string;
  placeholder: string;
  style: 'short' | 'paragraph';
  required: boolean;
  min_length: number;
  max_length: number;
  position: number;
}

interface Category {
  id?: number;
  panel_id?: number;
  name: string;
  emoji: string;
  description: string;
  support_role_ids: string[];
  observer_role_ids: string[];
  position: number;
  form_fields?: FormField[];
  _expanded?: boolean;
}

interface Panel {
  id?: number;
  name: string;
  style: 'channel' | 'thread';
  panel_type: 'buttons' | 'dropdown';
  category_open_id: string;
  category_closed_id: string;
  overflow_category_id: string;
  channel_name_template: string;
  stack_group?: string;
  stack_position?: number;
  categories?: Category[];
  _expanded?: boolean;
}

interface TicketConfig {
  transcript_channel_id: string;
  max_tickets_per_user: number;
  auto_close_hours: number;
  welcome_message: string;
}

interface ActiveTicket {
  id: number;
  channel_id: string;
  user_id: string;
  ticket_number: number;
  category_name?: string;
  panel_name?: string;
  status: 'open' | 'claimed' | 'closed';
  claimed_by?: string;
  created_at: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

type Tab = 'panels' | 'settings' | 'tickets';

export default function TicketsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('panels');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [panels, setPanels] = useState<Panel[]>([]);
  const [config, setConfig] = useState<TicketConfig>({
    transcript_channel_id: '',
    max_tickets_per_user: 1,
    auto_close_hours: 0,
    welcome_message: 'Welcome! Please describe your issue and a staff member will assist you shortly.',
  });
  const [activeTickets, setActiveTickets] = useState<ActiveTicket[]>([]);

  const [showNewPanel, setShowNewPanel] = useState(false);
  const [newPanelName, setNewPanelName] = useState('');

  const fetchData = useCallback(async () => {
    if (!guildId) return;
    setLoading(true);
    setError(null);
    try {
      const [panelsData, configData, ticketsData] = await Promise.all([
        ticketApi.getPanels(guildId),
        ticketApi.getConfig(guildId),
        ticketApi.getTickets(guildId, { status: 'open,claimed' }),
      ]);
      setPanels(panelsData.map((p: Panel) => ({ ...p, _expanded: true })));
      setConfig(configData);
      setActiveTickets(ticketsData);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to load ticket data');
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveConfig = async () => {
    if (!guildId) return;
    setSaving(true);
    try {
      await ticketApi.updateConfig(guildId, config);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  const createPanel = async () => {
    if (!guildId || !newPanelName.trim()) return;
    try {
      const panel = await ticketApi.createPanel(guildId, { name: newPanelName });
      setPanels(prev => [...prev, { ...panel, categories: [] }]);
      setNewPanelName('');
      setShowNewPanel(false);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to create panel');
    }
  };

  const deletePanel = async (panelId: number) => {
    if (!guildId) return;
    if (!confirm('Delete this panel? This cannot be undone.')) return;
    try {
      await ticketApi.deletePanel(guildId, panelId);
      setPanels(prev => prev.filter(p => p.id !== panelId));
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to delete panel');
    }
  };

  const togglePanel = (panelId: number) => {
    setPanels(prev => prev.map(p => p.id === panelId ? { ...p, _expanded: !p._expanded } : p));
  };

  const addCategory = async (panelId: number) => {
    if (!guildId) return;
    const name = prompt('Category name:');
    if (!name?.trim()) return;
    try {
      const cat = await ticketApi.createCategory(guildId, panelId, { name, emoji: '🎫', description: '' });
      setPanels(prev => prev.map(p => p.id === panelId
        ? { ...p, categories: [...(p.categories || []), { ...cat, form_fields: [] }] }
        : p
      ));
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to add category');
    }
  };

  const deleteCategory = async (guildId_: string, categoryId: number, panelId: number) => {
    if (!confirm('Delete this category?')) return;
    try {
      await ticketApi.deleteCategory(guildId_, categoryId);
      setPanels(prev => prev.map(p => p.id === panelId
        ? { ...p, categories: (p.categories || []).filter(c => c.id !== categoryId) }
        : p
      ));
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to delete category');
    }
  };

  const addFormField = async (categoryId: number, panelId: number) => {
    if (!guildId) return;
    const label = prompt('Field label (e.g. "What is your issue?"):');
    if (!label?.trim()) return;
    try {
      const field = await ticketApi.createFormField(guildId, categoryId, {
        label, placeholder: '', style: 'short', required: true, min_length: 0, max_length: 1024,
      });
      setPanels(prev => prev.map(p => p.id === panelId ? {
        ...p,
        categories: (p.categories || []).map(c => c.id === categoryId
          ? { ...c, form_fields: [...(c.form_fields || []), field] }
          : c
        ),
      } : p));
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to add field');
    }
  };

  const deleteFormField = async (fieldId: number, categoryId: number, panelId: number) => {
    if (!guildId) return;
    try {
      await ticketApi.deleteFormField(guildId, fieldId);
      setPanels(prev => prev.map(p => p.id === panelId ? {
        ...p,
        categories: (p.categories || []).map(c => c.id === categoryId
          ? { ...c, form_fields: (c.form_fields || []).filter(f => f.id !== fieldId) }
          : c
        ),
      } : p));
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to delete field');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      open: 'bg-green-500/20 text-green-400',
      claimed: 'bg-yellow-500/20 text-yellow-400',
      closed: 'bg-gray-500/20 text-gray-400',
    };
    return styles[status] || 'bg-gray-500/20 text-gray-400';
  };

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-discord-blurple" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Ticket className="w-8 h-8 text-green-400" />
          <div>
            <h1 className="text-2xl font-bold">Tickets</h1>
            <p className="text-discord-light">Multi-panel ticket system</p>
          </div>
        </div>
        {activeTab === 'settings' && (
          <button onClick={saveConfig} disabled={saving} className="btn btn-primary flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-discord-dark pb-0">
        {(['panels', 'settings', 'tickets'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-discord-blurple text-white'
                : 'border-transparent text-discord-light hover:text-white'
            }`}
          >
            {tab === 'tickets' ? `Active Tickets (${activeTickets.length})` : tab}
          </button>
        ))}
      </div>

      {/* ── PANELS TAB ── */}
      {activeTab === 'panels' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-discord-light">
              Each panel is a separate message sent to a channel. Users click it to open tickets.
            </p>
            <button onClick={() => setShowNewPanel(true)} className="btn btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> New Panel
            </button>
          </div>

          {showNewPanel && (
            <div className="card flex gap-3 items-center">
              <input
                value={newPanelName}
                onChange={e => setNewPanelName(e.target.value)}
                className="input flex-1"
                placeholder="Panel name (e.g. Support, Appeals, Partnerships)"
                onKeyDown={e => e.key === 'Enter' && createPanel()}
                autoFocus
              />
              <button onClick={createPanel} className="btn btn-primary">Create</button>
              <button onClick={() => setShowNewPanel(false)} className="btn btn-secondary">Cancel</button>
            </div>
          )}

          {panels.length === 0 && !showNewPanel && (
            <div className="card text-center py-12 text-discord-light">
              <Ticket className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No panels yet. Create your first panel to get started.</p>
            </div>
          )}

          {panels.map(panel => (
            <div key={panel.id} className="card">
              {/* Panel header */}
              <div className="flex items-center gap-3">
                <button onClick={() => panel.id && togglePanel(panel.id)} className="flex items-center gap-2 flex-1 text-left">
                  {panel._expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <span className="font-semibold">{panel.name}</span>
                  <span className="text-xs text-discord-light bg-discord-dark px-2 py-0.5 rounded">
                    {panel.style} / {panel.panel_type}
                  </span>
                  {panel.stack_group && (
                    <span className="text-xs bg-discord-blurple/20 text-discord-blurple px-2 py-0.5 rounded flex items-center gap-1">
                      Stack: {panel.stack_group}
                    </span>
                  )}
                  <span className="text-xs text-discord-light">
                    {panel.categories?.length || 0} categories
                  </span>
                </button>
                <button
                  onClick={() => panel.id && deletePanel(panel.id)}
                  className="p-2 text-discord-light hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Expanded panel editor */}
              {panel._expanded && (
                <div className="mt-4 space-y-4 border-t border-discord-dark pt-4">
                  {/* Panel settings */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <label className="block font-medium mb-1">Style</label>
                      <select
                        value={panel.style}
                        onChange={async e => {
                          if (!guildId || !panel.id) return;
                          const updated = await ticketApi.updatePanel(guildId, panel.id, { style: e.target.value });
                          setPanels(prev => prev.map(p => p.id === panel.id ? { ...p, ...updated } : p));
                        }}
                        className="input w-full"
                      >
                        <option value="channel">Channel tickets</option>
                        <option value="thread">Thread tickets</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Panel Type</label>
                      <select
                        value={panel.panel_type}
                        onChange={async e => {
                          if (!guildId || !panel.id) return;
                          const updated = await ticketApi.updatePanel(guildId, panel.id, { panel_type: e.target.value });
                          setPanels(prev => prev.map(p => p.id === panel.id ? { ...p, ...updated } : p));
                        }}
                        className="input w-full"
                      >
                        <option value="buttons">Buttons</option>
                        <option value="dropdown">Dropdown</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Channel Name Template</label>
                      <input
                        defaultValue={panel.channel_name_template}
                        onBlur={async e => {
                          if (!guildId || !panel.id) return;
                          await ticketApi.updatePanel(guildId, panel.id, { channel_name_template: e.target.value });
                        }}
                        className="input w-full"
                        placeholder="{type}-{number}"
                      />
                      <p className="text-xs text-discord-light mt-1">
                        Variables: {'{type}'} {'{number}'} {'{username}'} {'{userid}'}
                      </p>
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Open Category ID</label>
                      <input
                        defaultValue={panel.category_open_id}
                        onBlur={async e => {
                          if (!guildId || !panel.id) return;
                          await ticketApi.updatePanel(guildId, panel.id, { category_open_id: e.target.value || null });
                        }}
                        className="input w-full"
                        placeholder="Discord category ID"
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Closed Category ID</label>
                      <input
                        defaultValue={panel.category_closed_id}
                        onBlur={async e => {
                          if (!guildId || !panel.id) return;
                          await ticketApi.updatePanel(guildId, panel.id, { category_closed_id: e.target.value || null });
                        }}
                        className="input w-full"
                        placeholder="Discord category ID (for archived tickets)"
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Overflow Category ID</label>
                      <input
                        defaultValue={panel.overflow_category_id}
                        onBlur={async e => {
                          if (!guildId || !panel.id) return;
                          await ticketApi.updatePanel(guildId, panel.id, { overflow_category_id: e.target.value || null });
                        }}
                        className="input w-full"
                        placeholder="Used when open category hits 50 channels"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block font-medium mb-1">Stack Group</label>
                      <input
                        defaultValue={panel.stack_group || ''}
                        onBlur={async e => {
                          if (!guildId || !panel.id) return;
                          const val = e.target.value.trim() || null;
                          const updated = await ticketApi.updatePanel(guildId, panel.id, { stack_group: val });
                          setPanels(prev => prev.map(p => p.id === panel.id ? { ...p, ...updated } : p));
                        }}
                        className="input w-full"
                        placeholder="e.g. main-tickets (leave blank for standalone)"
                      />
                      <p className="text-xs text-discord-light mt-1">
                        Panels sharing the same stack group name deploy together as one Discord message.
                        Use <code className="bg-discord-dark px-1 rounded">/ticket panel send</code> with any panel in the group.
                      </p>
                    </div>
                  </div>

                  {/* Categories */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-sm">
                        Categories ({panel.categories?.length || 0}/5)
                      </h4>
                      <button
                        onClick={() => panel.id && addCategory(panel.id)}
                        className="btn btn-secondary text-xs flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add Category
                      </button>
                    </div>

                    <div className="space-y-2">
                      {(panel.categories || []).map(cat => (
                        <div key={cat.id} className="bg-discord-dark rounded-lg">
                          {/* Category row */}
                          <div className="flex items-center gap-3 p-3">
                            <span className="text-xl">{cat.emoji || '🎫'}</span>
                            <div className="flex-1">
                              <p className="font-medium text-sm">{cat.name}</p>
                              <p className="text-xs text-discord-light">{cat.description || '(no description)'}</p>
                            </div>
                            <span className="text-xs text-discord-light flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              {cat.form_fields?.length || 0} fields
                            </span>
                            <button
                              onClick={() => {
                                if (!cat.id) return;
                                setPanels(prev => prev.map(p => p.id === panel.id ? {
                                  ...p,
                                  categories: (p.categories || []).map(c =>
                                    c.id === cat.id ? { ...c, _expanded: !c._expanded } : c
                                  ),
                                } : p));
                              }}
                              className="text-xs text-discord-light hover:text-white transition-colors px-2 py-1 rounded"
                            >
                              {cat._expanded ? 'Hide' : 'Edit Form'}
                            </button>
                            <button
                              onClick={() => guildId && cat.id && panel.id && deleteCategory(guildId, cat.id, panel.id)}
                              className="p-1 text-discord-light hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Form builder */}
                          {cat._expanded && (
                            <div className="border-t border-discord-mid px-3 pb-3 pt-2 space-y-2">
                              <p className="text-xs text-discord-light mb-2">
                                Form fields shown to users when they open this ticket type (max 5).
                              </p>
                              {(cat.form_fields || []).map(field => (
                                <div key={field.id} className="flex items-center gap-2 bg-discord-mid rounded p-2">
                                  <div className="flex-1">
                                    <span className="text-sm font-medium">{field.label}</span>
                                    <span className="text-xs text-discord-light ml-2">
                                      ({field.style}, {field.required ? 'required' : 'optional'})
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => guildId && field.id && cat.id && panel.id && deleteFormField(field.id, cat.id, panel.id)}
                                    className="text-discord-light hover:text-red-400 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                              {(cat.form_fields?.length || 0) < 5 && (
                                <button
                                  onClick={() => guildId && cat.id && panel.id && addFormField(cat.id, panel.id)}
                                  className="btn btn-secondary text-xs w-full flex items-center justify-center gap-1"
                                >
                                  <Plus className="w-3 h-3" /> Add Question
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <p className="text-xs text-discord-light">
                    After configuring, use <code className="bg-discord-dark px-1 rounded">/ticket panel send panel_id:{panel.id} #channel</code> to deploy.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── SETTINGS TAB ── */}
      {activeTab === 'settings' && (
        <div className="card space-y-4">
          <h3 className="font-semibold">Global Ticket Settings</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Transcript Channel ID</label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-discord-light" />
                <input
                  value={config.transcript_channel_id}
                  onChange={e => setConfig(c => ({ ...c, transcript_channel_id: e.target.value }))}
                  className="input w-full pl-9"
                  placeholder="Channel ID for transcripts"
                />
              </div>
              <p className="text-xs text-discord-light mt-1">Transcripts posted here when tickets close</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Max Tickets Per User</label>
              <input
                type="number"
                value={config.max_tickets_per_user}
                onChange={e => setConfig(c => ({ ...c, max_tickets_per_user: parseInt(e.target.value) || 1 }))}
                className="input w-full"
                min="1" max="10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Auto-Close After (hours)</label>
              <input
                type="number"
                value={config.auto_close_hours}
                onChange={e => setConfig(c => ({ ...c, auto_close_hours: parseInt(e.target.value) || 0 }))}
                className="input w-full"
                min="0"
              />
              <p className="text-xs text-discord-light mt-1">0 = never auto-close</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Welcome Message</label>
            <textarea
              value={config.welcome_message}
              onChange={e => setConfig(c => ({ ...c, welcome_message: e.target.value }))}
              className="input w-full h-24 resize-none"
              placeholder="Message shown when ticket is created..."
            />
          </div>
        </div>
      )}

      {/* ── ACTIVE TICKETS TAB ── */}
      {activeTab === 'tickets' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Active Tickets</h3>
            <button onClick={fetchData} className="btn btn-secondary text-xs flex items-center gap-1">
              Refresh
            </button>
          </div>

          {activeTickets.length === 0 ? (
            <div className="text-center py-8 text-discord-light">
              <Ticket className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No active tickets</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeTickets.map(ticket => (
                <div key={ticket.id} className="flex items-center gap-4 bg-discord-dark rounded-lg p-3">
                  <Hash className="w-5 h-5 text-discord-light flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">
                        #{ticket.ticket_number.toString().padStart(4, '0')}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs capitalize ${getStatusBadge(ticket.status)}`}>
                        {ticket.status}
                      </span>
                      {ticket.panel_name && (
                        <span className="text-xs text-discord-light">{ticket.panel_name}</span>
                      )}
                      {ticket.category_name && (
                        <span className="text-xs text-discord-light">/ {ticket.category_name}</span>
                      )}
                    </div>
                    <p className="text-xs text-discord-light truncate">
                      {`<@${ticket.user_id}>`}
                      {ticket.claimed_by && ` • Claimed by <@${ticket.claimed_by}>`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-discord-light flex-shrink-0">
                    <Clock className="w-3.5 h-3.5" />
                    {formatTime(ticket.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
