import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Bot, LogOut, LayoutDashboard } from 'lucide-react';

export default function Layout() {
  const { user, login, logout } = useAuth();

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
              
              {user && (
                <Link 
                  to="/dashboard" 
                  className="flex items-center gap-2 text-discord-light hover:text-white transition-colors"
                >
                  <LayoutDashboard className="w-5 h-5" />
                  Dashboard
                </Link>
              )}
            </div>

            <div className="flex items-center gap-4">
              {user ? (
                <div className="flex items-center gap-4">
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
          <p>© 2024 Wall-E Bot. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
