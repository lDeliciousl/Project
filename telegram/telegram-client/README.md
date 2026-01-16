# Telegram Client

Telegram Client receives updates from Telegram and forwards them to Bot Logic.

## Quick start

1. Create `.env.local` (example below).
2. Install dependencies.
3. Run in dev mode.

```bash
npm install
npm run dev
```

## Environment variables

```
TELEGRAM_TOKEN=your_bot_token
BOT_LOGIC_URL=http://localhost:3005
RUN_TELEGRAM_CLIENT=true
POLL_INTERVAL_MS=1000
CRON_AUTH_CHECK_MS=15000
CRON_NOTIFICATIONS_MS=20000
```

## How to verify independently

1. Start Bot Logic (`telegram/bot-logic`) with mocks enabled.
2. Start Telegram Client with `npm run dev`.
3. In Telegram, send `/login?type=code` and then `/tests`.
4. You should receive a mock login code, then mocked tests list.

## Nginx (optional)

If you want the exact structure from the diagram, place Nginx in front of Bot Logic.
Config is in `telegram/nginx/nginx.conf`. Point Telegram Client to it:

- Set `BOT_LOGIC_URL=http://localhost:8080`
- Run Nginx with the provided `nginx/Dockerfile`

## Useful commands

- `/start` and `/help`
- `/login?type=github|yandex|code`
- `/logout` or `/logout all=true`
- `/tests`
