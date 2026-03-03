import { Outlet, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import Sidebar from './Sidebar';
import { ArrowLeft, Server } from 'lucide-react';

interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

export default function GuildLayout() {
  const { guildId } = useParams<{ guildId: string }>();

  const { data: guilds } = useQuery<Guild[]>({
    queryKey: ['guilds'],
    queryFn: async () => {
      const response = await api.get<Guild[]>('/api/guilds');
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const guild = guilds?.find(g => g.id === guildId) ?? { id: guildId ?? '', name: '', icon: null };

  return (
    <div className="flex min-h-[calc(100vh-64px)]">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Guild Header */}
        <div className="bg-discord-darker border-b border-discord-dark px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              to="/dashboard"
              className="text-discord-light hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-3">
              {guild?.icon ? (
                <img
                  src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`}
                  alt={guild.name}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-discord-dark flex items-center justify-center">
                  <Server className="w-5 h-5 text-discord-light" />
                </div>
              )}
              <div>
                <h1 className="font-semibold text-lg">{guild?.name || <span className="inline-block w-32 h-4 bg-discord-dark rounded animate-pulse" />}</h1>
                <p className="text-sm text-discord-light">Server Dashboard</p>
              </div>
            </div>
          </div>
        </div>

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
