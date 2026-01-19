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

## Telegram commands

- `/help` — базовые команды.
- `/actions` — полный список действий через Main.
- `/permissions` — список действий и разрешений из task_flow.

## Main actions

Use `/actions` in chat to see the current list. The bot understands:

- Users: `/users`, `/user name <user_id>`, `/user set-name <user_id> <full_name>`,
  `/user courses <user_id>`, `/user grades <user_id>`, `/user tests <user_id>`,
  `/user roles <user_id>`, `/user set-roles <user_id> <json_roles>`,
  `/user block <user_id>`, `/user set-block <user_id> <true|false>`,
  `/user add <json_body>`.
- Courses: `/courses`, `/course <course_id>`, `/course create <json_body>`,
  `/course update <course_id> <json_body>`, `/course delete <course_id>`,
  `/course students <course_id>`, `/course tests <course_id>`,
  `/course enroll <course_id> [user_id]`, `/course unenroll <course_id> <user_id>`.
- Tests: `/tests`, `/test <test_id>`, `/test create <json_body>`,
  `/test activate <test_id> <true|false>`, `/test add-question <test_id> <question_id>`,
  `/test remove-question <test_id> <question_id>`, `/attempt create <json_body>`,
  `/attempt <attempt_id>`, `/attempt finish <attempt_id>`,
  `/attempt answer <attempt_id> <answer_id> <option_id>`.
- Questions: `/questions`, `/question <question_id>`,
  `/question create <json_body>`, `/question update <question_id> <json_body>`,
  `/question delete <question_id>`.
- Notifications: `/notifications`, `/notifications clear`.

### JSON examples

```
{"name":"Math","description":"Algebra","teacher_id":"..."}
{"text":"2+2?","type":"single_choice","points":1,"options":[{"text":"4","is_correct":true},{"text":"5"}]}
{"test_id":"...","user_id":"...","answers":[{"question_id":"...","option_id":"..."}]}
```
