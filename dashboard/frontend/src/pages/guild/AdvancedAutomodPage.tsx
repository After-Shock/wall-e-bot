import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Shield,
  Save,
  Image,
  Link2,
  Users,
  CheckCircle,
  AlertTriangle,
  Crown
} from 'lucide-react';
import { AutoModConfig } from '@wall-e/shared';
import { useGuildConfig, useErrorMessage } from '../../hooks/useGuildConfig';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorAlert from '../../components/ErrorAlert';

export default function AdvancedAutomodPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [localConfig, setLocalConfig] = useState<AutoModConfig | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const {
    data,
    isLoading,
    error,
    update,
    isUpdating,
    updateError,
    refetch
  } = useGuildConfig<AutoModConfig>(guildId, 'automod');

  const errorMessage = useErrorMessage(error || updateError);

  useEffect(() => {
    if (data) {
      // Initialize advanced features if they don't exist
      setLocalConfig({
        ...data,
        imageScanning: data.imageScanning || {
          enabled: false,
          scanForNsfw: true,
          scanForViolence: true,
          scanForGore: true,
          action: 'delete',
          threshold: 80,
        },
        linkSafety: data.linkSafety || {
          enabled: false,
          checkPhishing: true,
          checkMalware: true,
          checkIpLoggers: true,
          action: 'delete',
        },
        raidProtection: data.raidProtection || {
          enabled: false,
          joinThreshold: 10,
          accountAgeMinimum: 7,
          verificationLevel: 'medium',
          action: 'kick',
          alertChannel: undefined,
        },
      });
    }
  }, [data]);

  if (isLoading) {
    return <LoadingSpinner message="Loading advanced automod..." fullScreen />;
  }

  if (error) {
    return (
      <ErrorAlert
        message="Failed to load advanced automod configuration"
        details={errorMessage || undefined}
        onRetry={() => refetch()}
        fullScreen
      />
    );
  }

  if (!localConfig || !localConfig.imageScanning || !localConfig.linkSafety || !localConfig.raidProtection) {
    return <LoadingSpinner fullScreen />;
  }

  const updateImageScanning = (updates: Partial<AutoModConfig['imageScanning']>) => {
    setLocalConfig(prev => prev ? {
      ...prev,
      imageScanning: { ...prev.imageScanning!, ...updates }
    } : null);
  };

  const updateLinkSafety = (updates: Partial<AutoModConfig['linkSafety']>) => {
    setLocalConfig(prev => prev ? {
      ...prev,
      linkSafety: { ...prev.linkSafety!, ...updates }
    } : null);
  };

  const updateRaidProtection = (updates: Partial<AutoModConfig['raidProtection']>) => {
    setLocalConfig(prev => prev ? {
      ...prev,
      raidProtection: { ...prev.raidProtection!, ...updates }
    } : null);
  };

  const handleSave = async () => {
    if (!localConfig) return;
    try {
      await update(localConfig);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-purple-400" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Advanced Auto-Moderation</h1>
              <Crown className="w-5 h-5 text-yellow-400" title="Premium Feature" />
            </div>
            <p className="text-discord-light">Advanced AI-powered moderation tools</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={isUpdating}
          className="btn btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isUpdating ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : showSuccess ? (
            <>
              <CheckCircle className="w-4 h-4" />
              Saved!
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Changes
            </>
          )}
        </button>
      </div>

      {/* Update Error Alert */}
      {updateError && (
        <ErrorAlert
          message="Failed to save configuration"
          details={errorMessage || undefined}
          onRetry={handleSave}
          variant="error"
        />
      )}

      {/* Success Message */}
      {showSuccess && (
        <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <p className="text-green-400">Configuration saved successfully!</p>
        </div>
      )}

      {/* Premium Notice */}
      <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4 flex items-start gap-3">
        <Crown className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-yellow-400">Premium Feature</p>
          <p className="text-sm text-discord-light mt-1">
            Advanced Auto-Moderation requires an active premium subscription. These features use AI and
            external APIs to provide enhanced protection for your server.
          </p>
        </div>
      </div>

      {/* Image Scanning */}
      <div className="card space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <Image className="w-6 h-6 text-purple-400" />
          <div className="flex-1">
            <h3 className="font-semibold">AI Image Scanning</h3>
            <p className="text-sm text-discord-light">
              Automatically detect and filter inappropriate images using AI
            </p>
          </div>
          <button
            onClick={() => updateImageScanning({ enabled: !localConfig.imageScanning!.enabled })}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              localConfig.imageScanning!.enabled ? 'bg-discord-blurple' : 'bg-discord-dark'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                localConfig.imageScanning!.enabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {localConfig.imageScanning!.enabled && (
          <>
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Scan For</h4>
              <label className="flex items-center justify-between cursor-pointer bg-discord-dark rounded-lg p-3">
                <div>
                  <p className="font-medium">NSFW Content</p>
                  <p className="text-sm text-discord-light">Detect adult and sexual content</p>
                </div>
                <button
                  onClick={() => updateImageScanning({ scanForNsfw: !localConfig.imageScanning!.scanForNsfw })}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    localConfig.imageScanning!.scanForNsfw ? 'bg-green-500' : 'bg-discord-darker'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      localConfig.imageScanning!.scanForNsfw ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>

              <label className="flex items-center justify-between cursor-pointer bg-discord-dark rounded-lg p-3">
                <div>
                  <p className="font-medium">Violence</p>
                  <p className="text-sm text-discord-light">Detect violent imagery</p>
                </div>
                <button
                  onClick={() => updateImageScanning({ scanForViolence: !localConfig.imageScanning!.scanForViolence })}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    localConfig.imageScanning!.scanForViolence ? 'bg-green-500' : 'bg-discord-darker'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      localConfig.imageScanning!.scanForViolence ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>

              <label className="flex items-center justify-between cursor-pointer bg-discord-dark rounded-lg p-3">
                <div>
                  <p className="font-medium">Gore</p>
                  <p className="text-sm text-discord-light">Detect graphic violent content</p>
                </div>
                <button
                  onClick={() => updateImageScanning({ scanForGore: !localConfig.imageScanning!.scanForGore })}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    localConfig.imageScanning!.scanForGore ? 'bg-green-500' : 'bg-discord-darker'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      localConfig.imageScanning!.scanForGore ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Confidence Threshold: {localConfig.imageScanning!.threshold}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={localConfig.imageScanning!.threshold}
                onChange={e => updateImageScanning({ threshold: parseInt(e.target.value) })}
                className="w-full"
              />
              <p className="text-xs text-discord-light mt-1">
                Higher values = less false positives, but may miss some violations
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Action</label>
              <select
                value={localConfig.imageScanning!.action}
                onChange={e => updateImageScanning({ action: e.target.value as any })}
                className="input w-full"
              >
                <option value="delete">Delete message only</option>
                <option value="warn">Delete and warn user</option>
                <option value="mute">Delete and mute user</option>
              </select>
            </div>
          </>
        )}
      </div>

      {/* Link Safety */}
      <div className="card space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <Link2 className="w-6 h-6 text-blue-400" />
          <div className="flex-1">
            <h3 className="font-semibold">Link Safety Checking</h3>
            <p className="text-sm text-discord-light">
              Automatically check links for phishing, malware, and IP loggers
            </p>
          </div>
          <button
            onClick={() => updateLinkSafety({ enabled: !localConfig.linkSafety!.enabled })}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              localConfig.linkSafety!.enabled ? 'bg-discord-blurple' : 'bg-discord-dark'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                localConfig.linkSafety!.enabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {localConfig.linkSafety!.enabled && (
          <>
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Check For</h4>
              <label className="flex items-center justify-between cursor-pointer bg-discord-dark rounded-lg p-3">
                <div>
                  <p className="font-medium">Phishing Sites</p>
                  <p className="text-sm text-discord-light">Detect fake login pages and scams</p>
                </div>
                <button
                  onClick={() => updateLinkSafety({ checkPhishing: !localConfig.linkSafety!.checkPhishing })}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    localConfig.linkSafety!.checkPhishing ? 'bg-green-500' : 'bg-discord-darker'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      localConfig.linkSafety!.checkPhishing ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>

              <label className="flex items-center justify-between cursor-pointer bg-discord-dark rounded-lg p-3">
                <div>
                  <p className="font-medium">Malware & Viruses</p>
                  <p className="text-sm text-discord-light">Detect malicious downloads</p>
                </div>
                <button
                  onClick={() => updateLinkSafety({ checkMalware: !localConfig.linkSafety!.checkMalware })}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    localConfig.linkSafety!.checkMalware ? 'bg-green-500' : 'bg-discord-darker'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      localConfig.linkSafety!.checkMalware ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>

              <label className="flex items-center justify-between cursor-pointer bg-discord-dark rounded-lg p-3">
                <div>
                  <p className="font-medium">IP Loggers & Grabbers</p>
                  <p className="text-sm text-discord-light">Detect IP tracking services</p>
                </div>
                <button
                  onClick={() => updateLinkSafety({ checkIpLoggers: !localConfig.linkSafety!.checkIpLoggers })}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    localConfig.linkSafety!.checkIpLoggers ? 'bg-green-500' : 'bg-discord-darker'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      localConfig.linkSafety!.checkIpLoggers ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Action</label>
              <select
                value={localConfig.linkSafety!.action}
                onChange={e => updateLinkSafety({ action: e.target.value as any })}
                className="input w-full"
              >
                <option value="delete">Delete message only</option>
                <option value="warn">Delete and warn user</option>
                <option value="mute">Delete and mute user</option>
              </select>
            </div>
          </>
        )}
      </div>

      {/* Raid Protection */}
      <div className="card space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <Users className="w-6 h-6 text-red-400" />
          <div className="flex-1">
            <h3 className="font-semibold">Raid Protection</h3>
            <p className="text-sm text-discord-light">
              Automatically protect against mass join attacks and raids
            </p>
          </div>
          <button
            onClick={() => updateRaidProtection({ enabled: !localConfig.raidProtection!.enabled })}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              localConfig.raidProtection!.enabled ? 'bg-discord-blurple' : 'bg-discord-dark'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                localConfig.raidProtection!.enabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {localConfig.raidProtection!.enabled && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Max Joins Per Minute
                </label>
                <input
                  type="number"
                  value={localConfig.raidProtection!.joinThreshold}
                  onChange={e => updateRaidProtection({ joinThreshold: parseInt(e.target.value) || 1 })}
                  className="input w-full"
                  min="1"
                  max="100"
                />
                <p className="text-xs text-discord-light mt-1">
                  Trigger protection when threshold exceeded
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Minimum Account Age (Days)
                </label>
                <input
                  type="number"
                  value={localConfig.raidProtection!.accountAgeMinimum}
                  onChange={e => updateRaidProtection({ accountAgeMinimum: parseInt(e.target.value) || 0 })}
                  className="input w-full"
                  min="0"
                  max="365"
                />
                <p className="text-xs text-discord-light mt-1">
                  Block accounts newer than this
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Verification Level</label>
                <select
                  value={localConfig.raidProtection!.verificationLevel}
                  onChange={e => updateRaidProtection({ verificationLevel: e.target.value as any })}
                  className="input w-full"
                >
                  <option value="low">Low - Minimal checks</option>
                  <option value="medium">Medium - Balanced</option>
                  <option value="high">High - Strict checks</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Action</label>
                <select
                  value={localConfig.raidProtection!.action}
                  onChange={e => updateRaidProtection({ action: e.target.value as any })}
                  className="input w-full"
                >
                  <option value="kick">Kick from server</option>
                  <option value="ban">Ban from server</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Alert Channel (Optional)</label>
              <input
                type="text"
                value={localConfig.raidProtection!.alertChannel || ''}
                onChange={e => updateRaidProtection({ alertChannel: e.target.value || undefined })}
                className="input w-full font-mono"
                placeholder="Enter channel ID for raid alerts..."
              />
            </div>

            <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-blue-400">Raid Protection Active</p>
                <p className="text-sm text-discord-light mt-1">
                  When triggered, new members will be automatically {localConfig.raidProtection!.action}ed
                  until the join rate returns to normal.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
