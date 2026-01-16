# Bot Logic

Bot Logic service for the Telegram module. It handles auth flow and main-module calls.

## Quick start

```bash
npm install
npm run dev
```

## Environment variables

```
BOT_LOGIC_PORT=3005
AUTH_MODULE_URL=http://auth-module:8001
MAIN_MODULE_URL=http://main-module:3002
USE_REDIS=true
REDIS_URL=redis://localhost:6379
REDIS_KEY_PREFIX=telegram:
USE_MOCKS=false
MOCK_AUTH_AUTO_APPROVE=false
```

## Endpoints

- `POST /api/telegram/update`
- `POST /api/telegram/cron/auth-check`
- `POST /api/telegram/cron/notifications`
- `GET /health`
