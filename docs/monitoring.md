# Monitoring

There is no metrics stack on this host and none is needed for a bot this size.
There *is* uptime-kuma, so the API makes the judgement and the monitor reacts to
it.

## Endpoints

| Endpoint | Meaning |
|---|---|
| `GET /health` | Liveness. 200 whenever the process is up. |
| `GET /health/live` | Same, plus pid and memory. |
| `GET /health/ready` | Readiness. 503 if Postgres or Redis do not answer. |
| `GET /health/status` | **Operational judgement.** See below. |
| `GET /health/detailed` | Process internals. Bot-owner only. |

## `/health/status`

Returns `status: ok | degraded | down`.

- **down → HTTP 503.** Postgres or Redis unreachable, or the bot's scheduler has
  not ticked in 3 minutes (it ticks every 60s).
- **degraded → HTTP 200.** Works, but something needs a human: scheduled
  messages overdue by >10 minutes, tasks auto-disabled after repeated failures,
  job failures in the last 24h, or Discord rate limits in the last hour.
- **ok → HTTP 200.**

## Recommended uptime-kuma monitors

Two, because they answer different questions:

1. **Outage** — HTTP(s), `http://wall-e-backend:3001/health/status`.
   Default "accepted status codes" of `200-299` already fails on the 503.
   Notify immediately.

2. **Needs attention** — HTTP(s) Keyword, same URL, keyword `"status":"ok"`.
   This one fails on `degraded` too. Give it a longer retry interval so a
   single late task does not page anyone.

uptime-kuma shares the `wall-e-network` bridge, so it can reach the backend by
container name without the endpoint being public.

## What is deliberately not measured

Request rates, latency histograms, per-command counters. Nothing would read
them. The checks above exist because each one corresponds to a failure that
actually happened and was silent at the time:

- a scheduled task retrying forever against a deleted channel
- temp bans marked lifted without being lifted
- a Redis pub/sub subscriber that never connected
- the scheduler tick throwing and only landing in `failed_jobs`

## Sentry

`initSentry()` runs in both processes but **`SENTRY_DSN` is not set**, so
exception tracking is inert — the log line `[Sentry] SENTRY_DSN not set — error
tracking disabled` confirms it on every boot. Set `SENTRY_DSN` in `.env` to turn
it on. Until then, unhandled errors exist only in `docker compose logs`, which
nothing watches.
