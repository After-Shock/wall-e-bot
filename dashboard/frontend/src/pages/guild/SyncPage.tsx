import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Copy } from 'lucide-react';
import api from '../../api/axios';
import SyncModal from './SyncModal';

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
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const { data: guilds, isLoading } = useQuery<Guild[]>({
    queryKey: ['guilds'],
    queryFn: async () => {
      const response = await api.get<Guild[]>('/api/guilds');
      return response.data;
    },
  });

  const eligibleSources = guilds?.filter((g) => {
    if (g.id === guildId || !g.botPresent) return false;
    if (g.owner) return true;
    const perms = BigInt(g.permissions);
    const MANAGE_GUILD = BigInt(0x20);
    const ADMINISTRATOR = BigInt(0x8);
    return (perms & MANAGE_GUILD) === MANAGE_GUILD || (perms & ADMINISTRATOR) === ADMINISTRATOR;
  }) ?? [];

  const sourceGuild = guilds?.find(g => g.id === selectedSourceId);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <RefreshCw className="w-6 h-6" />
          Sync Settings
        </h1>
        <p className="text-discord-light mt-1">
          Copy settings from another server to this one to save setup time.
        </p>
      </div>

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
                onChange={(e) => setSelectedSourceId(e.target.value)}
              >
                <option value="">— Select a server —</option>
                {eligibleSources.map((guild) => (
                  <option key={guild.id} value={guild.id}>
                    {guild.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              className="btn btn-primary flex items-center gap-2"
              disabled={!selectedSourceId}
              onClick={() => setModalOpen(true)}
            >
              <Copy className="w-4 h-4" />
              Copy Settings…
            </button>
          </>
        )}
      </div>

      {modalOpen && selectedSourceId && guildId && (
        <SyncModal
          guildId={guildId}
          sourceGuildId={selectedSourceId}
          sourceName={sourceGuild?.name ?? selectedSourceId}
          onClose={() => {
            setModalOpen(false);
            setSelectedSourceId('');
          }}
        />
      )}
    </div>
  );
}
