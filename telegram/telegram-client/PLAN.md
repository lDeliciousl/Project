# Telegram module plan

This plan is based on `task_flow.md` and scoped strictly to the Telegram module.
It targets two components inside the Telegram domain:

- `Telegram Client`: receives updates from Telegram and forwards to Bot Logic.
- `Bot Logic`: handles auth/test flows, uses Redis/Auth/Main modules.

## 1) Scope and responsibilities

**Telegram Client**
- Polls or receives webhooks from Telegram.
- Parses updates to a normalized message event.
- Routes command to Bot Logic (HTTP).
- Sends responses back to Telegram.
- Runs scheduled tasks: auth check + notifications.

**Bot Logic**
- Stateless HTTP API for message handling and scheduled tasks.
- Loads user state from Redis using `chat_id`.
- Integrates with Auth module and Main module.
- Produces response payloads for Telegram Client.

## 2) High-level data flow (from task_flow.md)

### 2.1 Unknown user (first contact)
1. Telegram Client gets message update.
2. Sends normalized request to Bot Logic.
3. Bot Logic checks Redis by `chat_id`.
4. If no state:
   - For `/login` without `type`: return "not logged in" + options.
   - For `/login?type=github|yandex|code`:
     - Create login token.
     - Store state = Anonymous + login token.
     - Call Auth module to get auth URL/code.
     - Return response for Telegram Client to send.

### 2.2 Anonymous user
- Same flow as in task_flow.md:
  - `/login?type=...` issues new login token.
  - Other messages: check login token via Auth module.
  - If login expired/rejected: delete Redis state and prompt login.
  - If login approved: store Access/Refresh tokens and set status = Authorized.

### 2.3 Authorized user
- `/login` -> "already authorized".
- `/logout` -> delete state from Redis.
- `/logout all=true` -> delete Redis + call Auth `/logout`.
- Any other command -> call Main module with access token.
- If Main returns 401: refresh via Auth, update Redis, retry once.

### 2.4 Scheduled tasks (Telegram Client)
- **Login check**: Bot Logic fetches all Anonymous states from Redis and checks Auth.
- **Notifications**: Bot Logic fetches all Authorized states, pulls `/notification` from Main.

## 3) Interfaces and contracts

### 3.1 Telegram Client -> Bot Logic
`POST /api/telegram/update`
```json
{
  "chat_id": "123456",
  "message_id": "42",
  "text": "/login?type=github",
  "timestamp": 1700000000,
  "user": {
    "username": "user",
    "first_name": "Name",
    "last_name": "Surname"
  }
}
```

Response:
```json
{
  "messages": [
    { "text": "auth url: https://..." }
  ]
}
```

### 3.2 Telegram Client -> Bot Logic (scheduled)
`POST /api/telegram/cron/auth-check`
```json
{ "limit": 100 }
```

`POST /api/telegram/cron/notifications`
```json
{ "limit": 100 }
```

Responses: array of `{ chat_id, messages[] }`.

### 3.3 Bot Logic -> Auth module
Expected minimal endpoints (already used by Web client):
- `POST /api/auth/init` (type + login_token)
- `GET /api/auth/verify/:login_token`
- `POST /api/auth/refresh` (refresh_token)
- `POST /api/auth/logout` (refresh_token)

### 3.4 Bot Logic -> Main module
Use same endpoints as Web client, with access token header.
For notifications:
- `GET /api/notification`
- `DELETE /api/notification` (or similar)

## 4) State model in Redis

Key: `chat_id`
Value:
```json
{
  "status": "anonymous" | "authorized",
  "login_token": "token",
  "access_token": "jwt",
  "refresh_token": "jwt",
  "updated_at": "iso8601"
}
```

## 5) Configuration

Environment variables:
- `TELEGRAM_TOKEN`
- `BOT_LOGIC_URL`
- `REDIS_URL`
- `AUTH_MODULE_URL`
- `MAIN_MODULE_URL`
- `POLL_INTERVAL_MS`
- `CRON_AUTH_CHECK_MS`
- `CRON_NOTIFICATIONS_MS`

## 6) Minimal command set

- `/start` -> greeting + usage hints.
- `/login` -> show auth options.
- `/login?type=github|yandex|code`
- `/logout` or `/logout all=true`
- `/help`
- `/profile` -> request to Main module (example)

## 7) Error handling and retries

- Retry Telegram send errors (2-3 attempts with backoff).
- If Auth/Main is down: return graceful message + retry later.
- For 401 from Main: refresh once, then fail if still 401.

## 8) Testing strategy

### Unit tests
- Command parsing
- Redis state transitions
- Auth/Main client error mapping

### Integration tests
- Mock Auth/Main/Redis for happy path.
- Verify `/login` -> Auth init -> state stored.
- Verify `/logout` clears Redis.

### Manual checks (local)
- Run Bot Logic and Telegram Client separately.
- Send `/login?type=code` and ensure code is returned.
- Simulate Auth approval in mock and observe Authorized state.

## 9) Implementation steps

1. Create `src` layout:
   - `client/` (telegram polling + sender)
   - `bot/` (http server + handlers)
   - `integrations/` (auth/main/redis)
   - `domain/` (state + parsing)
2. Add config loader and logger.
3. Implement Redis state storage.
4. Implement Auth and Main API clients.
5. Implement command router and handlers.
6. Implement scheduled tasks.
7. Add tests and example `.env.local`.

## 10) Deliverables inside `telegram/telegram-client`

- `PLAN.md` (this file)
- `README.md` (quick start)
- `src/` (implementation)
- `tests/` (unit + integration)
