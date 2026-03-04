import { useState, useEffect, useRef } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Bot, LogOut, LayoutDashboard, ShieldAlert } from 'lucide-react';

export default function Layout() {
  const { user, login, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isOwner = user && (import.meta.env.VITE_BOT_OWNER_ID || '')
    .split(',').map((s: string) => s.trim()).includes(user.id);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-discord-dark border-b border-discord-darker">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link to="/" className="flex items-center gap-2 text-xl font-bold">
                <Bot className="w-8 h-8 text-discord-blurple" />
                <span>Wall-E Bot</span>
              </Link>

              {/* Desktop-only nav links */}
              {user && (
                <Link
                  to="/dashboard"
                  className="hidden md:flex items-center gap-2 text-discord-light hover:text-white transition-colors"
                >
                  <LayoutDashboard className="w-5 h-5" />
                  Dashboard
                </Link>
              )}
              {isOwner && (
                <Link
                  to="/admin"
                  className="hidden md:flex items-center gap-2 text-discord-light hover:text-white transition-colors"
                >
                  <ShieldAlert className="w-5 h-5" />
                  Admin
                </Link>
              )}
            </div>

            <div className="flex items-center gap-4">
              {user ? (
                <>
                  {/* Desktop: avatar + username + logout inline */}
                  <div className="hidden md:flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      {user.avatar ? (
                        <img
                          src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
                          alt={user.username}
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-discord-blurple flex items-center justify-center">
                          {user.username[0]}
                        </div>
                      )}
                      <span className="font-medium">{user.username}</span>
                    </div>
                    <button onClick={logout} className="btn btn-secondary flex items-center gap-2">
                      <LogOut className="w-4 h-4" />
                      Logout
                    </button>
                  </div>

                  {/* Mobile: avatar button → dropdown */}
                  <div className="relative md:hidden" ref={dropdownRef}>
                    <button
                      onClick={() => setDropdownOpen(v => !v)}
                      className="flex items-center"
                      aria-label="User menu"
                    >
                      {user.avatar ? (
                        <img
                          src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
                          alt={user.username}
                          className="w-9 h-9 rounded-full ring-2 ring-transparent hover:ring-discord-blurple transition-all"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-discord-blurple flex items-center justify-center font-semibold">
                          {user.username[0]}
                        </div>
                      )}
                    </button>

                    {dropdownOpen && (
                      <div className="absolute right-0 top-12 w-52 bg-discord-darker border border-discord-dark rounded-lg shadow-xl z-50 py-1">
                        <div className="px-4 py-2 border-b border-discord-dark text-sm font-medium truncate">
                          {user.username}
                        </div>
                        <Link
                          to="/dashboard"
                          onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-2 px-4 py-2.5 text-sm text-discord-light hover:text-white hover:bg-discord-dark transition-colors"
                        >
                          <LayoutDashboard className="w-4 h-4" />
                          Dashboard
                        </Link>
                        {isOwner && (
                          <Link
                            to="/admin"
                            onClick={() => setDropdownOpen(false)}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm text-discord-light hover:text-white hover:bg-discord-dark transition-colors"
                          >
                            <ShieldAlert className="w-4 h-4" />
                            Admin
                          </Link>
                        )}
                        <button
                          onClick={() => { setDropdownOpen(false); logout(); }}
                          className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-discord-light hover:text-white hover:bg-discord-dark transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          Logout
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <button onClick={login} className="btn btn-primary">
                  Login with Discord
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-discord-dark border-t border-discord-darker py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-discord-light">
          <p>© 2026 Wall-E Bot. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
