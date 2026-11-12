import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Link2, Save, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { AutoModConfig } from '@wall-e/shared';
import { useGuildConfig, useErrorMessage } from '../../hooks/useGuildConfig';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorAlert from '../../components/ErrorAlert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

export default function LinkProtectionPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [localConfig, setLocalConfig] = useState<AutoModConfig | null>(null);
  const [newDomain, setNewDomain] = useState('');

  const {
    data,
    isLoading,
    error,
    update,
    isUpdating,
    refetch
  } = useGuildConfig<AutoModConfig>(guildId, 'automod');

  const errorMessage = useErrorMessage(error);

  useEffect(() => {
    if (data) {
      setLocalConfig(data);
    }
  }, [data]);

  if (isLoading) {
    return <LoadingSpinner message="Loading link protection..." fullScreen />;
  }

  if (error) {
    return (
      <ErrorAlert
        message="Failed to load link protection configuration"
        details={errorMessage || undefined}
        onRetry={() => refetch()}
        fullScreen
      />
    );
  }

  if (!localConfig) {
    return <LoadingSpinner fullScreen />;
  }

  const linkAction = String(localConfig.linkFilter.action);
  const unsupportedAction = !['delete', 'warn'].includes(linkAction) ? linkAction : null;
  const localConfigIssue = unsupportedAction
    ? `This server has the legacy “${unsupportedAction}” link action selected. It is unsupported and will not run. Choose Delete or Warn before saving.`
    : null;

  const updateLinkFilter = (updates: Partial<AutoModConfig['linkFilter']>) => {
    setLocalConfig(prev => prev ? {
      ...prev,
      linkFilter: { ...prev.linkFilter, ...updates }
    } : null);
  };

  const addDomain = () => {
    if (!newDomain.trim()) return;
    const currentDomains = localConfig.linkFilter.allowedDomains || [];
    if (currentDomains.includes(newDomain.trim())) return; // Prevent duplicates

    updateLinkFilter({
      allowedDomains: [...currentDomains, newDomain.trim()]
    });
    setNewDomain('');
  };

  const removeDomain = (domain: string) => {
    updateLinkFilter({
      allowedDomains: (localConfig.linkFilter.allowedDomains || []).filter(d => d !== domain)
    });
  };

  const handleSave = async () => {
    if (!localConfig || localConfigIssue) return;
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

  const domainCount = localConfig.linkFilter.allowedDomains?.length || 0;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link2 className="w-8 h-8 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold">Link Protection</h1>
            <p className="text-discord-light">Control which links can be posted</p>
          </div>
        </div>
        <Button
          onClick={handleSave}
          disabled={isUpdating || !!localConfigIssue}
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

      {localConfigIssue && (
        <ErrorAlert message="Unsupported link protection configuration" details={localConfigIssue} variant="error" />
      )}

      {/* Enable Toggle */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Enable Link Protection</h3>
            <p className="text-sm text-discord-light">
              Automatically filter messages containing disallowed links
            </p>
          </div>
          <Switch checked={localConfig.linkFilter.enabled} onCheckedChange={() => updateLinkFilter({ enabled: !localConfig.linkFilter.enabled })} />
        </div>
      </div>

      {localConfig.linkFilter.enabled && (
        <>
          {/* Action Settings */}
          <div className="card space-y-4">
            <h3 className="font-semibold">Filter Action</h3>
            <p className="text-sm text-discord-light">
              What to do when a message contains a disallowed link
            </p>

            <div>
              <label className="block text-sm font-medium mb-2">Action</label>
              <select
                value={linkAction}
                onChange={e => updateLinkFilter({ action: e.target.value as AutoModConfig['linkFilter']['action'] })}
                className="input w-full"
              >
                {unsupportedAction && (
                  <option value={unsupportedAction}>Unsupported legacy action: {unsupportedAction}</option>
                )}
                <option value="delete">Delete message only</option>
                <option value="warn">Delete and warn user</option>
              </select>
            </div>
          </div>

          {/* Add Domain */}
          <div className="card">
            <h3 className="font-semibold mb-4">Add Allowed Domain</h3>
            <div className="flex gap-2">
              <Input
                type="text"
                value={newDomain}
                onChange={e => setNewDomain(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && addDomain()}
                className="flex-1"
                placeholder="Enter domain to allow (e.g., youtube.com)..."
              />
              <Button
                onClick={addDomain}
                disabled={!newDomain.trim()}
                className="flex items-center gap-2 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                Add Domain
              </Button>
            </div>
            <p className="text-xs text-discord-light mt-2">
              Press Enter or click Add Domain to add to the allowed list
            </p>
          </div>

          {/* Allowed Domains List */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Allowed Domains ({domainCount})</h3>
            </div>

            {domainCount === 0 ? (
              <div className="text-center py-12 text-discord-light">
                <Link2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No allowed domains yet</p>
                <p className="text-sm mt-1">Add domains to create a whitelist</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {(localConfig.linkFilter.allowedDomains || []).map((domain, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-discord-dark rounded-lg p-3"
                  >
                    <code className="bg-discord-darker px-3 py-1 rounded font-mono text-sm">
                      {domain}
                    </code>

                    <button
                      onClick={() => removeDomain(domain)}
                      className="p-2 text-discord-light hover:text-red-400 transition-colors"
                      title="Remove domain"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-blue-400">Whitelist Mode</p>
              <p className="text-sm text-discord-light mt-1">
                Only links from domains in the allowed list will be permitted. All other links will be filtered.
                Add common domains like youtube.com, twitter.com, etc. to the allowed list.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
