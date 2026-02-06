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
- Docker & Docker Compose v2+
- A Discord Application (from Discord Developer Portal)

### Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/After-Shock/wall-e-bot.git
   cd wall-e-bot
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Configure your `.env` file with your Discord credentials (see Environment Variables section)

4. Start development with Docker:
   ```bash
   npm run docker:dev
   ```

5. Access the dashboard at `http://localhost:3000`

### Production Deployment

```bash
npm run docker:prod
```

## Docker Compose Reference

The project includes two Docker Compose configurations in the `docker/` directory:

### Services Overview

| Service | Description | Ports | Image |
|---------|-------------|-------|-------|
| `postgres` | PostgreSQL database for persistent storage | 5432 (dev only) | postgres:16-alpine |
| `redis` | Redis cache for sessions and rate limiting | 6379 (dev only) | redis:7-alpine |
| `bot` | Discord bot application | - | Custom (Node.js) |
| `backend` | Express.js REST API | 3001 | Custom (Node.js) |
| `frontend` | React dashboard | 3000 (dev), 80 (prod) | Custom (nginx) |

### Development (`docker-compose.dev.yml`)

Optimized for local development with hot-reloading and exposed database ports.

```bash
# Start all services
docker compose -f docker/docker-compose.dev.yml up -d

# View logs
docker compose -f docker/docker-compose.dev.yml logs -f

# Stop all services
docker compose -f docker/docker-compose.dev.yml down

# Rebuild after code changes
docker compose -f docker/docker-compose.dev.yml up -d --build
```

**Features:**
- Volume mounts for live code reloading
- Exposed PostgreSQL (5432) and Redis (6379) ports for local debugging
- No restart policies (manual control)

### Production (`docker-compose.yml`)

Optimized for production deployment with security and reliability.

```bash
# Start production stack
docker compose -f docker/docker-compose.yml up -d

# Scale bot instances (if needed)
docker compose -f docker/docker-compose.yml up -d --scale bot=2

# View resource usage
docker stats

# Update and restart
docker compose -f docker/docker-compose.yml pull
docker compose -f docker/docker-compose.yml up -d --build
```

**Features:**
- Multi-stage builds for smaller images
- Health checks on all services
- Automatic restart policies (`unless-stopped`)
- No exposed database ports (internal network only)
- Nginx reverse proxy for frontend

### Useful Commands

```bash
# Access PostgreSQL shell
docker exec -it wall-e-postgres psql -U wallE -d wall_e_bot

# Access Redis CLI
docker exec -it wall-e-redis redis-cli

# View bot logs only
docker logs -f wall-e-bot

# Restart a single service
docker compose -f docker/docker-compose.yml restart bot

# Remove all data (fresh start)
docker compose -f docker/docker-compose.yml down -v
```

### Resource Requirements

**Minimum (Development):**
- 2 CPU cores
- 2GB RAM
- 5GB disk space

**Recommended (Production):**
- 4 CPU cores
- 4GB RAM
- 20GB disk space (for logs and database)

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_TOKEN` | Bot token from Discord Developer Portal | Yes |
| `DISCORD_CLIENT_ID` | Application client ID | Yes |
| `DISCORD_CLIENT_SECRET` | OAuth2 client secret (for dashboard) | Yes |
| `DATABASE_URL` | PostgreSQL connection string | Auto (Docker) |
| `REDIS_URL` | Redis connection string | Auto (Docker) |
| `JWT_SECRET` | Secret for JWT token signing | Yes |
| `DASHBOARD_URL` | Frontend URL for OAuth callbacks | Yes |

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
