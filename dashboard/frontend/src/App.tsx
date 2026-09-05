import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import GuildLayout from './components/GuildLayout';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import GuildOverviewPage from './pages/GuildOverviewPage';
import GuildPage from './pages/GuildPage';
import NotFoundPage from './pages/NotFoundPage';

// Guild feature pages
import WelcomeMessagesPage from './pages/guild/WelcomeMessagesPage';
import AutoRolesPage from './pages/guild/AutoRolesPage';
import ModerationPage from './pages/guild/ModerationPage';
import WarningsPage from './pages/guild/WarningsPage';
import TempBansPage from './pages/guild/TempBansPage';
import AutoDeletePage from './pages/guild/AutoDeletePage';
import SpamProtectionPage from './pages/guild/SpamProtectionPage';
import WordFiltersPage from './pages/guild/WordFiltersPage';
import LinkProtectionPage from './pages/guild/LinkProtectionPage';
import ReactionRolesPage from './pages/guild/ReactionRolesPage';
import CustomCommandsPage from './pages/guild/CustomCommandsPage';
import LevelingSettingsPage from './pages/guild/LevelingSettingsPage';
import RoleRewardsPage from './pages/guild/RoleRewardsPage';
import LeaderboardPage from './pages/guild/LeaderboardPage';
import ScheduledMessagesPage from './pages/guild/ScheduledMessagesPage';
import TicketsPage from './pages/guild/TicketsPage';
import AdminPage from './pages/AdminPage';

// Premium features
import AnalyticsPage from './pages/guild/AnalyticsPage';
import BackupPage from './pages/guild/BackupPage';
import SyncPage from './pages/guild/SyncPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        {/* Public pages */}
        <Route index element={<HomePage />} />
        
        {/* Server selection */}
        <Route path="dashboard" element={<DashboardPage />} />

        {/* Bot admin panel */}
        <Route path="admin" element={<AdminPage />} />
        
        {/* Guild-specific pages with sidebar */}
        <Route path="dashboard/:guildId" element={<GuildLayout />}>
          <Route index element={<GuildOverviewPage />} />

          {/* Analytics (Premium) */}
          <Route path="analytics" element={<AnalyticsPage />} />

          {/* Welcome */}
          <Route path="welcome" element={<WelcomeMessagesPage />} />
          <Route path="welcome/messages" element={<WelcomeMessagesPage />} />
          <Route path="welcome/autoroles" element={<AutoRolesPage />} />
          
          {/* Moderation */}
          <Route path="moderation" element={<ModerationPage />} />
          <Route path="moderation/actions" element={<ModerationPage />} />
          <Route path="moderation/warnings" element={<WarningsPage />} />
          <Route path="moderation/tempbans" element={<TempBansPage />} />
          <Route path="moderation/auto-delete" element={<AutoDeletePage />} />
          
          {/* Auto-Mod */}
          <Route path="automod" element={<SpamProtectionPage />} />
          <Route path="automod/spam" element={<SpamProtectionPage />} />
          <Route path="automod/filters" element={<WordFiltersPage />} />
          <Route path="automod/links" element={<LinkProtectionPage />} />
          
          {/* Reaction Roles */}
          <Route path="reaction-roles" element={<ReactionRolesPage />} />
          
          {/* Custom Commands */}
          <Route path="commands" element={<CustomCommandsPage />} />
          
          {/* Leveling */}
          <Route path="leveling" element={<LevelingSettingsPage />} />
          <Route path="leveling/settings" element={<LevelingSettingsPage />} />
          <Route path="leveling/rewards" element={<RoleRewardsPage />} />
          <Route path="leveling/leaderboard" element={<LeaderboardPage />} />
          
          {/* Announcements */}
          <Route path="announcements" element={<ScheduledMessagesPage />} />
          <Route path="announcements/scheduled" element={<ScheduledMessagesPage />} />
          {/* Tickets */}
          <Route path="tickets" element={<TicketsPage />} />

          {/* Backup & Restore (Premium) */}
          <Route path="backup" element={<BackupPage />} />

          {/* Sync Settings */}
          <Route path="sync" element={<SyncPage />} />

          {/* Settings */}
          <Route path="settings" element={<GuildPage />} />
        </Route>
        
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default App;
