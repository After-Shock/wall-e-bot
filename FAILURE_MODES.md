# Current failure modes

## Operational failure table

| Failure | Current behavior | Recovery / limitation |
|---|---|---|
| PostgreSQL unavailable | Readiness fails; database-backed bot/API operations fail. Transactions roll back, and the persistent volume remains authoritative. | Restore database availability before serving dependent traffic; use external PostgreSQL backups for disaster recovery. |
| Redis unavailable | Readiness fails and sessions, rate limiting, queues, cooldowns, and caches are disrupted. Standard production and Saltbox Compose enable AOF, but AOF is not a substitute for backup. | Restore Redis; users may need to sign in again and transient state may be lost. Durable domain state remains in PostgreSQL. |
| Discord API/gateway interruption | discord.js attempts gateway recovery; in-flight commands or deliveries can fail. | Inspect structured logs and status. A heartbeat does not prove an individual Discord action succeeded. |
| Bot or host failure during scheduled delivery | Due work remains database-backed, and repeated delivery failures record error/count metadata. An occurrence already claimed before Discord accepted it can be lost. | Restart the single bot process and inspect scheduled-message failure state; there is no exactly-once delivery guarantee. |
| Multiple bot processes | Interval maintenance runs in each process and queue work is not consistently shard-owned. | Do not scale or enable sharding until scheduler ownership is designed and tested. |
| Migration failure | The failing step rolls back; later steps do not run. A checksum mismatch fails the explicitly invoked migration command rather than accepting edited history; backend startup does not run migrations automatically. | Fix forward with a new migration or correct the unapplied step, then rerun before replacing services. Never edit an applied migration. |
| Host disk exhaustion or lost volume | PostgreSQL/Redis writes can fail despite container restart policies. | Monitor host/volume capacity and maintain tested off-host backups. Repository configuration cannot recover lost PostgreSQL data. |
| Backend/frontend restart | In-flight HTTP requests fail while containers restart; Redis-backed sessions normally survive. | Health/readiness checks and restart policies restore service; clients retry safe requests. |

## Coverage limits

CI unit and migration-discovery tests intentionally run without PostgreSQL or Redis service containers. This accurately reflects the current suite, but it also means database integration, OAuth, Discord, and browser flows require separate smoke testing. Follow [docs/testing.md](docs/testing.md), and do not treat manual guild-configuration snapshots as full backups.
