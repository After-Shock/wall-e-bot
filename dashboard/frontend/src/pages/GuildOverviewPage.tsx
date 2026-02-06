import { useParams, Link } from 'react-router-dom';
import {
  Users,
  MessageSquare,
  Shield,
  TrendingUp,
  Settings,
  Smile,
  Terminal,
  Star,
  Bell,
  Activity,
  ArrowRight,
} from 'lucide-react';

const quickActions = [
  {
    name: 'Welcome Messages',
    description: 'Set up welcome and farewell messages',
    icon: MessageSquare,
    href: 'welcome/messages',
    color: 'bg-green-500/20 text-green-400',
  },
  {
    name: 'Reaction Roles',
    description: 'Create self-assignable roles',
    icon: Smile,
    href: 'reaction-roles',
    color: 'bg-pink-500/20 text-pink-400',
  },
  {
    name: 'Auto-Mod',
    description: 'Configure automatic moderation',
    icon: Shield,
    href: 'automod',
    color: 'bg-red-500/20 text-red-400',
  },
  {
    name: 'Custom Commands',
    description: 'Create custom bot commands',
    icon: Terminal,
    href: 'commands',
    color: 'bg-purple-500/20 text-purple-400',
  },
  {
    name: 'Leveling',
    description: 'Set up XP and level rewards',
    icon: TrendingUp,
    href: 'leveling',
    color: 'bg-yellow-500/20 text-yellow-400',
  },
  {
    name: 'Starboard',
    description: 'Highlight popular messages',
    icon: Star,
    href: 'starboard',
    color: 'bg-orange-500/20 text-orange-400',
  },
];

const stats = [
  { name: 'Members', value: '0', icon: Users, change: '+0 today' },
  { name: 'Messages', value: '0', icon: MessageSquare, change: '+0 today' },
  { name: 'Mod Actions', value: '0', icon: Shield, change: '0 this week' },
  { name: 'Active Users', value: '0', icon: Activity, change: '0 this week' },
];

export default function GuildOverviewPage() {
  const { guildId } = useParams<{ guildId: string }>();

  return (
    <div className="max-w-6xl space-y-8">
      {/* Welcome Banner */}
      <div className="card bg-gradient-to-r from-discord-blurple/20 to-purple-600/20 border-discord-blurple/30">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2">Welcome to your Dashboard</h1>
            <p className="text-discord-light">
              Configure your server settings and manage Wall-E Bot features from here.
            </p>
          </div>
          <Link
            to={`/dashboard/${guildId}/settings`}
            className="btn btn-primary flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            Server Settings
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.name} className="card">
            <div className="flex items-center justify-between mb-2">
              <stat.icon className="w-5 h-5 text-discord-blurple" />
              <span className="text-xs text-discord-light">{stat.change}</span>
            </div>
            <div className="text-3xl font-bold">{stat.value}</div>
            <div className="text-sm text-discord-light">{stat.name}</div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickActions.map((action) => (
            <Link
              key={action.name}
              to={`/dashboard/${guildId}/${action.href}`}
              className="card hover:border-discord-blurple/50 border border-transparent transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-lg ${action.color}`}>
                  <action.icon className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1 group-hover:text-discord-blurple transition-colors">
                    {action.name}
                  </h3>
                  <p className="text-sm text-discord-light">{action.description}</p>
                </div>
                <ArrowRight className="w-5 h-5 text-discord-light group-hover:text-discord-blurple transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
        <div className="card">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Activity className="w-12 h-12 text-discord-light mb-3" />
            <p className="text-discord-light">No recent activity to show</p>
            <p className="text-sm text-discord-light mt-1">
              Activity will appear here once the bot is active in your server
            </p>
          </div>
        </div>
      </div>

      {/* Module Status */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Module Status</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { name: 'Moderation', enabled: true },
            { name: 'Leveling', enabled: true },
            { name: 'Welcome', enabled: false },
            { name: 'Auto-Mod', enabled: false },
            { name: 'Logging', enabled: false },
            { name: 'Starboard', enabled: false },
            { name: 'Tickets', enabled: false },
            { name: 'Suggestions', enabled: false },
          ].map((module) => (
            <div
              key={module.name}
              className="card py-3 flex items-center justify-between"
            >
              <span className="text-sm font-medium">{module.name}</span>
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  module.enabled
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-discord-dark text-discord-light'
                }`}
              >
                {module.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
