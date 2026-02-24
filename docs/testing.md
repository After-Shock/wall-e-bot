# Testing Guide

## Automated Tests

Run the full test suite (no Discord or database required):

```bash
cd /home/plex/wall-e-bot
npx jest --no-coverage
```

All 32 tests should pass across 3 suites (`ticketUtils`, `DatabaseService`, `SchedulerService`).

---

## Local Dev Environment (Docker)

### Prerequisites

- Docker + Docker Compose
- A Discord bot token — create an application at https://discord.com/developers/applications
- Enable all **Privileged Gateway Intents** (Server Members, Message Content) in the Bot tab

### Step 1 — Configure `.env`

```bash
cp .env.example .env
```

Fill in at minimum:

```env
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
DISCORD_CLIENT_SECRET=your_oauth2_secret
BOT_OWNER_ID=your_discord_user_id
DB_PASSWORD=somesecurepassword
SESSION_SECRET=generate_with_openssl_rand_-base64_32
JWT_SECRET=generate_with_openssl_rand_-base64_32
DASHBOARD_URL=http://localhost:3002
API_URL=http://localhost:3001
```

### Step 2 — Start the stack

```bash
docker compose -f docker/docker-compose.dev.yml up -d
docker compose -f docker/docker-compose.dev.yml logs -f
```

Services:
| Service | URL |
|---|---|
| Frontend dashboard | http://localhost:3002 |
| Backend API | http://localhost:3001 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

### Step 3 — Run the database migration

```bash
DATABASE_URL=postgresql://wallE:password@localhost:5432/wall_e_bot \
  npx ts-node dashboard/backend/src/db/migrate.ts
```

Verify tables were created:
```bash
psql postgresql://wallE:password@localhost:5432/wall_e_bot -c "\dt ticket*"
```

Expected output: `ticket_categories`, `ticket_config`, `ticket_form_fields`, `ticket_panels`, `tickets`

### Step 4 — Register slash commands

```bash
cd bot && npx ts-node src/deploy-commands.ts
```

---

## Testing the Ticket System in Discord

### Setup a panel

```
/ticket panel create name:Support style:channel type:buttons
/ticket category add panel_id:1 name:General Support emoji:🎫 support_role:@Staff
/ticket panel send panel_id:1 #support
```

To test dropdowns instead:
```
/ticket panel create name:Appeals style:channel type:dropdown
```

### Open a ticket (as a regular user)

1. Go to `#support`, click the **General Support** button
2. If the category has form fields, a Discord modal pops up — fill it in
3. A new ticket channel is created with a welcome embed, Close button, and role pings
4. User receives a DM: "Your ticket has been opened"

### Close a ticket

1. Click **Close Ticket** in the channel (or `/ticket close reason:resolved`)
2. A two-step confirm dialog appears
3. On confirm:
   - Transcript `.txt` file saved to your transcript channel (if configured)
   - Channel renamed to `closed-<name>` and moved to closed category (if configured)
   - User receives a DM with the close reason

### Add a form to a ticket category

Via dashboard (Settings → Panels → expand panel → expand category → Add Question), or via API:

```bash
curl -X POST http://localhost:3001/api/guilds/<guildId>/ticket-categories/<categoryId>/form-fields \
  -H "Content-Type: application/json" \
  -d '{"label":"What is your issue?","style":"paragraph","required":true}'
```

Next time a user opens that category, a modal appears with your custom question.

### Test auto-close

1. Set `auto_close_hours` to `1` in the dashboard Settings tab
2. To simulate without waiting, run in psql:
   ```sql
   UPDATE tickets SET last_activity = NOW() - INTERVAL '2 hours' WHERE status = 'open';
   ```
3. The scheduler checks every hour. On next run: warning embed sent, `warned_inactive = TRUE`
4. On the run after that: ticket auto-closed, channel archived

### Feature checklist

| Feature | How to verify |
|---|---|
| Multi-panel routing | Create 2 panels, send to different channels, open tickets from each |
| Dropdown panel | Create with `type:dropdown`, verify select menu appears instead of buttons |
| Custom form modal | Add form fields to a category, open a ticket — modal should appear |
| Form answers in welcome | After opening, check the welcome embed shows your answers |
| Closed-category archiving | Set `category_closed_id` on a panel, close a ticket — channel moves |
| Transcript auto-save | Set transcript channel ID in Settings, close a ticket — file appears |
| Max tickets per user | Set max to 1 in Settings, try opening a second ticket — ephemeral error |
| Staff claim | `/ticket claim` in an open ticket channel |
| Auto-close warning | Go inactive for `auto_close_hours` — warning embed appears |
| Thread-style tickets | Create a panel with `style:thread` |

---

## Dashboard Testing

Open http://localhost:3002, log in via Discord OAuth.

**Panels tab:**
- Create a panel → should appear in the list
- Expand → configure style, panel type, category IDs, channel name template
- Add a category → set emoji, name, description
- Expand category → Add Question → fill in label, style (short/paragraph)
- Delete a field → should disappear instantly

**Settings tab:**
- Set transcript channel ID (paste a Discord channel ID)
- Adjust max tickets per user and auto-close hours
- Save → success (no error banner)

**Active Tickets tab:**
- Open a ticket in Discord → it appears here within seconds (after refresh)
- Shows ticket number, status badge, panel/category, user mention, age

---

## Production Deployment (Saltbox + Traefik on VPS)

### Prerequisites on the VPS

- [Saltbox](https://docs.saltbox.dev) installed and running
- Traefik configured (comes with Saltbox)
- A domain with a wildcard DNS record pointing to your VPS IP, e.g. `*.yourdomain.com → <VPS IP>`
- Cloudflare DNS (Traefik uses `cfdns` cert resolver by default in Saltbox)

### Step 1 — Clone the repo on your VPS

```bash
git clone <your-repo-url> /opt/wall-e-bot
cd /opt/wall-e-bot
```

Or pull latest if already cloned:
```bash
cd /opt/wall-e-bot && git pull
```

### Step 2 — Configure `.env`

```bash
cp .env.example .env
nano .env
```

Required additions beyond the local dev values:

```env
# Saltbox domain config
DOMAIN=yourdomain.com
WALL_E_DOMAIN=wall-e.yourdomain.com

# Discord OAuth2 — must match redirect URI in Developer Portal
# Add https://wall-e.yourdomain.com/auth/callback as a redirect URI
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_TOKEN=...

# Secure secrets (generate fresh values)
DB_PASSWORD=<long random string>
SESSION_SECRET=<openssl rand -base64 32>
JWT_SECRET=<openssl rand -base64 32>

DASHBOARD_URL=https://wall-e.yourdomain.com
API_URL=https://wall-e.yourdomain.com/api
```

### Step 3 — Create data directories

```bash
mkdir -p /opt/wall-e-bot/postgres /opt/wall-e-bot/redis
```

### Step 4 — Build and start

```bash
cd /opt/wall-e-bot
docker compose -f docker/docker-compose.saltbox.yml up -d --build
```

Watch logs:
```bash
docker compose -f docker/docker-compose.saltbox.yml logs -f
```

### Step 5 — Run the migration

```bash
docker exec wall-e-backend node -e "
  const { migrate } = require('./dist/db/migrate.js');
  migrate().then(() => process.exit(0));
"
```

Or connect to the container and run:
```bash
docker exec -it wall-e-backend sh
node dist/db/migrate.js
```

### Step 6 — Register slash commands

```bash
docker exec wall-e-bot node dist/deploy-commands.js
```

### Step 7 — Verify

- Dashboard: https://wall-e.yourdomain.com
- API health: https://wall-e.yourdomain.com/api/health
- Bot online: check your Discord server — bot should show as online

### How Traefik routing works

```
https://wall-e.yourdomain.com          → wall-e-frontend (nginx on :80)
https://wall-e.yourdomain.com/api/*    → wall-e-backend (Express on :3001)
```

Both routes share the same domain. Traefik handles TLS termination via Let's Encrypt + Cloudflare DNS challenge (cert resolver `cfdns`). The Saltbox network (`saltbox`) connects all containers to Traefik.

### Updating after code changes

```bash
cd /opt/wall-e-bot
git pull
docker compose -f docker/docker-compose.saltbox.yml up -d --build
```

Only changed images are rebuilt. The bot reconnects to Discord automatically once the container is back up.

### Useful commands

```bash
# View logs for a specific service
docker logs wall-e-bot -f
docker logs wall-e-backend -f

# Restart a single service
docker restart wall-e-bot

# Open a psql shell
docker exec -it wall-e-postgres psql -U wall_e -d wall_e_bot

# Check all containers are healthy
docker ps --filter name=wall-e
```
