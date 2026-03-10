import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Ticket, Save, Plus, Trash2, Hash, Clock,
  ChevronDown, ChevronRight, FileText, Loader2, Send, Pencil
} from 'lucide-react';
import { ticketApi, api } from '../../services/api';

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
  group_id: number | null;
  stack_position: number;
  panel_channel_id: string | null;
  panel_message_id: string | null;
  categories?: Category[];
  _expanded?: boolean;
}

interface PanelGroup {
  id: number;
  guild_id: string;
  name: string;
  last_channel_id: string | null;
  last_message_id: string | null;
  panels: Panel[];
}

interface DiscordChannel {
  id: string;
  name: string;
  parent_id: string | null;
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

// ─── Helper Components ────────────────────────────────────────────────────────

function SendChannelModal({
  channels, defaultChannelId, isPending, error, onSend, onClose,
}: {
  channels: DiscordChannel[];
  defaultChannelId: string | null;
  isPending: boolean;
  error: string | null;
  onSend: (channelId: string) => void;
  onClose: () => void;
}) {
  const [channelId, setChannelId] = useState(defaultChannelId ?? '');

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="card w-full max-w-md space-y-4">
        <h3 className="font-semibold">Send to Channel</h3>
        <div>
          <label className="block text-sm font-medium mb-1">Channel</label>
          <select value={channelId} onChange={e => setChannelId(e.target.value)} className="input w-full">
            <option value="">— Select channel —</option>
            {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
          </select>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button
            onClick={() => { if (channelId) onSend(channelId); }}
            disabled={!channelId || isPending}
            className="btn btn-primary"
          >
            {isPending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PanelSendButton({ panel, channels, guildId, onAfterSend }: {
  panel: Panel; channels: DiscordChannel[]; guildId: string; onAfterSend?: () => void;
}) {
  const queryClient = useQueryClient();
  const [showSend, setShowSend] = useState(false);
  const sendMutation = useMutation({
    mutationFn: (channelId: string) => ticketApi.sendPanel(guildId, panel.id!, { channel_id: channelId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket-panels', guildId] });
      setShowSend(false);
      onAfterSend?.();
    },
  });
  return (
    <>
      <button onClick={() => setShowSend(true)} className="btn btn-secondary p-1.5" title="Send to channel">
        <Send className="w-4 h-4" />
      </button>
      {showSend && (
        <SendChannelModal
          key={panel.panel_channel_id ?? 'new'}
          channels={channels}
          defaultChannelId={panel.panel_channel_id ?? null}
          isPending={sendMutation.isPending}
          error={sendMutation.error ? ((sendMutation.error as any)?.response?.data?.error ?? 'Failed to send') : null}
          onSend={channelId => sendMutation.mutate(channelId)}
          onClose={() => setShowSend(false)}
        />
      )}
    </>
  );
}

function GroupCard({
  group, channels, guildId, onDelete, onRemovePanel, onSwap,
}: {
  group: PanelGroup;
  channels: DiscordChannel[];
  guildId: string;
  onDelete: () => void;
  onRemovePanel: (panelId: number) => void;
  onSwap: (panelId1: number, groupId1: number, pos1: number, panelId2: number, groupId2: number, pos2: number) => void;
}) {
  const queryClient = useQueryClient();
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(group.name);
  const [showSend, setShowSend] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (name: string) => ticketApi.updateGroup(guildId, group.id, { name }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ticket-groups', guildId] }); setEditingName(false); },
  });

  const sendMutation = useMutation({
    mutationFn: (channelId: string) => ticketApi.sendGroup(guildId, group.id, { channel_id: channelId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ticket-groups', guildId] }); setShowSend(false); },
  });

  const sorted = [...group.panels].sort((a, b) => a.stack_position - b.stack_position);

  const move = (panelId: number, dir: -1 | 1) => {
    const idx = sorted.findIndex(p => p.id === panelId);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    onSwap(
      sorted[idx].id!, sorted[idx].group_id!, sorted[swapIdx].stack_position,
      sorted[swapIdx].id!, sorted[swapIdx].group_id!, sorted[idx].stack_position,
    );
  };

  return (
    <div className="card border border-discord-blurple/20 space-y-3">
      <div className="flex items-center gap-2">
        {editingName ? (
          <input
            value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            className="input flex-1"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter' && nameVal.trim()) updateMutation.mutate(nameVal.trim());
              if (e.key === 'Escape') { setEditingName(false); setNameVal(group.name); }
            }}
          />
        ) : (
          <h4 className="font-semibold flex-1">{group.name}</h4>
        )}
        <button onClick={() => setEditingName(v => !v)} className="btn btn-secondary p-1.5" title="Rename">
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowSend(true)}
          className="btn btn-primary flex items-center gap-2 text-sm"
        >
          <Send className="w-4 h-4" />
          {group.last_channel_id ? 'Re-send' : 'Send to Channel'}
        </button>
        <button
          onClick={() => window.confirm(`Disband "${group.name}"? Panels will become ungrouped.`) && onDelete()}
          className="btn bg-red-500/20 text-red-400 hover:bg-red-500/30 p-1.5"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {sorted.length === 0 && (
        <p className="text-sm text-discord-light">No panels yet. Use "Add to group…" on an ungrouped panel.</p>
      )}

      {sorted.map((panel, idx) => (
        <div key={panel.id} className="flex items-center gap-2 bg-discord-darker rounded-lg px-3 py-2">
          <div className="flex flex-col">
            <button
              onClick={() => move(panel.id!, -1)}
              disabled={idx === 0}
              className="text-discord-light hover:text-white disabled:opacity-30 text-xs leading-tight"
            >▲</button>
            <button
              onClick={() => move(panel.id!, 1)}
              disabled={idx === sorted.length - 1}
              className="text-discord-light hover:text-white disabled:opacity-30 text-xs leading-tight"
            >▼</button>
          </div>
          <span className="flex-1 font-medium text-sm">{panel.name}</span>
          <span className="text-xs text-discord-light">
            {panel.panel_type} · {panel.categories?.length ?? 0} categories
          </span>
          <button
            onClick={() => onRemovePanel(panel.id!)}
            className="btn btn-secondary text-xs py-0.5 px-2"
          >Remove</button>
        </div>
      ))}

      {showSend && (
        <SendChannelModal
          key={group.last_channel_id ?? 'new'}
          channels={channels}
          defaultChannelId={group.last_channel_id}
          isPending={sendMutation.isPending}
          error={sendMutation.error ? ((sendMutation.error as any)?.response?.data?.error ?? 'Failed to send') : null}
          onSend={channelId => sendMutation.mutate(channelId)}
          onClose={() => setShowSend(false)}
        />
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

type Tab = 'panels' | 'settings' | 'tickets';

export default function TicketsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const queryClient = useQueryClient();
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

  // Groups state
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const { data: groups = [] } = useQuery<PanelGroup[]>({
    queryKey: ['ticket-groups', guildId],
    queryFn: () => ticketApi.getGroups(guildId!),
    enabled: !!guildId,
  });

  const { data: channels = [] } = useQuery<DiscordChannel[]>({
    queryKey: ['channels', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/channels`).then(r => r.data),
    enabled: !!guildId,
  });

  const invalidateGroups = () => queryClient.invalidateQueries({ queryKey: ['ticket-groups', guildId] });
  const invalidatePanels = () => queryClient.invalidateQueries({ queryKey: ['ticket-panels', guildId] });

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

  const createGroupMutation = useMutation({
    mutationFn: (name: string) => ticketApi.createGroup(guildId!, { name }),
    onSuccess: () => { invalidateGroups(); setShowNewGroup(false); setNewGroupName(''); },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (groupId: number) => ticketApi.deleteGroup(guildId!, groupId),
    onSuccess: () => { invalidateGroups(); invalidatePanels(); fetchData(); },
  });

  const assignGroupMutation = useMutation({
    mutationFn: ({ panelId, groupId, position }: { panelId: number; groupId: number | null; position: number }) =>
      ticketApi.assignPanelGroup(guildId!, panelId, { group_id: groupId, stack_position: position }),
    onSuccess: () => { invalidateGroups(); invalidatePanels(); fetchData(); },
  });

  const ungroupedPanels = panels.filter(p => p.group_id == null);

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
        <div className="space-y-6">
          {/* Groups section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-discord-light uppercase tracking-wider">Groups</h3>
              <button
                onClick={() => setShowNewGroup(true)}
                className="btn btn-secondary flex items-center gap-1 text-xs py-1 px-2"
              >
                <Plus className="w-3 h-3" /> New Group
              </button>
            </div>

            {showNewGroup && (
              <div className="card flex items-center gap-2 border border-discord-blurple/30">
                <input
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  placeholder="Group name"
                  className="input flex-1"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newGroupName.trim()) createGroupMutation.mutate(newGroupName.trim());
                    if (e.key === 'Escape') { setShowNewGroup(false); setNewGroupName(''); }
                  }}
                />
                <button
                  onClick={() => { if (newGroupName.trim()) createGroupMutation.mutate(newGroupName.trim()); }}
                  disabled={!newGroupName.trim() || createGroupMutation.isPending}
                  className="btn btn-primary text-sm"
                >Create</button>
                <button onClick={() => { setShowNewGroup(false); setNewGroupName(''); }} className="btn btn-secondary text-sm">Cancel</button>
              </div>
            )}

            {groups.length === 0 && !showNewGroup && (
              <p className="text-sm text-discord-light">
                No groups yet. Create a group to deploy multiple panels as one Discord message.
              </p>
            )}

            {groups.map(group => (
              <GroupCard
                key={group.id}
                group={group}
                channels={channels}
                guildId={guildId!}
                onDelete={() => deleteGroupMutation.mutate(group.id)}
                onRemovePanel={panelId => assignGroupMutation.mutate({ panelId, groupId: null, position: 0 })}
                onSwap={async (id1, gid1, pos1, id2, gid2, pos2) => {
                  await ticketApi.assignPanelGroup(guildId!, id1, { group_id: gid1, stack_position: pos1 });
                  await ticketApi.assignPanelGroup(guildId!, id2, { group_id: gid2, stack_position: pos2 });
                  invalidateGroups();
                  invalidatePanels();
                  fetchData();
                }}
              />
            ))}
          </div>

          {/* Ungrouped Panels section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-discord-light uppercase tracking-wider">Ungrouped Panels</h3>
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

            {ungroupedPanels.length === 0 && !showNewPanel && (
              <p className="text-sm text-discord-light">No ungrouped panels.</p>
            )}

            {ungroupedPanels.map(panel => (
              <div key={panel.id} className="card">
                {/* Panel header */}
                <div className="flex items-center gap-3">
                  <button onClick={() => panel.id && togglePanel(panel.id)} className="flex items-center gap-2 flex-1 text-left">
                    {panel._expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <span className="font-semibold">{panel.name}</span>
                    <span className="text-xs text-discord-light bg-discord-dark px-2 py-0.5 rounded">
                      {panel.style} / {panel.panel_type}
                    </span>
                    <span className="text-xs text-discord-light">
                      {panel.categories?.length || 0} categories
                    </span>
                  </button>
                  <select
                    value=""
                    onChange={e => {
                      if (e.target.value)
                        assignGroupMutation.mutate({ panelId: panel.id!, groupId: parseInt(e.target.value, 10), position: 0 });
                    }}
                    className="input text-xs py-1 h-auto"
                  >
                    <option value="">Add to group…</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  <PanelSendButton panel={panel} channels={channels} guildId={guildId!} onAfterSend={fetchData} />
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
                      After configuring, use the Send button above to deploy this panel to a channel.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
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
