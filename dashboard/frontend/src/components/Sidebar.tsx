import { NavLink, useParams } from 'react-router-dom';
import {
  Home,
  MessageSquare,
  Shield,
  ShieldAlert,
  ScrollText,
  Smile,
  Terminal,
  Star,
  TrendingUp,
  Bell,
  Clock,
  Zap,
  Palette,
  Lightbulb,
  BarChart3,
  Users,
  Settings,
  ChevronDown,
  ChevronRight,
  Database,
  Crown,
} from 'lucide-react';
import { useState } from 'react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  children?: NavItem[];
}

const getNavItems = (guildId: string): NavItem[] => [
  {
    name: 'Overview',
    href: `/dashboard/${guildId}`,
    icon: Home,
  },
  {
    name: 'Analytics',
    href: `/dashboard/${guildId}/analytics`,
    icon: BarChart3,
    badge: 'Premium',
  },
  {
    name: 'Welcome',
    href: `/dashboard/${guildId}/welcome`,
    icon: MessageSquare,
    children: [
      { name: 'Welcome Messages', href: `/dashboard/${guildId}/welcome/messages`, icon: MessageSquare },
      { name: 'Auto Roles', href: `/dashboard/${guildId}/welcome/autoroles`, icon: Users },
      { name: 'Server Rules', href: `/dashboard/${guildId}/welcome/rules`, icon: ScrollText },
    ],
  },
  {
    name: 'Moderation',
    href: `/dashboard/${guildId}/moderation`,
    icon: Shield,
    children: [
      { name: 'Mod Actions', href: `/dashboard/${guildId}/moderation/actions`, icon: Shield },
      { name: 'Warnings', href: `/dashboard/${guildId}/moderation/warnings`, icon: ShieldAlert },
      { name: 'Temp Bans', href: `/dashboard/${guildId}/moderation/tempbans`, icon: Clock },
    ],
  },
  {
    name: 'Auto-Mod',
    href: `/dashboard/${guildId}/automod`,
    icon: ShieldAlert,
    children: [
      { name: 'Spam Protection', href: `/dashboard/${guildId}/automod/spam`, icon: ShieldAlert },
      { name: 'Word Filters', href: `/dashboard/${guildId}/automod/filters`, icon: Terminal },
      { name: 'Link Protection', href: `/dashboard/${guildId}/automod/links`, icon: Zap },
      { name: 'Advanced AI', href: `/dashboard/${guildId}/automod/advanced`, icon: Crown, badge: 'Premium' },
    ],
  },
  {
    name: 'Logging',
    href: `/dashboard/${guildId}/logging`,
    icon: ScrollText,
  },
  {
    name: 'Reaction Roles',
    href: `/dashboard/${guildId}/reaction-roles`,
    icon: Smile,
  },
  {
    name: 'Custom Commands',
    href: `/dashboard/${guildId}/commands`,
    icon: Terminal,
  },
  {
    name: 'Starboard',
    href: `/dashboard/${guildId}/starboard`,
    icon: Star,
  },
  {
    name: 'Leveling',
    href: `/dashboard/${guildId}/leveling`,
    icon: TrendingUp,
    children: [
      { name: 'Settings', href: `/dashboard/${guildId}/leveling/settings`, icon: Settings },
      { name: 'Role Rewards', href: `/dashboard/${guildId}/leveling/rewards`, icon: Star },
      { name: 'Leaderboard', href: `/dashboard/${guildId}/leveling/leaderboard`, icon: BarChart3 },
    ],
  },
  {
    name: 'Announcements',
    href: `/dashboard/${guildId}/announcements`,
    icon: Bell,
    children: [
      { name: 'Scheduled Messages', href: `/dashboard/${guildId}/announcements/scheduled`, icon: Clock },
      { name: 'Twitch Alerts', href: `/dashboard/${guildId}/announcements/twitch`, icon: Zap },
      { name: 'Auto Feeds', href: `/dashboard/${guildId}/announcements/feeds`, icon: Bell },
    ],
  },
  {
    name: 'Triggers',
    href: `/dashboard/${guildId}/triggers`,
    icon: Zap,
  },
  {
    name: 'Embeds',
    href: `/dashboard/${guildId}/embeds`,
    icon: Palette,
  },
  {
    name: 'Suggestions',
    href: `/dashboard/${guildId}/suggestions`,
    icon: Lightbulb,
  },
  {
    name: 'Tickets',
    href: `/dashboard/${guildId}/tickets`,
    icon: MessageSquare,
  },
  {
    name: 'Backup & Restore',
    href: `/dashboard/${guildId}/backup`,
    icon: Database,
    badge: 'Premium',
  },
  {
    name: 'Settings',
    href: `/dashboard/${guildId}/settings`,
    icon: Settings,
  },
];

interface NavItemComponentProps {
  item: NavItem;
  depth?: number;
}

function NavItemComponent({ item, depth = 0 }: NavItemComponentProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = item.children && item.children.length > 0;

  const baseClasses = `
    flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200
    text-discord-light hover:text-white hover:bg-discord-dark
  `;

  const activeClasses = `
    bg-discord-blurple/20 text-white border-l-2 border-discord-blurple
  `;

  if (hasChildren) {
    return (
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`${baseClasses} w-full justify-between`}
          style={{ paddingLeft: `${12 + depth * 12}px` }}
        >
          <div className="flex items-center gap-3">
            <item.icon className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium">{item.name}</span>
          </div>
          {isOpen ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
        {isOpen && (
          <div className="ml-2 mt-1 space-y-1">
            {item.children!.map((child) => (
              <NavItemComponent key={child.href} item={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <NavLink
      to={item.href}
      end={item.href.split('/').length <= 4}
      className={({ isActive }) =>
        `${baseClasses} ${isActive ? activeClasses : ''}`
      }
      style={{ paddingLeft: `${12 + depth * 12}px` }}
    >
      <item.icon className="w-5 h-5 shrink-0" />
      <span className="text-sm font-medium">{item.name}</span>
      {item.badge && (
        <span className="ml-auto bg-discord-blurple text-white text-xs px-2 py-0.5 rounded-full">
          {item.badge}
        </span>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  const { guildId } = useParams<{ guildId: string }>();

  if (!guildId) {
    return null;
  }

  const navItems = getNavItems(guildId);

  return (
    <aside className="w-64 bg-discord-darker border-r border-discord-dark shrink-0 overflow-y-auto">
      <div className="p-4">
        <h2 className="text-xs font-semibold text-discord-light uppercase tracking-wider mb-4">
          Server Settings
        </h2>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <NavItemComponent key={item.href} item={item} />
          ))}
        </nav>
      </div>
    </aside>
  );
}
