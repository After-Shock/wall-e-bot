import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { Terminal, Plus, Trash2, Search, Save, Edit, Info } from 'lucide-react';

interface CustomCommand {
  id: number;
  name: string;
  response: string;
  embed_response: boolean;
  embed_color: string | null;
  cooldown: number;
  delete_command: boolean;
  case_sensitive: boolean;
  trigger_on_edit: boolean;
  enabled: boolean;
  uses: number;
  created_at: string;
}

const emptyCommand = (): Partial<CustomCommand> => ({
  name: '',
  response: '',
  embed_response: false,
  embed_color: null,
  cooldown: 0,
  delete_command: false,
  case_sensitive: false,
  trigger_on_edit: false,
  enabled: true,
});

const variables = [
  { name: '{user}', desc: 'User mention' },
  { name: '{username}', desc: 'Username' },
  { name: '{server}', desc: 'Server name' },
  { name: '{channel}', desc: 'Channel name' },
  { name: '{args}', desc: 'All arguments' },
  { name: '{args.1}', desc: 'First argument' },
];

function Toggle({ label, description, checked, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-discord-light">{description}</div>
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

function extractApiError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string; message?: string } } };
  return e?.response?.data?.error ?? e?.response?.data?.message ?? 'Failed to save command.';
}

interface CodeMirrorEditorHandle {
  insertAtCursor: (text: string) => void;
}

const cmTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: '#dcddde',
    fontSize: '13px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    minHeight: '12rem',
  },
  '.cm-content': {
    padding: '8px',
    caretColor: '#ffffff',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: '#5865f2 !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: '#5865f2 !important',
  },
  '.cm-cursor': {
    borderLeftColor: '#ffffff',
  },
});

const CodeMirrorEditor = forwardRef<CodeMirrorEditorHandle, { value: string; onChange: (v: string) => void }>(
  function CodeMirrorEditor({ value, onChange }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeCb = useCallback((v: string) => onChange(v), [onChange]);

    useImperativeHandle(ref, () => ({
      insertAtCursor: (text: string) => {
        const view = viewRef.current;
        if (!view) return;
        const { from } = view.state.selection.main;
        view.dispatch({
          changes: { from, insert: text },
          selection: { anchor: from + text.length },
        });
      },
    }));

  useEffect(() => {
    if (!containerRef.current) return;

    const startState = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        oneDark,
        cmTheme,
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            onChangeCb(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: containerRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Mount once only

  // Sync external value changes (variable button clicks) without losing cursor position
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="input w-full min-h-48"
      style={{ padding: 0 }}
    />
  );
}
);

export default function CustomCommandsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const queryClient = useQueryClient();
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

  const { data: commands = [], isLoading } = useQuery<CustomCommand[]>({
    queryKey: ['custom-commands', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/custom-commands`).then(r => r.data),
  });

  const createCmd = useMutation({
    mutationFn: (data: Partial<CustomCommand>) =>
      api.post(`/api/guilds/${guildId}/custom-commands`, data).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-commands', guildId] }),
    onError: (err: unknown) => setSaveError(extractApiError(err)),
  });

  const updateCmd = useMutation({
    mutationFn: ({ id, ...data }: Partial<CustomCommand> & { id: number }) =>
      api.patch(`/api/guilds/${guildId}/custom-commands/${id}`, data).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-commands', guildId] }),
    onError: (err: unknown) => setSaveError(extractApiError(err)),
  });

  const deleteCmd = useMutation({
    mutationFn: (id: number) =>
      api.delete(`/api/guilds/${guildId}/custom-commands/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-commands', guildId] }),
  });

  const editorRef = useRef<CodeMirrorEditorHandle>(null);
  const [editingCommand, setEditingCommand] = useState<Partial<CustomCommand> | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  const filteredCommands = commands.filter(cmd =>
    cmd.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const createNewCommand = () => {
    setSaveError(null);
    setEditingCommand(emptyCommand());
    setShowEditor(true);
  };

  const saveCommand = () => {
    if (!editingCommand?.name || !editingCommand?.response) return;
    setSaveError(null);
    if ((editingCommand as CustomCommand).id) {
      updateCmd.mutate(editingCommand as CustomCommand, {
        onSuccess: () => { setShowEditor(false); setEditingCommand(null); },
      });
    } else {
      createCmd.mutate(editingCommand, {
        onSuccess: () => { setShowEditor(false); setEditingCommand(null); },
      });
    }
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

      {/* Prefix Settings */}
      <div className="card">
        <h3 className="font-semibold mb-1">Command Prefix</h3>
        <p className="text-sm text-discord-light mb-3">The symbol users type before a custom command name (e.g. <code className="bg-discord-dark px-1 rounded">!rules</code>)</p>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={prefixInput}
            onChange={e => setPrefixInput(e.target.value.slice(0, 5))}
            className="input w-24 text-center font-mono text-lg"
            placeholder="!"
            maxLength={5}
          />
          <button
            onClick={() => savePrefix.mutate(prefixInput)}
            disabled={savePrefix.isPending || !prefixInput || prefixInput === generalConfig?.prefix}
            className="btn btn-primary disabled:opacity-50"
          >
            {prefixSaved ? '✓ Saved' : 'Save'}
          </button>
          {prefixInput !== generalConfig?.prefix && prefixInput && (
            <span className="text-sm text-discord-light">
              Commands will use: <code className="bg-discord-dark px-1 rounded">{prefixInput}commandname</code>
            </span>
          )}
        </div>
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
          {isLoading ? (
            <div className="card text-center py-12">
              <div className="w-10 h-10 border-4 border-discord-blurple border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-discord-light">Loading commands...</p>
            </div>
          ) : (
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
                          onClick={() => updateCmd.mutate({ id: cmd.id, enabled: !cmd.enabled })}
                          disabled={updateCmd.isPending}
                          className={`relative w-10 h-5 rounded-full transition-colors disabled:opacity-50 ${
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
                          <div className="flex items-center gap-2 flex-wrap">
                            <code className="text-discord-blurple font-semibold">{generalConfig?.prefix ?? '!'}{cmd.name}</code>
                            {cmd.cooldown > 0 && (
                              <span className="text-xs bg-discord-dark px-2 py-0.5 rounded">
                                {cmd.cooldown}s cooldown
                              </span>
                            )}
                            <span className="text-xs text-discord-light">
                              {cmd.uses} uses
                            </span>
                          </div>
                          <p className="text-sm text-discord-light truncate max-w-md">
                            {cmd.response.length > 100 ? cmd.response.slice(0, 100) + '...' : cmd.response}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSaveError(null);
                            setEditingCommand(cmd);
                            setShowEditor(true);
                          }}
                          className="btn btn-secondary"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete command "${generalConfig?.prefix ?? '!'}${cmd.name}"? This cannot be undone.`)) {
                              deleteCmd.mutate(cmd.id);
                            }
                          }}
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
                    {generalConfig?.prefix ?? '!'}
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
                  value={editingCommand?.cooldown ?? 0}
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
                    checked={!(editingCommand?.embed_response)}
                    onChange={() => setEditingCommand(prev => prev ? { ...prev, embed_response: false } : null)}
                    className="w-4 h-4"
                  />
                  <span>Plain Text</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={!!(editingCommand?.embed_response)}
                    onChange={() => setEditingCommand(prev => prev ? { ...prev, embed_response: true } : null)}
                    className="w-4 h-4"
                  />
                  <span>Embed</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Response</label>
              <div className="relative">
                <CodeMirrorEditor
                  ref={editorRef}
                  value={editingCommand?.response || ''}
                  onChange={value => setEditingCommand(prev => prev ? { ...prev, response: value } : null)}
                />
                <span className={`absolute bottom-1 right-3 text-xs pointer-events-none z-10 ${
                  (editingCommand?.response?.length ?? 0) >= 1900 ? 'text-red-400' : 'text-discord-light'
                }`}>
                  {editingCommand?.response?.length ?? 0} / 2000
                </span>
              </div>
            </div>
          </div>

          {/* Behavior Toggles */}
          <div className="card">
            <h3 className="font-semibold mb-2">Behavior</h3>
            <div className="divide-y divide-discord-dark">
              <Toggle
                label="Enabled"
                description="Allow this command to be triggered"
                checked={editingCommand?.enabled ?? true}
                onChange={v => setEditingCommand(prev => prev ? { ...prev, enabled: v } : null)}
              />
              <Toggle
                label="Case Sensitive"
                description="Require exact capitalization to trigger (e.g. !Rules won't match !rules)"
                checked={editingCommand?.case_sensitive ?? false}
                onChange={v => setEditingCommand(prev => prev ? { ...prev, case_sensitive: v } : null)}
              />
              <Toggle
                label="Trigger on Message Edits"
                description="Also fire when a user edits a message to start with this command"
                checked={editingCommand?.trigger_on_edit ?? false}
                onChange={v => setEditingCommand(prev => prev ? { ...prev, trigger_on_edit: v } : null)}
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
                    if (editorRef.current) {
                      editorRef.current.insertAtCursor(v.name);
                    } else {
                      setEditingCommand(prev => prev ? {
                        ...prev,
                        response: (prev.response || '') + v.name,
                      } : null);
                    }
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
          <div className="space-y-2">
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
                disabled={!editingCommand?.name || !editingCommand?.response || createCmd.isPending || updateCmd.isPending}
                className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {createCmd.isPending || updateCmd.isPending ? 'Saving...' : 'Save Command'}
              </button>
            </div>
            {saveError && (
              <p className="text-sm text-red-400">{saveError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
