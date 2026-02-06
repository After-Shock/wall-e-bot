import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Settings, Plus, Check } from 'lucide-react';

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  botPresent: boolean;
}

export default function DashboardPage() {
  const { user, loading: authLoading, login } = useAuth();

  const { data: guilds, isLoading } = useQuery({
    queryKey: ['guilds'],
    queryFn: async () => {
      const response = await api.get<Guild[]>('/api/guilds');
      return response.data;
    },
    enabled: !!user,
  });

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-discord-blurple"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h2 className="text-2xl font-bold">Please login to continue</h2>
        <button onClick={login} className="btn btn-primary">
          Login with Discord
        </button>
      </div>
    );
  }

  const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${import.meta.env.VITE_DISCORD_CLIENT_ID}&permissions=8&scope=bot%20applications.commands`;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Select a Server</h1>
        <p className="text-discord-light">Choose a server to manage or add Wall-E Bot to a new server.</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {guilds?.map((guild) => (
          <div key={guild.id} className="card flex items-center gap-4">
            {guild.icon ? (
              <img
                src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`}
                alt={guild.name}
                className="w-14 h-14 rounded-full"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-discord-blurple flex items-center justify-center text-xl font-bold">
                {guild.name[0]}
              </div>
            )}
            
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{guild.name}</h3>
              <div className="flex items-center gap-1 text-sm text-discord-light">
                {guild.botPresent ? (
                  <>
                    <Check className="w-4 h-4 text-discord-green" />
                    <span>Bot Active</span>
                  </>
                ) : (
                  <span>Bot not added</span>
                )}
              </div>
            </div>

            {guild.botPresent ? (
              <Link
                to={`/dashboard/${guild.id}`}
                className="btn btn-primary flex items-center gap-2"
              >
                <Settings className="w-4 h-4" />
                Manage
              </Link>
            ) : (
              <a
                href={`${inviteUrl}&guild_id=${guild.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Bot
              </a>
            )}
          </div>
        ))}
      </div>

      {guilds?.length === 0 && (
        <div className="text-center py-12">
          <p className="text-discord-light mb-4">No servers found where you have manage permissions.</p>
          <a
            href={inviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            Add Wall-E to a Server
          </a>
        </div>
      )}
    </div>
  );
}
