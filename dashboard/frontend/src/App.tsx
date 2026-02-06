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
import ServerRulesPage from './pages/guild/ServerRulesPage';
import ModerationPage from './pages/guild/ModerationPage';
import WarningsPage from './pages/guild/WarningsPage';
import TempBansPage from './pages/guild/TempBansPage';
import SpamProtectionPage from './pages/guild/SpamProtectionPage';
import WordFiltersPage from './pages/guild/WordFiltersPage';
import LinkProtectionPage from './pages/guild/LinkProtectionPage';
import LoggingPage from './pages/guild/LoggingPage';
import ReactionRolesPage from './pages/guild/ReactionRolesPage';
import CustomCommandsPage from './pages/guild/CustomCommandsPage';
import StarboardPage from './pages/guild/StarboardPage';
import LevelingSettingsPage from './pages/guild/LevelingSettingsPage';
import RoleRewardsPage from './pages/guild/RoleRewardsPage';
import LeaderboardPage from './pages/guild/LeaderboardPage';
import ScheduledMessagesPage from './pages/guild/ScheduledMessagesPage';
import TwitchAlertsPage from './pages/guild/TwitchAlertsPage';
import AutoFeedsPage from './pages/guild/AutoFeedsPage';
import TriggersPage from './pages/guild/TriggersPage';
import EmbedBuilderPage from './pages/guild/EmbedBuilderPage';
import SuggestionsPage from './pages/guild/SuggestionsPage';
import TicketsPage from './pages/guild/TicketsPage';

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
          <Route path="welcome" element={<WelcomeMessagesPage />} />
          <Route path="welcome/messages" element={<WelcomeMessagesPage />} />
          <Route path="welcome/autoroles" element={<AutoRolesPage />} />
          <Route path="welcome/rules" element={<ServerRulesPage />} />
          
          {/* Moderation */}
          <Route path="moderation" element={<ModerationPage />} />
          <Route path="moderation/actions" element={<ModerationPage />} />
          <Route path="moderation/warnings" element={<WarningsPage />} />
          <Route path="moderation/tempbans" element={<TempBansPage />} />
          
          {/* Auto-Mod */}
          <Route path="automod" element={<SpamProtectionPage />} />
          <Route path="automod/spam" element={<SpamProtectionPage />} />
          <Route path="automod/filters" element={<WordFiltersPage />} />
          <Route path="automod/links" element={<LinkProtectionPage />} />
          
          {/* Logging */}
          <Route path="logging" element={<LoggingPage />} />
          
          {/* Reaction Roles */}
          <Route path="reaction-roles" element={<ReactionRolesPage />} />
          
          {/* Custom Commands */}
          <Route path="commands" element={<CustomCommandsPage />} />
          
          {/* Starboard */}
          <Route path="starboard" element={<StarboardPage />} />
          
          {/* Leveling */}
          <Route path="leveling" element={<LevelingSettingsPage />} />
          <Route path="leveling/settings" element={<LevelingSettingsPage />} />
          <Route path="leveling/rewards" element={<RoleRewardsPage />} />
          <Route path="leveling/leaderboard" element={<LeaderboardPage />} />
          
          {/* Announcements */}
          <Route path="announcements" element={<ScheduledMessagesPage />} />
          <Route path="announcements/scheduled" element={<ScheduledMessagesPage />} />
          <Route path="announcements/twitch" element={<TwitchAlertsPage />} />
          <Route path="announcements/feeds" element={<AutoFeedsPage />} />
          
          {/* Triggers */}
          <Route path="triggers" element={<TriggersPage />} />
          
          {/* Embeds */}
          <Route path="embeds" element={<EmbedBuilderPage />} />
          
          {/* Suggestions */}
          <Route path="suggestions" element={<SuggestionsPage />} />
          
          {/* Tickets */}
          <Route path="tickets" element={<TicketsPage />} />
          
          {/* Settings */}
          <Route path="settings" element={<GuildPage />} />
        </Route>
        
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default App;
