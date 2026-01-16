# Telegram module

Structure aligned with the scheme:

- `telegram-client` -> Telegram Client (polling + forwarding)
- `bot-logic` -> Bot Logic service (auth + main integration)
- `nginx` -> reverse proxy for Bot Logic
- `redis` -> external service used by Bot Logic (state store)

## Local run (mocked)

1. Start Bot Logic with mocks:
   - `cd telegram/bot-logic`
   - `npm install`
   - `USE_MOCKS=true USE_REDIS=false npm run dev`
2. Start Telegram Client:
   - `cd telegram/telegram-client`
   - `npm install`
   - `BOT_LOGIC_URL=http://localhost:3005 npm run dev`

## With Nginx

1. Start Bot Logic on port `3005`.
2. Run Nginx from `telegram/nginx`.
3. Set `BOT_LOGIC_URL=http://localhost:8080` for Telegram Client.

## Docker compose

Run everything (Bot Logic, Redis, Nginx, Telegram Client):

1. Set `TELEGRAM_TOKEN` in your environment.
2. From `telegram/` run:
   - `docker compose up --build`

## Scaling Bot Logic

To run multiple Bot Logic workers behind Nginx:

```
docker compose up --build --scale bot-logic=3
```

Nginx will load-balance across all `bot-logic` containers.
