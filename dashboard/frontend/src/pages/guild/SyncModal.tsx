import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, AlertTriangle, X, Loader2 } from 'lucide-react';
import type { AxiosError } from 'axios';
import api from '../../api/axios';

const CATEGORIES = [
  { key: 'general',    emoji: '⚙️', name: 'General',         desc: 'Welcome, leveling, starboard, prefix' },
  { key: 'moderation', emoji: '🛡️', name: 'Moderation',      desc: 'Logging, automod, spam, word filters, link protection' },
  { key: 'commands',   emoji: '🤖', name: 'Custom Commands',  desc: 'Commands & groups, triggers, responses' },
  { key: 'roles',      emoji: '🎭', name: 'Roles',            desc: 'Auto roles (reaction roles not copied)' },
  { key: 'tickets',    emoji: '🎫', name: 'Tickets',          desc: 'Panels, categories, forms, ticket config' },
  { key: 'automation', emoji: '⏰', name: 'Automation',       desc: 'Scheduled messages, auto-delete channels' },
] as const;

type CategoryKey = typeof CATEGORIES[number]['key'];

interface Props {
  guildId: string;
  sourceGuildId: string;
  sourceName: string;
  onClose: () => void;
}

type ModalState = 'idle' | 'loading' | 'success' | 'error';

export default function SyncModal({ guildId, sourceGuildId, sourceName, onClose }: Props) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<CategoryKey>>(
    new Set(CATEGORIES.map(c => c.key)),
  );
  const [modalState, setModalState] = useState<ModalState>('idle');
  const [syncedCount, setSyncedCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const mutation = useMutation({
    mutationFn: async (categories: CategoryKey[]) => {
      const response = await api.post<{ syncedCount: number }>(
        `/api/guilds/${guildId}/copy-from/${sourceGuildId}`,
        { categories },
      );
      return response.data;
    },
    onMutate: () => setModalState('loading'),
    onSuccess: (data) => {
      setSyncedCount(data.syncedCount);
      setModalState('success');
      queryClient.invalidateQueries({ queryKey: ['guild', guildId] });
    },
    onError: (error: Error) => {
      const axiosError = error as AxiosError<{ error: string }>;
      setErrorMsg(axiosError.response?.data?.error ?? error.message);
      setModalState('error');
    },
  });

  const toggleCategory = (key: CategoryKey) => {
    if (modalState !== 'idle') return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleCopy = () => {
    mutation.mutate([...selected] as CategoryKey[]);
  };

  const handleTryAgain = () => {
    setModalState('idle');
    setErrorMsg('');
  };

  const isLoading = modalState === 'loading';

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={isLoading ? undefined : onClose}
    >
      <div
        className="bg-discord-darker rounded-xl w-full max-w-lg mx-4 overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-3">
          <div>
            <h2 className="text-lg font-bold text-white">Sync Settings</h2>
            <p className="text-xs text-discord-light mt-0.5">
              Copying from <strong className="font-semibold text-white">{sourceName}</strong> → this server
            </p>
          </div>
          {!isLoading && (
            <button onClick={onClose} className="text-discord-light hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Idle / Loading — category grid */}
        {(modalState === 'idle' || modalState === 'loading') && (
          <>
            {/* Select all / deselect all */}
            <div className="flex gap-2 px-6 mb-2">
              <button
                className="text-xs px-2.5 py-1 rounded bg-discord-blurple text-white font-semibold disabled:opacity-50"
                disabled={isLoading}
                onClick={() => setSelected(new Set(CATEGORIES.map(c => c.key)))}
              >
                Select All
              </button>
              <button
                className="text-xs px-2.5 py-1 rounded bg-discord-darker text-discord-light disabled:opacity-50"
                disabled={isLoading}
                onClick={() => setSelected(new Set())}
              >
                Deselect All
              </button>
            </div>

            {/* Cards */}
            <div className="grid grid-cols-2 gap-2 px-6 pb-3">
              {CATEGORIES.map(cat => {
                const isSelected = selected.has(cat.key);
                return (
                  <div
                    key={cat.key}
                    onClick={() => toggleCategory(cat.key)}
                    className={[
                      'relative rounded-lg p-3 cursor-pointer transition-all select-none',
                      'bg-discord-dark border-2',
                      isSelected ? 'border-discord-blurple' : 'border-transparent',
                      isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-discord-darker',
                    ].join(' ')}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-discord-blurple flex items-center justify-center">
                        <span className="text-white text-[9px] font-bold">✓</span>
                      </div>
                    )}
                    <div className="text-xl mb-1">{cat.emoji}</div>
                    <div className="text-white text-xs font-bold mb-0.5">{cat.name}</div>
                    <div className="text-discord-light text-[10px] leading-snug">{cat.desc}</div>
                  </div>
                );
              })}
            </div>

            {/* Warning */}
            <div className="mx-6 mb-4 flex gap-2 items-start p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
              <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-yellow-300 leading-snug">
                Channel and role assignments will be cleared where possible — you'll need to reassign them after syncing.
                Scheduled messages and auto-delete channels retain their channel IDs and must be reconfigured manually.
              </p>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-discord-darker">
              <button
                className="text-sm text-discord-light hover:text-white px-4 py-2 rounded disabled:opacity-50"
                disabled={isLoading}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isLoading || selected.size === 0}
                onClick={handleCopy}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Syncing…
                  </>
                ) : (
                  `Copy ${selected.size} ${selected.size === 1 ? 'Category' : 'Categories'} →`
                )}
              </button>
            </div>
          </>
        )}

        {/* Success state */}
        {modalState === 'success' && (
          <div className="px-6 pb-6">
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-green-400" />
              </div>
              <div className="text-green-400 font-semibold">
                {syncedCount} {syncedCount === 1 ? 'category' : 'categories'} synced!
              </div>
              <p className="text-discord-light text-xs text-center">
                Remember to reassign channel and role settings where needed.
              </p>
            </div>
            <div className="flex justify-end">
              <button className="btn btn-secondary text-sm" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}

        {/* Error state */}
        {modalState === 'error' && (
          <div className="px-6 pb-6">
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-red-400" />
              </div>
              <div className="text-red-400 font-semibold text-sm text-center">{errorMsg}</div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="text-sm text-discord-light hover:text-white px-4 py-2 rounded" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary text-sm" onClick={handleTryAgain}>
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
