import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import {
  Terminal, Plus, Trash2, Search, Save, Edit, Info, ChevronDown, ChevronRight,
  FolderPlus, Folder, Clock, Zap, Hash, AlignLeft, Code2, X,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type TriggerType = 'command' | 'starts_with' | 'contains' | 'exact_match' | 'regex' | 'reaction' | 'interval';

interface CommandGroup {
  id: number;
  guild_id: string;
  name: string;
  description?: string;
  allowed_roles: string[];
  allowed_channels: string[];
  ignore_roles: string[];
  ignore_channels: string[];
  position: number;
}

interface CustomCommand {
  id: number;
  guild_id: string;
  name: string;
  trigger_type: TriggerType;
  group_id: number | null;
  responses: string[];
  embed_response: boolean;
  embed_color: string | null;
  cooldown: number;
  delete_command: boolean;
  case_sensitive: boolean;
  trigger_on_edit: boolean;
  enabled: boolean;
  allowed_roles: string[];
  allowed_channels: string[];
  interval_cron: string | null;
  interval_channel_id: string | null;
  reaction_message_id: string | null;
  reaction_channel_id: string | null;
  reaction_emoji: string | null;
  reaction_type: 'add' | 'remove' | 'both' | null;
  uses: number;
  created_at: string;
}

const emptyCommand = (): Partial<CustomCommand> => ({
  name: '',
  trigger_type: 'command',
  group_id: null,
  responses: [''],
  embed_response: false,
  embed_color: null,
  cooldown: 0,
  delete_command: false,
  case_sensitive: false,
  trigger_on_edit: false,
  enabled: true,
  allowed_roles: [],
  allowed_channels: [],
  interval_cron: null,
  interval_channel_id: null,
  reaction_message_id: null,
  reaction_channel_id: null,
  reaction_emoji: null,
  reaction_type: 'add',
});

const emptyGroup = (): Partial<CommandGroup> => ({
  name: '',
  description: '',
  allowed_roles: [],
  allowed_channels: [],
  ignore_roles: [],
  ignore_channels: [],
  position: 0,
});

// ─── Trigger type metadata ────────────────────────────────────────────────────

const TRIGGER_TYPES: { value: TriggerType; label: string; color: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'command',     label: 'Command',     color: 'bg-discord-blurple/20 text-discord-blurple', icon: Terminal },
  { value: 'starts_with', label: 'Starts With', color: 'bg-gray-500/20 text-gray-400',               icon: AlignLeft },
  { value: 'contains',    label: 'Contains',    color: 'bg-gray-500/20 text-gray-400',               icon: Hash },
  { value: 'exact_match', label: 'Exact Match', color: 'bg-gray-500/20 text-gray-400',               icon: AlignLeft },
  { value: 'regex',       label: 'Regex',       color: 'bg-orange-500/20 text-orange-400',           icon: Code2 },
  { value: 'reaction',    label: 'Reaction',    color: 'bg-pink-500/20 text-pink-400',               icon: Zap },
  { value: 'interval',    label: 'Interval',    color: 'bg-green-500/20 text-green-400',             icon: Clock },
];

const TEMPLATE_VARS = [
  { name: '{{user}}',        desc: 'User mention' },
  { name: '{{username}}',    desc: 'Display name' },
  { name: '{{userId}}',      desc: 'User ID' },
  { name: '{{server}}',      desc: 'Server name' },
  { name: '{{memberCount}}', desc: 'Member count' },
  { name: '{{channel}}',     desc: 'Channel name' },
  { name: '{{channelId}}',   desc: 'Channel ID' },
  { name: '{{args}}',        desc: 'All arguments' },
  { name: '{{args.[0]}}',    desc: 'First argument' },
  { name: '{{randint 1 100}}', desc: 'Random int' },
  { name: '{{choose "a" "b"}}', desc: 'Random pick' },
  { name: '{{upper username}}', desc: 'Uppercase' },
  { name: '{{lower username}}', desc: 'Lowercase' },
  { name: '{{time "HH:mm"}}',   desc: 'Current time' },
  { name: '{{date "YYYY-MM-DD"}}', desc: 'Current date' },
];

// ─── CodeMirror editor ────────────────────────────────────────────────────────

interface CMHandle { insertAtCursor: (text: string) => void; }

const cmTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: '#dcddde', fontSize: '13px',
         fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', minHeight: '8rem' },
  '.cm-content': { padding: '8px', caretColor: '#ffffff' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground': { backgroundColor: '#5865f2 !important' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: '#5865f2 !important' },
  '.cm-cursor': { borderLeftColor: '#ffffff' },
});

const CodeMirrorEditor = forwardRef<CMHandle, { value: string; onChange: (v: string) => void }>(
  function CodeMirrorEditor({ value, onChange }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeCb = useCallback((v: string) => onChange(v), [onChange]);

    useImperativeHandle(ref, () => ({
      insertAtCursor: (text: string) => {
        const view = viewRef.current;
        if (!view) return;
        const { from } = view.state.selection.main;
        view.dispatch({ changes: { from, insert: text }, selection: { anchor: from + text.length } });
      },
    }));

    useEffect(() => {
      if (!containerRef.current) return;
      const view = new EditorView({
        state: EditorState.create({
          doc: value,
          extensions: [
            history(), keymap.of([...defaultKeymap, ...historyKeymap]),
            EditorView.lineWrapping, oneDark, cmTheme,
            EditorView.updateListener.of(u => { if (u.docChanged) onChangeCb(u.state.doc.toString()); }),
          ],
        }),
        parent: containerRef.current,
      });
      viewRef.current = view;
      return () => { view.destroy(); viewRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const current = view.state.doc.toString();
      if (current !== value) {
        view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
      }
    }, [value]);

    return <div ref={containerRef} className="input w-full min-h-32" style={{ padding: 0 }} />;
  },
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useMobile() {
  const [m, setM] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const h = () => setM(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return m;
}

function extractApiError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string; message?: string } } };
  return e?.response?.data?.error ?? e?.response?.data?.message ?? 'Failed to save.';
}

function TriggerBadge({ type }: { type: TriggerType }) {
  const t = TRIGGER_TYPES.find(x => x.value === type)!;
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${t.color}`}>
      {t.label.toUpperCase()}
    </span>
  );
}

function Toggle({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs text-discord-light">{description}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${checked ? 'bg-green-500' : 'bg-discord-dark'}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CustomCommandsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const queryClient = useQueryClient();
  const isMobile = useMobile();

  // ── Prefix ──
  const [prefixInput, setPrefixInput] = useState('');
  const [prefixSaved, setPrefixSaved] = useState(false);

  const { data: generalConfig } = useQuery<{ prefix: string }>({
    queryKey: ['guild-general', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/config/general`).then(r => r.data),
  });

  useEffect(() => {
    if (generalConfig?.prefix) setPrefixInput(generalConfig.prefix);
  }, [generalConfig?.prefix]);

  const savePrefix = useMutation({
    mutationFn: (prefix: string) => api.patch(`/api/guilds/${guildId}/config/general`, { prefix }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guild-general', guildId] });
      setPrefixSaved(true);
      setTimeout(() => setPrefixSaved(false), 2000);
    },
  });

  // ── Data ──
  const { data: commands = [], isLoading: cmdsLoading } = useQuery<CustomCommand[]>({
    queryKey: ['custom-commands', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/custom-commands`).then(r => r.data),
  });

  const { data: groups = [], isLoading: grpsLoading } = useQuery<CommandGroup[]>({
    queryKey: ['command-groups', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/command-groups`).then(r => r.data),
  });

  // ── UI state ──
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [editingCommand, setEditingCommand] = useState<Partial<CustomCommand> | null>(null);
  const [editingGroup, setEditingGroup] = useState<Partial<CommandGroup> | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<number | 'new' | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showTemplateRef, setShowTemplateRef] = useState(false);
  const [regexValid, setRegexValid] = useState<boolean | null>(null);
  const editorRefs = useRef<(CMHandle | null)[]>([]);

  // ── Mutations ──
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['custom-commands', guildId] });
  };
  const invalidateGroups = () => {
    queryClient.invalidateQueries({ queryKey: ['command-groups', guildId] });
  };

  const createCmd = useMutation({
    mutationFn: (data: Partial<CustomCommand>) =>
      api.post(`/api/guilds/${guildId}/custom-commands`, data).then(r => r.data),
    onSuccess: () => { invalidate(); setEditingCommand(null); setSaveError(null); },
    onError: (err) => setSaveError(extractApiError(err)),
  });

  const updateCmd = useMutation({
    mutationFn: ({ id, ...data }: Partial<CustomCommand> & { id: number }) =>
      api.patch(`/api/guilds/${guildId}/custom-commands/${id}`, data).then(r => r.data),
    onSuccess: () => { invalidate(); setEditingCommand(null); setSaveError(null); },
    onError: (err) => setSaveError(extractApiError(err)),
  });

  const deleteCmd = useMutation({
    mutationFn: (id: number) => api.delete(`/api/guilds/${guildId}/custom-commands/${id}`),
    onSuccess: () => invalidate(),
  });

  const toggleCmd = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      api.patch(`/api/guilds/${guildId}/custom-commands/${id}`, { enabled }),
    onSuccess: () => invalidate(),
  });

  const createGroup = useMutation({
    mutationFn: (data: Partial<CommandGroup>) =>
      api.post(`/api/guilds/${guildId}/command-groups`, data).then(r => r.data),
    onSuccess: () => { invalidateGroups(); setEditingGroup(null); setEditingGroupId(null); },
  });

  const updateGroup = useMutation({
    mutationFn: ({ id, ...data }: Partial<CommandGroup> & { id: number }) =>
      api.patch(`/api/guilds/${guildId}/command-groups/${id}`, data).then(r => r.data),
    onSuccess: () => { invalidateGroups(); setEditingGroup(null); setEditingGroupId(null); },
  });

  const deleteGroup = useMutation({
    mutationFn: (id: number) => api.delete(`/api/guilds/${guildId}/command-groups/${id}`),
    onSuccess: () => invalidateGroups(),
  });

  // ── Helpers ──
  const openNewCommand = (groupId?: number | null) => {
    setSaveError(null);
    setEditingCommand({ ...emptyCommand(), group_id: groupId ?? null });
  };

  const openEditCommand = (cmd: CustomCommand) => {
    setSaveError(null);
    setEditingCommand({ ...cmd });
  };

  const saveCommand = () => {
    if (!editingCommand?.name || !editingCommand?.responses?.length) return;
    setSaveError(null);
    const id = (editingCommand as CustomCommand).id;
    if (id) {
      updateCmd.mutate(editingCommand as CustomCommand);
    } else {
      createCmd.mutate(editingCommand);
    }
  };

  const updateResponse = (idx: number, value: string) => {
    setEditingCommand(prev => {
      if (!prev) return prev;
      const responses = [...(prev.responses ?? [])];
      responses[idx] = value;
      return { ...prev, responses };
    });
  };

  const addResponse = () => {
    setEditingCommand(prev => prev ? { ...prev, responses: [...(prev.responses ?? []), ''] } : prev);
  };

  const removeResponse = (idx: number) => {
    setEditingCommand(prev => {
      if (!prev) return prev;
      const responses = (prev.responses ?? []).filter((_, i) => i !== idx);
      return { ...prev, responses: responses.length ? responses : [''] };
    });
  };

  const validateRegex = (pattern: string) => {
    try { new RegExp(pattern); setRegexValid(true); }
    catch { setRegexValid(false); }
  };

  const toggleGroup = (id: number) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const saveGroup = () => {
    if (!editingGroup?.name) return;
    if (editingGroupId === 'new') {
      createGroup.mutate(editingGroup);
    } else if (typeof editingGroupId === 'number') {
      updateGroup.mutate({ ...editingGroup, id: editingGroupId } as CommandGroup);
    }
  };

  // ── Filter ──
  const filteredCommands = commands.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.responses?.some(r => r.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  const commandsByGroup = (groupId: number | null) =>
    filteredCommands.filter(c => c.group_id === groupId);

  const isLoading = cmdsLoading || grpsLoading;
  const isSaving = createCmd.isPending || updateCmd.isPending;

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: editor panel
  // ─────────────────────────────────────────────────────────────────────────────

  const renderEditor = () => {
    if (!editingCommand) return null;

    return (
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">
            {(editingCommand as CustomCommand).id ? 'Edit Command' : 'New Command'}
          </h2>
          <button
            onClick={() => { setEditingCommand(null); setSaveError(null); }}
            className="text-discord-light hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Trigger type */}
        <div className="card space-y-4">
          <h3 className="font-semibold">Trigger</h3>

          <div>
            <label className="block text-sm font-medium mb-2">Trigger Type</label>
            <select
              value={editingCommand.trigger_type ?? 'command'}
              onChange={e => setEditingCommand(prev => prev ? { ...prev, trigger_type: e.target.value as TriggerType } : prev)}
              className="input w-full"
            >
              {TRIGGER_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Trigger input — varies by type */}
          {editingCommand.trigger_type !== 'reaction' && editingCommand.trigger_type !== 'interval' && (
            <div>
              <label className="block text-sm font-medium mb-2">
                {editingCommand.trigger_type === 'command' && 'Command Name (without prefix)'}
                {editingCommand.trigger_type === 'starts_with' && 'Starts With Text'}
                {editingCommand.trigger_type === 'contains' && 'Contains Text'}
                {editingCommand.trigger_type === 'exact_match' && 'Exact Message Text'}
                {editingCommand.trigger_type === 'regex' && 'Regex Pattern'}
              </label>
              <input
                type="text"
                value={editingCommand.name ?? ''}
                onChange={e => {
                  const val = e.target.value;
                  setEditingCommand(prev => prev ? { ...prev, name: val } : prev);
                  if (editingCommand.trigger_type === 'regex') validateRegex(val);
                }}
                className={`input w-full font-mono ${
                  editingCommand.trigger_type === 'regex' && regexValid === false ? 'border-red-500' :
                  editingCommand.trigger_type === 'regex' && regexValid === true ? 'border-green-500' : ''
                }`}
                placeholder={
                  editingCommand.trigger_type === 'command' ? 'hello' :
                  editingCommand.trigger_type === 'regex' ? '^hello\\s+world$' : 'text to match'
                }
              />
              {editingCommand.trigger_type === 'regex' && regexValid === false && (
                <p className="text-xs text-red-400 mt-1">Invalid regex pattern</p>
              )}
            </div>
          )}

          {/* Reaction fields */}
          {editingCommand.trigger_type === 'reaction' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-2">Display Name</label>
                <input type="text" value={editingCommand.name ?? ''} onChange={e => setEditingCommand(prev => prev ? { ...prev, name: e.target.value } : prev)} className="input w-full" placeholder="My Reaction Command" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-2">Message ID</label>
                  <input type="text" value={editingCommand.reaction_message_id ?? ''} onChange={e => setEditingCommand(prev => prev ? { ...prev, reaction_message_id: e.target.value } : prev)} className="input w-full font-mono" placeholder="1234567890" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Channel ID</label>
                  <input type="text" value={editingCommand.reaction_channel_id ?? ''} onChange={e => setEditingCommand(prev => prev ? { ...prev, reaction_channel_id: e.target.value } : prev)} className="input w-full font-mono" placeholder="1234567890" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-2">Emoji (unicode or ID)</label>
                  <input type="text" value={editingCommand.reaction_emoji ?? ''} onChange={e => setEditingCommand(prev => prev ? { ...prev, reaction_emoji: e.target.value } : prev)} className="input w-full" placeholder="👋 or 123456789" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Trigger On</label>
                  <select value={editingCommand.reaction_type ?? 'add'} onChange={e => setEditingCommand(prev => prev ? { ...prev, reaction_type: e.target.value as 'add' | 'remove' | 'both' } : prev)} className="input w-full">
                    <option value="add">Add reaction</option>
                    <option value="remove">Remove reaction</option>
                    <option value="both">Both</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Interval fields */}
          {editingCommand.trigger_type === 'interval' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-2">Display Name</label>
                <input type="text" value={editingCommand.name ?? ''} onChange={e => setEditingCommand(prev => prev ? { ...prev, name: e.target.value } : prev)} className="input w-full" placeholder="Daily Announcement" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Cron Expression</label>
                <input type="text" value={editingCommand.interval_cron ?? ''} onChange={e => setEditingCommand(prev => prev ? { ...prev, interval_cron: e.target.value } : prev)} className="input w-full font-mono" placeholder="0 9 * * 1  (every Monday at 9am)" />
                <p className="text-xs text-discord-light mt-1">Format: minute hour day month weekday (UTC)</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Post to Channel ID</label>
                <input type="text" value={editingCommand.interval_channel_id ?? ''} onChange={e => setEditingCommand(prev => prev ? { ...prev, interval_channel_id: e.target.value } : prev)} className="input w-full font-mono" placeholder="1234567890" />
              </div>
            </div>
          )}

          {/* Group */}
          <div>
            <label className="block text-sm font-medium mb-2">Group</label>
            <select
              value={editingCommand.group_id ?? ''}
              onChange={e => setEditingCommand(prev => prev ? { ...prev, group_id: e.target.value ? Number(e.target.value) : null } : prev)}
              className="input w-full"
            >
              <option value="">— No Group —</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        </div>

        {/* Responses */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">
              Responses
              {(editingCommand.responses?.length ?? 0) > 1 && (
                <span className="ml-2 text-xs text-discord-light font-normal">(picked randomly)</span>
              )}
            </h3>
            <button onClick={addResponse} className="btn btn-secondary text-xs flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Response
            </button>
          </div>

          {(editingCommand.responses ?? ['']).map((resp, idx) => (
            <div key={idx} className="space-y-1">
              {(editingCommand.responses?.length ?? 0) > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-discord-light">Response {idx + 1}</span>
                  <button onClick={() => removeResponse(idx)} className="text-red-400 hover:text-red-300">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <div className="relative">
                {isMobile ? (
                  <textarea
                    value={resp}
                    onChange={e => updateResponse(idx, e.target.value)}
                    className="input w-full h-32 resize-y font-mono text-sm pb-6"
                    placeholder="Response text… use {{user}} for mentions"
                  />
                ) : (
                  <CodeMirrorEditor
                    ref={el => { editorRefs.current[idx] = el; }}
                    value={resp}
                    onChange={v => updateResponse(idx, v)}
                  />
                )}
                <span className={`absolute bottom-1 right-3 text-xs pointer-events-none z-10 ${resp.length >= 2400 ? 'text-red-400' : 'text-discord-light'}`}>
                  {resp.length} / 2500
                </span>
              </div>
            </div>
          ))}

          {/* Response type */}
          <div>
            <label className="block text-sm font-medium mb-2">Response Type</label>
            <div className="flex gap-4">
              {['Plain Text', 'Embed'].map((label, i) => (
                <label key={label} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={i === 0 ? !editingCommand.embed_response : !!editingCommand.embed_response}
                    onChange={() => setEditingCommand(prev => prev ? { ...prev, embed_response: i === 1 } : prev)}
                    className="w-4 h-4" />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Template reference */}
        <div className="card">
          <button
            className="flex items-center gap-2 w-full text-left"
            onClick={() => setShowTemplateRef(v => !v)}
          >
            <Info className="w-4 h-4 text-discord-blurple" />
            <span className="font-semibold text-sm">Template Variables &amp; Helpers</span>
            {showTemplateRef ? <ChevronDown className="w-4 h-4 ml-auto" /> : <ChevronRight className="w-4 h-4 ml-auto" />}
          </button>
          {showTemplateRef && (
            <div className="mt-3 flex flex-wrap gap-2">
              {TEMPLATE_VARS.map(v => (
                <button
                  key={v.name}
                  title={v.desc}
                  onClick={() => {
                    const activeIdx = 0;
                    if (editorRefs.current[activeIdx]) {
                      editorRefs.current[activeIdx]!.insertAtCursor(v.name);
                    } else {
                      updateResponse(activeIdx, (editingCommand.responses?.[activeIdx] ?? '') + v.name);
                    }
                  }}
                  className="bg-discord-dark hover:bg-discord-blurple/20 px-2 py-1 rounded text-xs font-mono transition-colors"
                >
                  {v.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Behavior */}
        <div className="card">
          <h3 className="font-semibold mb-2">Behavior</h3>
          <div className="divide-y divide-discord-dark">
            <Toggle label="Enabled" description="Allow this command to be triggered"
              checked={editingCommand.enabled ?? true}
              onChange={v => setEditingCommand(prev => prev ? { ...prev, enabled: v } : prev)} />
            {editingCommand.trigger_type !== 'interval' && editingCommand.trigger_type !== 'reaction' && (
              <>
                <Toggle label="Case Sensitive" description="Exact capitalization required"
                  checked={editingCommand.case_sensitive ?? false}
                  onChange={v => setEditingCommand(prev => prev ? { ...prev, case_sensitive: v } : prev)} />
                <Toggle label="Trigger on Message Edits" description="Fire when a message is edited"
                  checked={editingCommand.trigger_on_edit ?? false}
                  onChange={v => setEditingCommand(prev => prev ? { ...prev, trigger_on_edit: v } : prev)} />
                <Toggle label="Delete Trigger Message" description="Delete the user's message on trigger"
                  checked={editingCommand.delete_command ?? false}
                  onChange={v => setEditingCommand(prev => prev ? { ...prev, delete_command: v } : prev)} />
              </>
            )}
          </div>
        </div>

        {/* Save actions */}
        <div className="space-y-2">
          <div className="flex gap-3">
            <button onClick={() => { setEditingCommand(null); setSaveError(null); }} className="btn btn-secondary">Cancel</button>
            <button
              onClick={saveCommand}
              disabled={!editingCommand.name || !(editingCommand.responses?.some(r => r.trim())) || isSaving}
              className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving…' : 'Save Command'}
            </button>
          </div>
          {saveError && <p className="text-sm text-red-400">{saveError}</p>}
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: group editor
  // ─────────────────────────────────────────────────────────────────────────────

  const renderGroupEditor = () => {
    if (!editingGroup) return null;
    const isNew = editingGroupId === 'new';
    const saving = createGroup.isPending || updateGroup.isPending;

    return (
      <div className="card mt-2 space-y-3 border border-discord-blurple/30">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-sm">{isNew ? 'New Group' : 'Edit Group'}</h4>
          <button onClick={() => { setEditingGroup(null); setEditingGroupId(null); }} className="text-discord-light hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Name</label>
          <input type="text" value={editingGroup.name ?? ''} onChange={e => setEditingGroup(prev => prev ? { ...prev, name: e.target.value } : prev)} className="input w-full" placeholder="My Group" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Description</label>
          <input type="text" value={editingGroup.description ?? ''} onChange={e => setEditingGroup(prev => prev ? { ...prev, description: e.target.value } : prev)} className="input w-full" placeholder="Optional description" />
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setEditingGroup(null); setEditingGroupId(null); }} className="btn btn-secondary text-sm">Cancel</button>
          <button onClick={saveGroup} disabled={!editingGroup.name || saving} className="btn btn-primary text-sm disabled:opacity-50">
            {saving ? 'Saving…' : isNew ? 'Create Group' : 'Save'}
          </button>
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: command row
  // ─────────────────────────────────────────────────────────────────────────────

  const renderCommandRow = (cmd: CustomCommand) => (
    <div key={cmd.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-discord-dark/50 ${editingCommand && (editingCommand as CustomCommand).id === cmd.id ? 'bg-discord-blurple/10 border border-discord-blurple/30' : ''}`}>
      <button
        onClick={() => toggleCmd.mutate({ id: cmd.id, enabled: !cmd.enabled })}
        className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${cmd.enabled ? 'bg-green-500' : 'bg-discord-dark'}`}
      >
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${cmd.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <TriggerBadge type={cmd.trigger_type} />
          <span className="text-sm font-mono font-medium truncate">
            {cmd.trigger_type === 'command' ? `${generalConfig?.prefix ?? '!'}${cmd.name}` : cmd.name}
          </span>
          {cmd.uses > 0 && <span className="text-xs text-discord-light">{cmd.uses}×</span>}
        </div>
        <p className="text-xs text-discord-light truncate">
          {cmd.responses?.[0]?.slice(0, 60)}{(cmd.responses?.[0]?.length ?? 0) > 60 ? '…' : ''}
          {(cmd.responses?.length ?? 0) > 1 && <span className="ml-1 text-discord-blurple">+{cmd.responses.length - 1} more</span>}
        </p>
      </div>
      <div className="flex gap-1 shrink-0">
        <button onClick={() => openEditCommand(cmd)} className="btn btn-secondary p-1.5"><Edit className="w-3.5 h-3.5" /></button>
        <button
          onClick={() => window.confirm(`Delete "${cmd.name}"?`) && deleteCmd.mutate(cmd.id)}
          className="btn bg-red-500/20 text-red-400 hover:bg-red-500/30 p-1.5"
        ><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: left panel
  // ─────────────────────────────────────────────────────────────────────────────

  const renderLeft = () => (
    <div className="flex flex-col h-full">
      {/* Prefix + search */}
      <div className="p-3 border-b border-discord-dark space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-discord-light">Prefix:</span>
          <input type="text" value={prefixInput} onChange={e => setPrefixInput(e.target.value.slice(0, 5))}
            className="input w-16 text-center font-mono text-sm py-1" maxLength={5} placeholder="!" />
          <button onClick={() => savePrefix.mutate(prefixInput)}
            disabled={savePrefix.isPending || !prefixInput || prefixInput === generalConfig?.prefix}
            className="btn btn-primary text-xs py-1 px-2 disabled:opacity-50">
            {prefixSaved ? '✓' : 'Save'}
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-discord-light" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search commands…" className="input w-full pl-7 text-sm py-1.5" />
        </div>
      </div>

      {/* Command list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading ? (
          <div className="text-center py-8 text-discord-light text-sm">Loading…</div>
        ) : (
          <>
            {/* Groups */}
            {groups.map(group => {
              const groupCmds = commandsByGroup(group.id);
              const isExpanded = expandedGroups.has(group.id);
              return (
                <div key={group.id}>
                  <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-discord-dark/50 group">
                    <button onClick={() => toggleGroup(group.id)} className="flex items-center gap-1.5 flex-1 min-w-0">
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-discord-light shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-discord-light shrink-0" />}
                      <Folder className="w-3.5 h-3.5 text-discord-blurple shrink-0" />
                      <span className="text-sm font-medium truncate">{group.name}</span>
                      <span className="text-xs text-discord-light ml-1">({groupCmds.length})</span>
                    </button>
                    <div className="hidden group-hover:flex gap-1">
                      <button onClick={() => openNewCommand(group.id)} title="Add command" className="text-discord-light hover:text-white p-0.5"><Plus className="w-3.5 h-3.5" /></button>
                      <button onClick={() => { setEditingGroup({ ...group }); setEditingGroupId(group.id); }} title="Edit group" className="text-discord-light hover:text-white p-0.5"><Edit className="w-3.5 h-3.5" /></button>
                      <button onClick={() => window.confirm(`Delete group "${group.name}"?`) && deleteGroup.mutate(group.id)} title="Delete group" className="text-red-400 hover:text-red-300 p-0.5"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  {editingGroupId === group.id && renderGroupEditor()}
                  {isExpanded && (
                    <div className="ml-4 mt-1 space-y-0.5">
                      {groupCmds.map(renderCommandRow)}
                      {groupCmds.length === 0 && !searchQuery && (
                        <p className="text-xs text-discord-light px-3 py-2">No commands in this group</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Ungrouped */}
            {(() => {
              const ungrouped = commandsByGroup(null);
              return ungrouped.length > 0 || !searchQuery ? (
                <div>
                  <p className="text-xs text-discord-light px-2 py-1 uppercase tracking-wider font-semibold">
                    Ungrouped
                  </p>
                  <div className="space-y-0.5">
                    {ungrouped.map(renderCommandRow)}
                  </div>
                </div>
              ) : null;
            })()}

            {commands.length === 0 && !isLoading && (
              <div className="text-center py-8">
                <Terminal className="w-10 h-10 mx-auto text-discord-light opacity-40 mb-2" />
                <p className="text-sm text-discord-light">No commands yet</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom actions */}
      <div className="p-2 border-t border-discord-dark flex gap-2">
        <button onClick={() => openNewCommand()} className="btn btn-primary flex-1 flex items-center justify-center gap-1.5 text-sm py-2">
          <Plus className="w-4 h-4" /> New Command
        </button>
        <button
          onClick={() => { setEditingGroup(emptyGroup()); setEditingGroupId('new'); }}
          className="btn btn-secondary flex items-center gap-1 text-sm py-2 px-3" title="New Group"
        >
          <FolderPlus className="w-4 h-4" />
        </button>
      </div>
      {editingGroupId === 'new' && <div className="px-2 pb-2">{renderGroupEditor()}</div>}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-130px)] gap-0 -m-4 md:-m-6 overflow-hidden">
      {/* Left panel — command/group list */}
      <div className={`
        ${editingCommand && !isMobile ? 'w-72 border-r border-discord-dark' : 'flex-1'}
        ${editingCommand && isMobile ? 'hidden' : ''}
        flex flex-col bg-discord-darker
      `}>
        {renderLeft()}
      </div>

      {/* Right panel — editor */}
      {editingCommand && (
        <div className="flex-1 flex flex-col overflow-hidden bg-discord-dark">
          {renderEditor()}
        </div>
      )}
    </div>
  );
}
