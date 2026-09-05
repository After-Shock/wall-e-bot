import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, Clock, Database, Plus, Trash2, Upload } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConfigurationSnapshotListItem } from '@wall-e/shared';
import { api } from '../../services/api';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorAlert from '../../components/ErrorAlert';

interface RestoreResponse {
  success: true;
  message: string;
  warning?: string;
}

export default function BackupPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSnapshotName, setNewSnapshotName] = useState('');
  const [notice, setNotice] = useState<{ message: string; warning: boolean } | null>(null);

  const { data: snapshots, isLoading, error: listError, refetch } =
    useQuery<ConfigurationSnapshotListItem[]>({
      queryKey: ['backups', guildId],
      queryFn: async () => {
        const response = await api.get(`/api/guilds/${guildId}/backups`);
        return response.data;
      },
      enabled: !!guildId,
    });

  const { mutate: createSnapshot, isPending: isCreating, error: createError } = useMutation({
    mutationFn: async (name: string) => {
      const response = await api.post(`/api/guilds/${guildId}/backups`, { name });
      return response.data.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['backups', guildId] });
      setShowCreateModal(false);
      setNewSnapshotName('');
      setNotice({ message: 'Configuration snapshot created successfully.', warning: false });
    },
  });

  const { mutate: restoreSnapshot, isPending: isRestoring, error: restoreError } = useMutation({
    mutationFn: async (snapshotId: string): Promise<RestoreResponse> => {
      const response = await api.post(`/api/guilds/${guildId}/backups/${snapshotId}/restore`);
      return response.data;
    },
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['backups', guildId] }),
        queryClient.invalidateQueries({ queryKey: ['guild', guildId] }),
      ]);
      setNotice({
        message: response.warning ?? 'Configuration snapshot restored successfully.',
        warning: !!response.warning,
      });
    },
  });

  const { mutate: deleteSnapshot, isPending: isDeleting, error: deleteError } = useMutation({
    mutationFn: async (snapshotId: string) => {
      const response = await api.delete(`/api/guilds/${guildId}/backups/${snapshotId}`);
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['backups', guildId] });
      setNotice({ message: 'Configuration snapshot deleted successfully.', warning: false });
    },
  });

  if (isLoading) {
    return <LoadingSpinner message="Loading configuration snapshots..." fullScreen />;
  }

  const handleCreate = () => {
    const name = newSnapshotName.trim();
    if (name) createSnapshot(name);
  };

  const handleRestore = (snapshotId: string) => {
    if (window.confirm('Restore this snapshot? Your current guild JSON configuration will be overwritten.')) {
      restoreSnapshot(snapshotId);
    }
  };

  const handleDelete = (snapshotId: string) => {
    if (window.confirm('Delete this configuration snapshot? This action cannot be undone.')) {
      deleteSnapshot(snapshotId);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const unit = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const index = Math.floor(Math.log(bytes) / Math.log(unit));
    return `${Math.round(bytes / Math.pow(unit, index) * 100) / 100} ${sizes[index]}`;
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="w-8 h-8 text-green-400" />
          <div>
            <h1 className="text-2xl font-bold">Configuration snapshots</h1>
            <p className="text-discord-light">Manual snapshots of this guild&apos;s JSON configuration only.</p>
          </div>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Create snapshot
        </button>
      </div>

      <div className="card text-sm text-discord-light space-y-2">
        <p>Included: the guild JSON configuration used by dashboard settings and the bot.</p>
        <p>
          Excluded: relational ticket panels, custom-command rows, schedules, Discord roles,
          channels, members and messages, and PostgreSQL disaster recovery.
        </p>
      </div>

      {notice && (notice.warning ? (
        <ErrorAlert message={notice.message} variant="warning" />
      ) : (
        <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <p className="text-green-400">{notice.message}</p>
        </div>
      ))}

      {(createError || restoreError || deleteError) && (
        <ErrorAlert
          message="Snapshot action failed"
          details={(createError || restoreError || deleteError)?.message}
        />
      )}

      <div className="card">
        <div className="mb-6">
          <h2 className="text-xl font-bold">Your snapshots</h2>
          <p className="text-sm text-discord-light">
            {snapshots?.length || 0} snapshot{snapshots?.length !== 1 ? 's' : ''} available
          </p>
        </div>

        {listError ? (
          <ErrorAlert message="Failed to load configuration snapshots" details={listError.message} onRetry={() => refetch()} />
        ) : !snapshots || snapshots.length === 0 ? (
          <div className="text-center py-12 text-discord-light">
            <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No configuration snapshots yet</p>
            <p className="text-sm mt-1">Create your first snapshot to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {snapshots.map(snapshot => (
              <div key={snapshot.id} className="bg-discord-dark rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold">{snapshot.name}</h3>
                      <span className={`px-2 py-1 rounded text-xs ${snapshot.type === 'automatic'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-purple-500/20 text-purple-400'}`}>
                        {snapshot.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-discord-light">
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {new Date(snapshot.createdAt).toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Database className="w-4 h-4" />
                        {formatBytes(snapshot.size)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRestore(snapshot.id)}
                      disabled={isRestoring}
                      className="btn btn-secondary flex items-center gap-2 disabled:opacity-50"
                      title="Restore this configuration snapshot"
                    >
                      <Upload className="w-4 h-4" />
                      Restore
                    </button>
                    <button
                      onClick={() => handleDelete(snapshot.id)}
                      disabled={isDeleting}
                      className="p-2 text-discord-light hover:text-red-400 transition-colors disabled:opacity-50"
                      title="Delete this configuration snapshot"
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

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-discord-gray rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Create configuration snapshot</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Snapshot name</label>
              <input
                type="text"
                value={newSnapshotName}
                onChange={event => setNewSnapshotName(event.target.value)}
                className="input w-full"
                placeholder="e.g., Before major changes"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCreate}
                disabled={isCreating || !newSnapshotName.trim()}
                className="btn btn-primary flex-1 disabled:opacity-50"
              >
                {isCreating ? 'Creating...' : 'Create snapshot'}
              </button>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewSnapshotName('');
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
