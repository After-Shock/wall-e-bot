import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Database,
  Save,
  Download,
  Upload,
  Trash2,
  Clock,
  Crown,
  Plus,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import type { BackupConfig, BackupListItem } from '@wall-e/shared';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorAlert from '../../components/ErrorAlert';

export default function BackupPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const queryClient = useQueryClient();
  const [localConfig, setLocalConfig] = useState<BackupConfig | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBackupName, setNewBackupName] = useState('');

  // Fetch backup config
  const {
    data: config,
    isLoading: configLoading,
    error: configError,
    refetch: refetchConfig
  } = useQuery<BackupConfig>({
    queryKey: ['backup-config', guildId],
    queryFn: async () => {
      const response = await api.get(`/api/guilds/${guildId}/backups/config`);
      return response.data;
    },
    enabled: !!guildId,
    onSuccess: (data) => {
      setLocalConfig(data);
    },
  });

  // Fetch backups list
  const {
    data: backups,
    isLoading: backupsLoading,
    error: backupsError,
    refetch: refetchBackups
  } = useQuery<BackupListItem[]>({
    queryKey: ['backups', guildId],
    queryFn: async () => {
      const response = await api.get(`/api/guilds/${guildId}/backups`);
      return response.data;
    },
    enabled: !!guildId,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Update config mutation
  const { mutate: updateConfig, isPending: isUpdating } = useMutation({
    mutationFn: async (updates: Partial<BackupConfig>) => {
      const response = await api.patch(`/api/guilds/${guildId}/backups/config`, updates);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup-config', guildId] });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    },
  });

  // Create backup mutation
  const { mutate: createBackup, isPending: isCreating } = useMutation({
    mutationFn: async (name: string) => {
      const response = await api.post(`/api/guilds/${guildId}/backups`, { name });
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups', guildId] });
      setShowCreateModal(false);
      setNewBackupName('');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    },
  });

  // Restore backup mutation
  const { mutate: restoreBackup, isPending: isRestoring } = useMutation({
    mutationFn: async (backupId: string) => {
      const response = await api.post(`/api/guilds/${guildId}/backups/${backupId}/restore`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guild', guildId] });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    },
  });

  // Delete backup mutation
  const { mutate: deleteBackup } = useMutation({
    mutationFn: async (backupId: string) => {
      const response = await api.delete(`/api/guilds/${guildId}/backups/${backupId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups', guildId] });
    },
  });

  if (configLoading || backupsLoading) {
    return <LoadingSpinner message="Loading backup settings..." fullScreen />;
  }

  if (configError) {
    return (
      <ErrorAlert
        message="Failed to load backup configuration"
        details={configError.message}
        onRetry={() => refetchConfig()}
        fullScreen
      />
    );
  }

  if (!localConfig) {
    return <LoadingSpinner fullScreen />;
  }

  const handleSave = () => {
    if (!localConfig) return;
    updateConfig(localConfig);
  };

  const handleCreateBackup = () => {
    if (!newBackupName.trim()) return;
    createBackup(newBackupName.trim());
  };

  const handleRestoreBackup = (backupId: string) => {
    if (window.confirm('Are you sure you want to restore this backup? This will overwrite your current configuration.')) {
      restoreBackup(backupId);
    }
  };

  const handleDeleteBackup = (backupId: string) => {
    if (window.confirm('Are you sure you want to delete this backup? This action cannot be undone.')) {
      deleteBackup(backupId);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString();
  };

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="w-8 h-8 text-green-400" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Backup & Restore</h1>
              <Crown className="w-5 h-5 text-yellow-400" title="Premium Feature" />
            </div>
            <p className="text-discord-light">Protect your server configuration</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Create Backup
        </button>
      </div>

      {/* Success Message */}
      {showSuccess && (
        <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <p className="text-green-400">Operation completed successfully!</p>
        </div>
      )}

      {/* Premium Notice */}
      <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4 flex items-start gap-3">
        <Crown className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-yellow-400">Premium Feature</p>
          <p className="text-sm text-discord-light mt-1">
            Backup & Restore requires an active premium subscription. Keep your server configuration safe with automated backups.
          </p>
        </div>
      </div>

      {/* Backup Configuration */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Automatic Backups</h2>
            <p className="text-sm text-discord-light">Configure automated backup schedule</p>
          </div>
          <button
            onClick={handleSave}
            disabled={isUpdating}
            className="btn btn-secondary flex items-center gap-2 disabled:opacity-50"
          >
            {isUpdating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Settings
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="flex items-center justify-between cursor-pointer bg-discord-dark rounded-lg p-3">
              <div>
                <p className="font-medium">Enable Automatic Backups</p>
                <p className="text-sm text-discord-light">Automatically create backups on schedule</p>
              </div>
              <button
                onClick={() => setLocalConfig(prev => prev ? { ...prev, autoBackup: !prev.autoBackup } : null)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  localConfig.autoBackup ? 'bg-discord-blurple' : 'bg-discord-darker'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    localConfig.autoBackup ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
          </div>

          {localConfig.autoBackup && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">Backup Frequency</label>
                <select
                  value={localConfig.backupFrequency}
                  onChange={e => setLocalConfig(prev => prev ? {
                    ...prev,
                    backupFrequency: e.target.value as any
                  } : null)}
                  className="input w-full"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Keep Last {localConfig.maxBackups} Backups
                </label>
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={localConfig.maxBackups}
                  onChange={e => setLocalConfig(prev => prev ? {
                    ...prev,
                    maxBackups: parseInt(e.target.value)
                  } : null)}
                  className="w-full"
                />
                <p className="text-xs text-discord-light mt-1">
                  Older backups will be automatically deleted
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Backups List */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold">Your Backups</h2>
            <p className="text-sm text-discord-light">
              {backups?.length || 0} backup{backups?.length !== 1 ? 's' : ''} available
            </p>
          </div>
        </div>

        {backupsError ? (
          <ErrorAlert
            message="Failed to load backups"
            details={backupsError.message}
            onRetry={() => refetchBackups()}
          />
        ) : !backups || backups.length === 0 ? (
          <div className="text-center py-12 text-discord-light">
            <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No backups yet</p>
            <p className="text-sm mt-1">Create your first backup to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {backups.map(backup => (
              <div key={backup.id} className="bg-discord-dark rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold">{backup.name}</h3>
                      <span className={`px-2 py-1 rounded text-xs ${
                        backup.type === 'automatic'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-purple-500/20 text-purple-400'
                      }`}>
                        {backup.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-discord-light">
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {formatDate(backup.createdAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Database className="w-4 h-4" />
                        {formatBytes(backup.size)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRestoreBackup(backup.id)}
                      disabled={isRestoring}
                      className="btn btn-secondary flex items-center gap-2 disabled:opacity-50"
                      title="Restore this backup"
                    >
                      <Upload className="w-4 h-4" />
                      Restore
                    </button>
                    <button
                      onClick={() => handleDeleteBackup(backup.id)}
                      className="p-2 text-discord-light hover:text-red-400 transition-colors"
                      title="Delete this backup"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Backup Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-discord-gray rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Create New Backup</h3>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Backup Name</label>
              <input
                type="text"
                value={newBackupName}
                onChange={e => setNewBackupName(e.target.value)}
                className="input w-full"
                placeholder="e.g., Before major changes"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCreateBackup}
                disabled={isCreating || !newBackupName.trim()}
                className="btn btn-primary flex-1 disabled:opacity-50"
              >
                {isCreating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  'Create Backup'
                )}
              </button>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewBackupName('');
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
