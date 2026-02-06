# Wall-E Bot 🤖

A feature-rich Discord bot with a web dashboard, inspired by YAGPDB, Carl-bot, and MEE6.

## Features

### Moderation
- **Kick/Ban/Mute** - Standard moderation commands with reason logging
- **Warn System** - Track and manage user warnings
- **Auto-Mod** - Spam detection, word filters, caps lock detection, link filtering
- **Raid Protection** - Automatic lockdown during raids
- **Moderation Logs** - Comprehensive logging of all mod actions

### Server Management
- **Reaction Roles** - Let users self-assign roles via reactions
- **Welcome/Leave Messages** - Customizable welcome and goodbye messages
- **Auto Roles** - Automatically assign roles to new members
- **Custom Commands** - Create server-specific commands
- **Starboard** - Highlight popular messages

### Leveling System
- **XP & Levels** - Reward active members with XP
- **Role Rewards** - Auto-assign roles at certain levels
- **Leaderboards** - Server and global leaderboards
- **Customizable** - Configure XP rates, level-up messages

### Utility
- **Server Info** - Detailed server and user information
- **Polls** - Create polls with reactions
- **Reminders** - Set personal reminders
- **Tags** - Quick response system
- **Search** - YouTube, Wikipedia, Urban Dictionary lookups

### Dashboard
- **Server Management** - Configure all features from the web
- **Analytics** - View server statistics and growth
- **Customization** - Change bot avatar, nickname per server
- **Premium Features** - Manage premium subscriptions

## Tech Stack

- **Bot**: Node.js, TypeScript, Discord.js v14
- **Backend**: Express.js, PostgreSQL, Redis
- **Frontend**: React, TailwindCSS
- **Infrastructure**: Docker, Docker Compose

## Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- A Discord Application (from Discord Developer Portal)

### Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/wall-e-bot.git
   cd wall-e-bot
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Configure your `.env` file with your Discord credentials

4. Start development with Docker:
   ```bash
   npm run docker:dev
   ```

   Or without Docker:
   ```bash
   npm install
   npm run dev
   ```

5. Access the dashboard at `http://localhost:3000`

### Production Deployment

```bash
npm run docker:prod
```

## Project Structure

```
wall-e-bot/
├── bot/                    # Discord bot
│   └── src/
│       ├── commands/       # Slash commands
│       ├── events/         # Discord events
│       ├── services/       # Business logic
│       └── structures/     # Core classes
├── dashboard/
│   ├── backend/           # Express.js API
│   └── frontend/          # React dashboard
├── shared/                # Shared types & utilities
└── docker/                # Docker configurations
```

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT License - see [LICENSE](LICENSE) for details.
