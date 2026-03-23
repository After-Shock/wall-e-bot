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
  RefreshCw,
  Trash2,
  X,
  Pencil,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useState, createContext, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { preferencesApi } from '../services/api';

const OnCloseContext = createContext<(() => void) | undefined>(undefined);

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
      { name: 'Auto-Delete', href: `/dashboard/${guildId}/moderation/auto-delete`, icon: Trash2 },
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
      { name: 'Advanced AI', href: `/dashboard/${guildId}/automod/advanced`, icon: Crown },
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
  },
  {
    name: 'Sync Settings',
    href: `/dashboard/${guildId}/sync`,
    icon: RefreshCw,
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
  editMode?: boolean;
  isHidden?: boolean;
  onToggleHide?: (name: string) => void;
}

function NavItemComponent({ item, depth = 0, editMode = false, isHidden = false, onToggleHide }: NavItemComponentProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = item.children && item.children.length > 0;
  const onClose = useContext(OnCloseContext);

  const baseClasses = `
    flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-200
    text-discord-light hover:text-white hover:bg-discord-dark
    border-l-2 border-transparent
  `;

  const activeClasses = `
    bg-discord-blurple/20 text-white border-discord-blurple
  `;

  const hiddenClasses = `opacity-50`;

  if (hasChildren) {
    return (
      <div className={isHidden ? hiddenClasses : ''}>
        <div className="flex items-center gap-1">
          <button
            onClick={() => !isHidden && setIsOpen(!isOpen)}
            className={`${baseClasses} flex-1 justify-between ${isHidden ? 'cursor-default' : ''}`}
            style={{ paddingLeft: `${12 + depth * 12}px` }}
          >
            <div className="flex items-center gap-3">
              <item.icon className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium">{item.name}</span>
            </div>
            {!isHidden && (isOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            ))}
          </button>
          {editMode && onToggleHide && (
            <button
              onClick={() => onToggleHide(item.name)}
              className="p-1.5 text-discord-light hover:text-white shrink-0"
              title={isHidden ? 'Restore item' : 'Hide item'}
            >
              {isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          )}
        </div>
        {isOpen && !isHidden && (
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
    <div className={`flex items-center gap-1 ${isHidden ? hiddenClasses : ''}`}>
      <NavLink
        to={item.href}
        end={item.href.split('/').length <= 4}
        onClick={onClose}
        className={({ isActive }) =>
          `${baseClasses} flex-1 ${isActive ? activeClasses : ''}`
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
      {editMode && onToggleHide && (
        <button
          onClick={() => onToggleHide(item.name)}
          className="p-1.5 text-discord-light hover:text-white shrink-0"
          title={isHidden ? 'Restore item' : 'Hide item'}
        >
          {isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
}

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const { guildId } = useParams<{ guildId: string }>();
  const [editMode, setEditMode] = useState(false);
  const queryClient = useQueryClient();

  const { data: preferences } = useQuery({
    queryKey: ['me-preferences'],
    queryFn: preferencesApi.get,
    staleTime: Infinity,
  });

  const hiddenNav: string[] = preferences?.hidden_nav ?? [];

  const updateMutation = useMutation({
    mutationFn: preferencesApi.update,
    onMutate: async (newPrefs) => {
      await queryClient.cancelQueries({ queryKey: ['me-preferences'] });
      const previous = queryClient.getQueryData<{ hidden_nav: string[] }>(['me-preferences']);
      queryClient.setQueryData(['me-preferences'], newPrefs);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(['me-preferences'], ctx?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['me-preferences'] });
    },
  });

  function toggleHide(name: string) {
    const next = hiddenNav.includes(name)
      ? hiddenNav.filter(n => n !== name)
      : [...hiddenNav, name];
    updateMutation.mutate({ hidden_nav: next });
  }

  if (!guildId) {
    return null;
  }

  const allNavItems = getNavItems(guildId);
  const visibleItems = allNavItems.filter(item => !hiddenNav.includes(item.name));
  const hiddenItems = allNavItems.filter(item => hiddenNav.includes(item.name));

  return (
    <OnCloseContext.Provider value={onClose}>
      <aside className="w-64 bg-discord-darker border-r border-discord-dark shrink-0 overflow-y-auto h-full overscroll-contain">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-discord-light uppercase tracking-wider">
              Server Settings
            </h2>
            <div className="flex items-center gap-1">
              {editMode ? (
                <button
                  onClick={() => setEditMode(false)}
                  className="text-xs text-discord-blurple hover:text-white transition-colors px-2 py-1 rounded"
                >
                  Done
                </button>
              ) : (
                <button
                  onClick={() => setEditMode(true)}
                  className="text-discord-light hover:text-white transition-colors"
                  title="Customize sidebar"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              {onClose && (
                <button
                  onClick={onClose}
                  aria-label="Close menu"
                  className="text-discord-light hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          <nav className="space-y-1">
            {visibleItems.map((item) => (
              <NavItemComponent
                key={item.href}
                item={item}
                editMode={editMode}
                onToggleHide={editMode ? toggleHide : undefined}
              />
            ))}
          </nav>

          {editMode && hiddenItems.length > 0 && (
            <div className="mt-4 pt-4 border-t border-discord-dark">
              <p className="text-xs font-semibold text-discord-light uppercase tracking-wider mb-2">
                Hidden ({hiddenItems.length})
              </p>
              <nav className="space-y-1">
                {hiddenItems.map((item) => (
                  <NavItemComponent
                    key={item.href}
                    item={item}
                    editMode={editMode}
                    isHidden={true}
                    onToggleHide={toggleHide}
                  />
                ))}
              </nav>
            </div>
          )}
        </div>
      </aside>
    </OnCloseContext.Provider>
  );
}
