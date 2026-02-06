import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import GuildLayout from './components/GuildLayout';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import GuildOverviewPage from './pages/GuildOverviewPage';
import GuildPage from './pages/GuildPage';
import FeaturePage from './pages/FeaturePage';
import NotFoundPage from './pages/NotFoundPage';
import {
  MessageSquare,
  Shield,
  ShieldAlert,
  ScrollText,
  Smile,
  Terminal,
  Star,
  TrendingUp,
  Bell,
  Zap,
  Palette,
  Lightbulb,
  MessageCircle,
  Settings,
  Users,
} from 'lucide-react';

// Feature page wrapper component
const Feature = ({ title, description, icon }: { title: string; description: string; icon: React.ComponentType<{ className?: string }> }) => (
  <FeaturePage title={title} description={description} icon={icon} />
);

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        {/* Public pages */}
        <Route index element={<HomePage />} />
        
        {/* Server selection */}
        <Route path="dashboard" element={<DashboardPage />} />
        
        {/* Guild-specific pages with sidebar */}
        <Route path="dashboard/:guildId" element={<GuildLayout />}>
          <Route index element={<GuildOverviewPage />} />
          
          {/* Welcome */}
          <Route path="welcome" element={<Feature title="Welcome" description="Configure welcome messages, auto-roles, and server rules for new members." icon={MessageSquare} />} />
          <Route path="welcome/messages" element={<Feature title="Welcome Messages" description="Set up custom welcome and farewell messages with embed support and variables." icon={MessageSquare} />} />
          <Route path="welcome/autoroles" element={<Feature title="Auto Roles" description="Automatically assign roles to new members when they join your server." icon={Users} />} />
          <Route path="welcome/rules" element={<Feature title="Server Rules" description="Display server rules and require members to accept them before accessing the server." icon={ScrollText} />} />
          
          {/* Moderation */}
          <Route path="moderation" element={<Feature title="Moderation" description="View and manage moderation actions, warnings, and bans." icon={Shield} />} />
          <Route path="moderation/actions" element={<Feature title="Mod Actions" description="View recent moderation actions and manage punishments." icon={Shield} />} />
          <Route path="moderation/warnings" element={<Feature title="Warnings" description="View and manage member warnings and strikes." icon={ShieldAlert} />} />
          <Route path="moderation/tempbans" element={<Feature title="Temp Bans" description="View and manage temporary bans." icon={Shield} />} />
          
          {/* Auto-Mod */}
          <Route path="automod" element={<Feature title="Auto-Mod" description="Configure automatic moderation to protect your server from spam and abuse." icon={ShieldAlert} />} />
          <Route path="automod/spam" element={<Feature title="Spam Protection" description="Configure spam detection and rate limiting." icon={ShieldAlert} />} />
          <Route path="automod/filters" element={<Feature title="Word Filters" description="Set up word blacklists and content filters." icon={Terminal} />} />
          <Route path="automod/links" element={<Feature title="Link Protection" description="Control which links can be posted in your server." icon={Zap} />} />
          
          {/* Logging */}
          <Route path="logging" element={<Feature title="Logging" description="Configure logging for messages, members, moderation actions, and more." icon={ScrollText} />} />
          
          {/* Reaction Roles */}
          <Route path="reaction-roles" element={<Feature title="Reaction Roles" description="Create reaction role messages for self-assignable roles." icon={Smile} />} />
          
          {/* Custom Commands */}
          <Route path="commands" element={<Feature title="Custom Commands" description="Create custom commands with variables, embeds, and advanced logic." icon={Terminal} />} />
          
          {/* Starboard */}
          <Route path="starboard" element={<Feature title="Starboard" description="Highlight popular messages that receive star reactions." icon={Star} />} />
          
          {/* Leveling */}
          <Route path="leveling" element={<Feature title="Leveling" description="Configure the XP and leveling system for your server." icon={TrendingUp} />} />
          <Route path="leveling/settings" element={<Feature title="Leveling Settings" description="Configure XP rates, cooldowns, and level-up messages." icon={Settings} />} />
          <Route path="leveling/rewards" element={<Feature title="Role Rewards" description="Set up automatic role rewards for reaching certain levels." icon={Star} />} />
          <Route path="leveling/leaderboard" element={<Feature title="Leaderboard" description="View the server leaderboard and manage XP." icon={TrendingUp} />} />
          
          {/* Announcements */}
          <Route path="announcements" element={<Feature title="Announcements" description="Set up scheduled messages, Twitch alerts, and auto feeds." icon={Bell} />} />
          <Route path="announcements/scheduled" element={<Feature title="Scheduled Messages" description="Create recurring messages and announcements." icon={Bell} />} />
          <Route path="announcements/twitch" element={<Feature title="Twitch Alerts" description="Get notified when streamers go live." icon={Zap} />} />
          <Route path="announcements/feeds" element={<Feature title="Auto Feeds" description="Automatically post content from external sources." icon={Bell} />} />
          
          {/* Triggers */}
          <Route path="triggers" element={<Feature title="Triggers" description="Create automated responses triggered by specific messages or events." icon={Zap} />} />
          
          {/* Embeds */}
          <Route path="embeds" element={<Feature title="Embed Builder" description="Create and send custom embeds with a visual builder." icon={Palette} />} />
          
          {/* Suggestions */}
          <Route path="suggestions" element={<Feature title="Suggestions" description="Let members submit suggestions and vote on them." icon={Lightbulb} />} />
          
          {/* Tickets */}
          <Route path="tickets" element={<Feature title="Tickets" description="Set up a support ticket system for your server." icon={MessageCircle} />} />
          
          {/* Settings */}
          <Route path="settings" element={<GuildPage />} />
        </Route>
        
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default App;
