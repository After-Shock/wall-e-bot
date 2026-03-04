import { useState, useEffect } from 'react';
import { Outlet, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import Sidebar from './Sidebar';
import { ArrowLeft, Server, Menu } from 'lucide-react';

interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

export default function GuildLayout() {
  const { guildId } = useParams<{ guildId: string }>();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: guilds } = useQuery<Guild[]>({
    queryKey: ['guilds'],
    queryFn: async () => {
      const response = await api.get<Guild[]>('/api/guilds');
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const guild = guilds?.find(g => g.id === guildId) ?? { id: guildId ?? '', name: '', icon: null };

  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  return (
    <div className="flex min-h-[calc(100vh-64px)]">
      {/* Desktop Sidebar — always visible on md+ */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile Overlay Drawer — always mounted so accordion state is preserved */}
      <div className="md:hidden">
        {/* Backdrop */}
        <div
          className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 ${
            sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
        {/* Drawer */}
        <div
          className={`fixed inset-y-0 left-0 z-50 transition-transform duration-300 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={{ willChange: 'transform' }}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Guild Header */}
        <div className="bg-discord-darker border-b border-discord-dark px-4 md:px-6 py-4">
          <div className="flex items-center gap-4">
            {/* Hamburger — mobile only */}
            <button
              className="md:hidden text-discord-light hover:text-white transition-colors"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Link
              to="/dashboard"
              className="text-discord-light hover:text-white transition-colors"
              aria-label="Back to dashboard"
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
        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
