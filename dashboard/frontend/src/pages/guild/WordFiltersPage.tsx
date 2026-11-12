import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Filter, Save, Plus, Trash2, AlertTriangle, Clock } from 'lucide-react';
import { AutoModConfig } from '@wall-e/shared';
import { useGuildConfig, useErrorMessage } from '../../hooks/useGuildConfig';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorAlert from '../../components/ErrorAlert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

export default function WordFiltersPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [localConfig, setLocalConfig] = useState<AutoModConfig | null>(null);
  const [newWord, setNewWord] = useState('');

  // Fetch and update automod config (word filter is part of automod)
  const {
    data,
    isLoading,
    error,
    update,
    isUpdating,
    refetch
  } = useGuildConfig<AutoModConfig>(guildId, 'automod');

  const errorMessage = useErrorMessage(error);

  // Initialize local config when data loads
  useEffect(() => {
    if (data) {
      setLocalConfig(data);
    }
  }, [data]);

  // Show loading state
  if (isLoading) {
    return <LoadingSpinner message="Loading word filter configuration..." fullScreen />;
  }

  // Show error state
  if (error) {
    return (
      <ErrorAlert
        message="Failed to load word filter configuration"
        details={errorMessage || undefined}
        onRetry={() => refetch()}
        fullScreen
      />
    );
  }

  // Config not loaded yet
  if (!localConfig) {
    return <LoadingSpinner fullScreen />;
  }

  const invalidMuteDuration = localConfig.wordFilter.action === 'mute'
    && (!Number.isFinite(localConfig.wordFilter.muteDuration)
      || (localConfig.wordFilter.muteDuration ?? 0) <= 0);

  const updateWordFilter = (updates: Partial<AutoModConfig['wordFilter']>) => {
    setLocalConfig(prev => prev ? {
      ...prev,
      wordFilter: { ...prev.wordFilter, ...updates }
    } : null);
  };

  const addWord = () => {
    if (!newWord.trim()) return;
    const currentWords = localConfig.wordFilter.words || [];
    if (currentWords.includes(newWord.trim())) return; // Prevent duplicates

    updateWordFilter({
      words: [...currentWords, newWord.trim()]
    });
    setNewWord('');
  };

  const removeWord = (word: string) => {
    updateWordFilter({
      words: (localConfig.wordFilter.words || []).filter(w => w !== word)
    });
  };

  const handleSave = async () => {
    if (!localConfig || invalidMuteDuration) return;

    try {
      await update({
        enabled: localConfig.enabled,
        antiSpam: localConfig.antiSpam,
        wordFilter: localConfig.wordFilter,
        linkFilter: localConfig.linkFilter,
        capsFilter: localConfig.capsFilter,
        ignoredChannels: localConfig.ignoredChannels,
        ignoredRoles: localConfig.ignoredRoles,
      });
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  };

  const wordCount = localConfig.wordFilter.words?.length || 0;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Filter className="w-8 h-8 text-purple-400" />
          <div>
            <h1 className="text-2xl font-bold">Word Filters</h1>
            <p className="text-discord-light">Block specific words and phrases</p>
          </div>
        </div>
        <Button
          onClick={handleSave}
          disabled={isUpdating || invalidMuteDuration}
          className="flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isUpdating ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      {invalidMuteDuration && (
        <ErrorAlert
          message="Invalid word filter configuration"
          details="Mute requires a positive duration before this configuration can be saved."
          variant="error"
        />
      )}

      {/* Enable Toggle */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Enable Word Filters</h3>
            <p className="text-sm text-discord-light">
              Automatically filter messages containing blocked words
            </p>
          </div>
          <Switch checked={localConfig.wordFilter.enabled} onCheckedChange={() => updateWordFilter({ enabled: !localConfig.wordFilter.enabled })} />
        </div>
      </div>

      {localConfig.wordFilter.enabled && (
        <>
          {/* Action Settings */}
          <div className="card space-y-4">
            <h3 className="font-semibold">Filter Action</h3>
            <p className="text-sm text-discord-light">
              Choose what happens when a message contains a filtered word
            </p>

            <div>
              <label className="block text-sm font-medium mb-2">Action</label>
              <select
                value={localConfig.wordFilter.action}
                onChange={e => {
                  const action = e.target.value as AutoModConfig['wordFilter']['action'];
                  updateWordFilter({
                    action,
                    ...(action === 'mute' && !localConfig.wordFilter.muteDuration
                      ? { muteDuration: 10 }
                      : {}),
                  });
                }}
                className="input w-full"
              >
                <option value="delete">Delete message only</option>
                <option value="warn">Delete and warn user</option>
                <option value="mute">Delete and mute user</option>
              </select>
            </div>

            {localConfig.wordFilter.action === 'mute' && (
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Mute Duration (minutes)
                </label>
                <Input
                  type="number"
                  value={localConfig.wordFilter.muteDuration ?? ''}
                  onChange={e => {
                    const duration = Number.parseInt(e.target.value, 10);
                    updateWordFilter({ muteDuration: Number.isFinite(duration) ? duration : undefined });
                  }}
                  className="w-full"
                  min="1"
                  max="10080"
                />
                <p className="text-xs text-discord-light mt-1">
                  Maximum: 10080 minutes (1 week)
                </p>
              </div>
            )}
          </div>

          {/* Add Word */}
          <div className="card">
            <h3 className="font-semibold mb-4">Add Filtered Word</h3>
            <div className="flex gap-2">
              <Input
                type="text"
                value={newWord}
                onChange={e => setNewWord(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && addWord()}
                className="flex-1"
                placeholder="Enter a word or phrase to filter..."
              />
              <Button
                onClick={addWord}
                disabled={!newWord.trim()}
                className="flex items-center gap-2 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                Add Word
              </Button>
            </div>
            <p className="text-xs text-discord-light mt-2">
              Press Enter or click Add Word to add to the filter list
            </p>
          </div>

          {/* Filtered Words List */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Filtered Words ({wordCount})</h3>
            </div>

            {wordCount === 0 ? (
              <div className="text-center py-12 text-discord-light">
                <Filter className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No words filtered yet</p>
                <p className="text-sm mt-1">Add words to start filtering messages</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {(localConfig.wordFilter.words || []).map((word, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-discord-dark rounded-lg p-3"
                  >
                    <code className="bg-discord-darker px-3 py-1 rounded font-mono text-sm">
                      {word}
                    </code>

                    <button
                      onClick={() => removeWord(word)}
                      className="p-2 text-discord-light hover:text-red-400 transition-colors"
                      title="Remove word"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Warning */}
          <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-400">Case Insensitive Matching</p>
              <p className="text-sm text-discord-light mt-1">
                Word filters are case-insensitive and match whole words. For example, filtering "bad" will match
                "Bad", "BAD", and "bad", but not "badminton" or "forbade".
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
