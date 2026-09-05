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
  or Discord rate limits in the last hour.
- **ok → HTTP 200.**

## Recommended uptime-kuma monitors

Three, because they answer different questions. The third is not optional —
see the warning below it.

1. **Outage** — HTTP(s), `http://wall-e-backend:3001/health/status`.
   Default "accepted status codes" of `200-299` already fails on the 503.
   Notify immediately.

2. **Needs attention** — HTTP(s) **Json Query**, same URL, json path `status`,
   expected value `ok`. Fails on `degraded` too. Longer interval so a single
   late task does not page anyone.

   > Not a Keyword monitor. `"status":"ok"` appears **six** times in a healthy
   > body — once at the top level and once per nested check — so a keyword match
   > still succeeds when the top-level status is `degraded`, and the monitor
   > would never fire. Verified: injecting a degraded state produced
   > `200 - OK, but value is not equal to expected value, value was: [degraded]`
   > from the json-query monitor.

3. **The user's actual path** — HTTP(s), `https://wall-e.sullyflix.com/api/guilds`,
   with accepted status codes set to **`401`**. An unauthenticated 401 proves the
   whole chain works: Traefik → nginx → backend. A 502 here means the proxy path
   is broken.

> **Monitors 1 and 2 talk to the backend directly and therefore cannot see a
> broken proxy.** This is not hypothetical: on 2026-09-01 nginx cached the
> backend's container IP at startup, the backend was later recreated on a new
> IP, and every `/api` and `/auth` request 502'd for 37 hours — while
> `/health/status` reported `ok` the entire time, because it was being polled on
> the backend itself. Monitoring a component tells you the component is fine. It
> does not tell you anyone can reach it. Monitor 3 is the one that would have
> caught it.
>
> The underlying cause is fixed (`docker/nginx.conf` now re-resolves via
> Docker's DNS per request), but the monitoring lesson stands for every future
> failure between the user and the app.

uptime-kuma shares the `wall-e-network` bridge, so it can reach the backend by
container name without the endpoint being public. Note that image has `curl`
but **no `wget`**, if you ever test from inside it.

`/health/*` is deliberately NOT proxied by nginx — only `/api` and `/auth` are.
A public request to `/health/status` returns the SPA's `index.html` with a 200,
which would make a public monitor on that path permanently and misleadingly
green. Use monitor 3's `/api/guilds` for the external check instead.

## Current state

Configured in uptime-kuma on 2026-09-03 as monitors 5, 6 and 7, alongside the
four pre-existing Jellyfin monitors. All three verified beating.

**They have no notification attached.** The four notification channels on this
instance are all Jellyfin-specific Discord webhooks; sending Wall-E alerts to a
channel named for a media server would be worse than useless. Create a Wall-E
notification in the UI (Settings → Notifications) and attach it to monitors 5-7,
otherwise these report in the dashboard but page nobody.

Detection was verified end to end rather than assumed, by setting the
`health:bot:rate_limited` Redis key to force a `degraded` response and watching
monitor 6 go down, then removing it and watching it recover. That key is the
least invasive lever: no Discord side effects, no database rows, one `DEL` to
undo.

## What is deliberately not measured

The `failed_jobs` table is retained as historical migration data, but the
removed queue no longer writes it, so old rows are not a live health signal.

Request rates, latency histograms, and per-command counters are also omitted;
nothing would read them. The checks above exist because each one corresponds
to a failure that actually happened and was silent at the time:

- a scheduled task retrying forever against a deleted channel
- temp bans marked lifted without being lifted
- a Redis pub/sub subscriber that never connected
- the scheduler heartbeat stopping while the API itself remained healthy
- nginx holding a stale backend IP, 502ing every API and auth request for 37
  hours while the backend itself reported healthy

## Sentry

`initSentry()` runs in both processes but **`SENTRY_DSN` is not set**, so
exception tracking is inert — the log line `[Sentry] SENTRY_DSN not set — error
tracking disabled` confirms it on every boot. Set `SENTRY_DSN` in `.env` to turn
it on. Until then, unhandled errors exist only in `docker compose logs`, which
nothing watches.
