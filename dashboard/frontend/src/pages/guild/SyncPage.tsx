import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import type { AxiosError } from 'axios';
import api from '../../api/axios';

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  botPresent: boolean;
}

export default function SyncPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const queryClient = useQueryClient();
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Reuse the existing guilds list from the dashboard
  const { data: guilds, isLoading } = useQuery<Guild[]>({
    queryKey: ['guilds'],
    queryFn: async () => {
      const response = await api.get<Guild[]>('/api/guilds');
      return response.data;
    },
  });

  // Other guilds where the bot is present and the user has manage access (excluding current guild)
  const eligibleSources = guilds?.filter((g) => {
    if (g.id === guildId || !g.botPresent) return false;
    if (g.owner) return true;
    const perms = BigInt(g.permissions);
    const MANAGE_GUILD = BigInt(0x20);
    const ADMINISTRATOR = BigInt(0x8);
    return (perms & MANAGE_GUILD) === MANAGE_GUILD || (perms & ADMINISTRATOR) === ADMINISTRATOR;
  }) ?? [];

  const copyMutation = useMutation({
    mutationFn: async (sourceGuildId: string) => {
      const response = await api.post(
        `/api/guilds/${guildId}/copy-from/${sourceGuildId}`
      );
      return response.data;
    },
  });

  const handleCopy = () => {
    if (!selectedSourceId) return;
    setSuccessMessage('');
    setErrorMessage('');
    copyMutation.mutate(selectedSourceId, {
      onSuccess: (_, sourceGuildId) => {
        const sourceName = guilds?.find((g) => g.id === sourceGuildId)?.name ?? sourceGuildId;
        setSuccessMessage(`Settings copied from "${sourceName}" successfully. Reconfigure any channel and role assignments.`);
        setErrorMessage('');
        setSelectedSourceId('');
        // Invalidate guild config so other pages reflect new settings
        queryClient.invalidateQueries({ queryKey: ['guild', guildId] });
      },
      onError: (error: Error) => {
        const axiosError = error as AxiosError<{ error: string }>;
        setErrorMessage(axiosError.response?.data?.error ?? 'Failed to copy settings. Please try again.');
        setSuccessMessage('');
      },
    });
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <RefreshCw className="w-6 h-6" />
          Sync Settings
        </h1>
        <p className="text-discord-light mt-1">
          Copy all settings from another server to this one to save setup time.
        </p>
      </div>

      {successMessage && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400">
          <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <p className="text-sm">{successMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <p className="text-sm">{errorMessage}</p>
        </div>
      )}

      <div className="card space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Copy className="w-5 h-5" />
          Copy From Another Server
        </h2>

        {isLoading ? (
          <div className="flex items-center gap-2 text-discord-light">
            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-discord-blurple" />
            <span className="text-sm">Loading servers...</span>
          </div>
        ) : eligibleSources.length === 0 ? (
          <p className="text-discord-light text-sm">
            No other servers found where the bot is active. Add the bot to another server first.
          </p>
        ) : (
          <>
            <div>
              <label htmlFor="source-guild" className="block text-sm font-medium mb-2">
                Copy settings from:
              </label>
              <select
                id="source-guild"
                className="w-full bg-discord-dark border border-discord-darker rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-discord-blurple"
                value={selectedSourceId}
                onChange={(e) => {
                  setSelectedSourceId(e.target.value);
                  setErrorMessage('');
                  setSuccessMessage('');
                }}
              >
                <option value="">— Select a server —</option>
                {eligibleSources.map((guild) => (
                  <option key={guild.id} value={guild.id}>
                    {guild.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
              <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
              <p className="text-sm text-yellow-300">
                <strong>Warning:</strong> This will overwrite <em>all</em> current settings on this server.
                Channel and role assignments will be cleared and must be reconfigured after copying.
              </p>
            </div>

            <button
              className="btn btn-primary flex items-center gap-2"
              disabled={!selectedSourceId || copyMutation.isPending}
              onClick={handleCopy}
            >
              {copyMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-white" />
                  Copying...
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Settings
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
