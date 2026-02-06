import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { Shield, Star, MessageSquare, Settings, Bot, Zap } from 'lucide-react';

const features = [
  {
    icon: Shield,
    title: 'Moderation',
    description: 'Powerful moderation tools including kick, ban, warn, timeout, and auto-moderation.',
  },
  {
    icon: Star,
    title: 'Leveling System',
    description: 'Engage your community with XP, levels, role rewards, and leaderboards.',
  },
  {
    icon: MessageSquare,
    title: 'Welcome Messages',
    description: 'Customizable welcome and leave messages with embed support.',
  },
  {
    icon: Settings,
    title: 'Custom Commands',
    description: 'Create custom commands tailored to your server needs.',
  },
  {
    icon: Bot,
    title: 'Reaction Roles',
    description: 'Let users self-assign roles with reaction role messages.',
  },
  {
    icon: Zap,
    title: 'Auto-Mod',
    description: 'Automatic spam detection, word filters, and link filtering.',
  },
];

export default function HomePage() {
  const { user, login } = useAuth();

  return (
    <div>
      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-bold mb-6">
            <span className="text-discord-blurple">Wall-E Bot</span>
            <br />
            The Ultimate Discord Bot
          </h1>
          <p className="text-xl text-discord-light mb-8">
            A feature-rich Discord bot with moderation, leveling, welcome messages, 
            and a powerful dashboard. Everything you need to manage your server.
          </p>
          <div className="flex gap-4 justify-center">
            {user ? (
              <Link to="/dashboard" className="btn btn-primary text-lg px-8 py-3">
                Go to Dashboard
              </Link>
            ) : (
              <button onClick={login} className="btn btn-primary text-lg px-8 py-3">
                Add to Discord
              </button>
            )}
            <a
              href="https://discord.gg/example"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary text-lg px-8 py-3"
            >
              Support Server
            </a>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-discord-dark">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Features</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="card hover:border-discord-blurple border border-transparent transition-colors">
                <feature.icon className="w-10 h-10 text-discord-blurple mb-4" />
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-discord-light">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-12">Trusted by Communities</h2>
          <div className="grid grid-cols-3 gap-8">
            <div>
              <div className="text-4xl font-bold text-discord-blurple">0+</div>
              <div className="text-discord-light">Servers</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-discord-blurple">0+</div>
              <div className="text-discord-light">Users</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-discord-blurple">12+</div>
              <div className="text-discord-light">Commands</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
