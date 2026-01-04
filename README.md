🎓 Testing System - Система тестирования
Полная система тестирования с авторизацией через GitHub, Yandex ID или код.
Каждый модуль полностью изолирован с собственными Redis и Nginx.

📋 ОГЛАВЛЕНИЕ
🚀 Быстрый старт

👥 Распределение задач

🏗️ Архитектура

📡 API документация

🐳 Docker команды

🔧 Разработка

📞 Полезное

🚀 БЫСТРЫЙ СТАРТ
Шаг 1: Клонирование и настройка
bash
# 1. Клонируем репозиторий
git clone https://github.com/ваш-логин/testing-system.git
cd testing-system

# 2. Копируем настройки окружения
cp .env.example .env

# 3. Редактируем .env файл (ОБЯЗАТЕЛЬНО!)
# Откройте .env в редакторе и заполните ВСЕ значения
# Особенно TELEGRAM_BOT_TOKEN, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
Шаг 2: Запуск всех сервисов
bash
# Запускаем все контейнеры
docker-compose up -d

# Проверяем, что всё запустилось
docker-compose ps

# Смотрим логи (если нужно)
docker-compose logs -f
Шаг 3: Проверка работоспособности
bash
# Проверяем доступность сервисов
curl http://localhost:8080/health
curl http://localhost:8081/health
curl http://localhost:3001/health
curl http://localhost:3002/health

# Если всё отвечает 200 OK - система готова!
🎯 Доступ к сервисам:
Сервис	URL	Порт	Назначение
🌐 Web Client	http://localhost:8080	8080	Веб-интерфейс
🤖 Telegram Bot	http://localhost:8081	8081	API для бота
🔐 Auth Module	http://localhost:3001	3001	Авторизация
🏢 Main Module	http://localhost:3002	3002	Бизнес-логика
👥 РАСПРЕДЕЛЕНИЕ ЗАДАЧ
📝 ЧЕК-ЛИСТ РАЗРАБОТЧИКОВ
👤 РАЗРАБОТЧИК 1: Веб-клиент (web/)
📁 Рабочая папка: testing-system/web/

🎯 Задачи первого этапа:
1. Настроить Nginx конфигурацию

Создать web/nginx/nginx.conf

Настроить прокси на backend (порт 3000)

Добавить обработку статических файлов

2. Настроить Dockerfile для backend

Выбрать базовый образ (Node.js/Python/Go)

Установить зависимости

Настроить точку входа

3. Реализовать базовые эндпоинты:

GET / - главная страница

GET /login - страница авторизации

GET /logout - выход из системы

GET /health - проверка здоровья

4. Подключить Redis

Установить Redis клиент

Реализовать работу с сессиями

Создать утилиты для работы с Redis

5. Интеграция с Auth Module

Реализовать перенаправление на /auth/login

Обработка callback от авторизации

Сохранение JWT токенов

🛠️ Первые команды для выполнения:
bash
cd testing-system/web/backend

# Инициализация проекта (если Node.js)
npm init -y
npm install express redis cookie-parser axios dotenv

# Создаём базовую структуру
mkdir -p src/{controllers,middleware,routes,utils}
touch src/server.js src/routes/web.js
📁 Что должно быть в папке:
text
web/
├── nginx/                    # Конфигурация Nginx
│   ├── nginx.conf          ← ВАША ЗАДАЧА
│   └── Dockerfile
├── backend/                 # Логика веб-клиента
│   ├── src/
│   │   ├── controllers/    ← Обработчики запросов
│   │   ├── middleware/     ← Проверка сессий, куки
│   │   ├── routes/         ← Роуты /login, /logout, /
│   │   └── utils/          ← Redis клиент, хелперы
│   ├── package.json        ← Зависимости
│   ├── Dockerfile          ← Конфигурация Docker
│   └── .env.example        ← Переменные окружения
└── redis/                  # Redis для веб-сессий
    ├── redis.conf         ← Конфигурация Redis
    └── Dockerfile
👤 РАЗРАБОТЧИК 2: Telegram бот (telegram/)
📁 Рабочая папка: testing-system/telegram/

🎯 Задачи первого этапа:
1. Получить токен бота

Написать @BotFather в Telegram

Создать нового бота командой /newbot

Сохранить токен в .env файл

2. Настроить Nginx для webhook

Конфигурация для приёма запросов от Telegram

Настроить SSL (если нужно)

Прокси на backend бота

3. Реализовать базовые команды:

/start - приветственное сообщение

/login - начало авторизации

/logout - выход из системы

/help - список команд

4. Настроить Redis для хранения состояния

Ключ по chat_id

Хранение статуса пользователя

Хранение временных токенов

5. Интеграция с Auth Module

Запрос на авторизацию

Проверка статуса авторизации

Сохранение JWT токенов

🛠️ Первые команды для выполнения:
bash
cd testing-system/telegram/backend

# Инициализация (Node.js пример)
npm init -y
npm install node-telegram-bot-api redis axios dotenv

# Создаём структуру
mkdir -p src/{commands,handlers,services,utils}
touch src/bot.js src/commands/start.js
📁 Что должно быть в папке:
text
telegram/
├── nginx/                    # Nginx для webhook
│   ├── nginx.conf          ← ВАША ЗАДАЧА
│   └── Dockerfile
├── backend/                 # Логика бота
│   ├── src/
│   │   ├── commands/       ← /start, /login, /logout
│   │   ├── handlers/       ← Обработчики сообщений
│   │   ├── services/       ← Сервисы (Redis, Auth API)
│   │   └── utils/          ← Утилиты
│   ├── package.json        ← Зависимости
│   ├── Dockerfile          ← Docker конфиг
│   └── .env.example        ← Переменные окружения
└── redis/                  # Redis для бота
    ├── redis.conf         ← Конфигурация Redis
    └── Dockerfile
👤 РАЗРАБОТЧИК 3: Авторизация (auth/)
📁 Рабочая папка: testing-system/auth/

🎯 Задачи первого этапа:
1. Зарегистрировать OAuth приложения

GitHub: https://github.com/settings/applications/new

Homepage URL: http://localhost:3001

Callback URL: http://localhost:3001/auth/github/callback

Yandex: https://oauth.yandex.ru/client/new

Callback URL: http://localhost:3001/auth/yandex/callback

Сохранить Client ID и Secret в .env

2. Настроить MongoDB

Создать схему пользователя

Настроить индексы

Создать скрипт инициализации

3. Реализовать OAuth провайдеры:

GitHub OAuth

Yandex OAuth

Аутентификация по коду

4. Реализовать JWT токены:

Генерация Access Token (15 минут)

Генерация Refresh Token (7 дней)

Валидация токенов

5. Создать API эндпоинты:

POST /auth/login/:type - инициировать авторизацию

GET /auth/check/:token - проверить статус

POST /auth/refresh - обновить токены

POST /auth/logout - выход

🛠️ Первые команды для выполнения:
bash
cd testing-system/auth/backend

# Инициализация (Node.js)
npm init -y
npm install express mongoose jsonwebtoken axios dotenv passport passport-github2

# Создаём структуру
mkdir -p src/{oauth,code-auth,jwt,models,routes}
touch src/server.js src/models/User.js
📁 Что должно быть в папке:
text
auth/
├── backend/                 # API авторизации
│   ├── src/
│   │   ├── oauth/          ← GitHub, Yandex OAuth
│   │   ├── code-auth/      ← Аутентификация по коду
│   │   ├── jwt/            ← Генерация/валидация JWT
│   │   ├── models/         ← Модели MongoDB
│   │   └── routes/         ← API роуты
│   ├── package.json        ← Зависимости
│   ├── Dockerfile          ← Docker конфиг
│   └── .env.example        ← Переменные окружения
└── mongodb/                # MongoDB для авторизации
    ├── mongo-init.js      ← Скрипт инициализации
    └── Dockerfile
👤 РАЗРАБОТЧИК 4: Главный модуль (main/)
📁 Рабочая папка: testing-system/main/

🎯 Задачи первого этапа:
1. Проектирование схемы PostgreSQL

Создать init.sql с таблицами

Определить связи между таблицами

Создать индексы для оптимизации

2. Реализовать модели:

Пользователи (users)

Дисциплины (courses)

Тесты (tests)

Вопросы (questions)

Попытки (attempts)

Ответы (answers)

3. Настроить проверку JWT

Middleware для проверки токенов

Извлечение данных пользователя из токена

Проверка прав доступа

4. Реализовать базовые CRUD:

GET /api/courses - список дисциплин

GET /api/courses/:id - информация о дисциплине

POST /api/tests/:id/attempt - начать тест

GET /api/users/:id - информация о пользователе

5. Реализовать систему прав:

Проверка ролей (Студент, Преподаватель, Админ)

Проверка разрешений

Дефолтные права доступа

🛠️ Первые команды для выполнения:
bash
cd testing-system/main/backend

# Инициализация (Node.js)
npm init -y
npm install express pg jsonwebtoken dotenv

# Создаём структуру
mkdir -p src/{models,services,middleware,routes}
touch src/server.js src/models/Course.js
📁 Что должно быть в папке:
text
main/
├── backend/                 # API бизнес-логики
│   ├── src/
│   │   ├── models/         ← Модели PostgreSQL
│   │   ├── services/       ← Бизнес-логика
│   │   ├── middleware/     ← JWT проверка, права
│   │   └── routes/         ← API роуты
│   ├── package.json        ← Зависимости
│   ├── Dockerfile          ← Docker конфиг
│   └── .env.example        ← Переменные окружения
└── postgres/               # PostgreSQL для данных
    ├── init.sql           ← SQL скрипт инициализации
    └── Dockerfile
🏗️ АРХИТЕКТУРА
📊 Схема взаимодействия


















🔐 Структура Redis данных
Web Redis (web/redis/):
javascript
// Ключ: web:session:{session_token}
{
  "status": "anonymous|authorized|unknown",
  "access_token": "jwt_access_token_here",
  "refresh_token": "jwt_refresh_token_here", 
  "login_token": "temp_login_token",
  "user_id": "user_123",
  "created_at": "2024-01-01T12:00:00Z",
  "expires_at": "2024-01-01T13:00:00Z"
}

// Ключ: web:login:{login_token}
{
  "session_token": "session_token_value",
  "expires_at": "2024-01-01T12:05:00Z"
}
Telegram Redis (telegram/redis/):
javascript
// Ключ: tg:chat:{chat_id}
{
  "status": "anonymous|authorized|unknown",
  "access_token": "jwt_access_token_here",
  "refresh_token": "jwt_refresh_token_here",
  "login_token": "temp_login_token",
  "user_id": "user_123",
  "last_active": "2024-01-01T12:00:00Z"
}

// Ключ: tg:temp:{login_token}
{
  "chat_id": "123456789",
  "expires_at": "2024-01-01T12:05:00Z"
}
📡 API ДОКУМЕНТАЦИЯ
🔐 Auth Module API (http://localhost:3001)
1. Инициировать авторизацию
http
POST /auth/login/:type
Content-Type: application/json

{
  "login_token": "generated_login_token"
}
Параметры:

:type - github, yandex, или code

Ответ:

json
{
  "url": "https://github.com/login/oauth/authorize?client_id=...&state=..."
}
2. Проверить статус авторизации
http
GET /auth/check/:login_token
Ответ:

json
{
  "status": "pending|approved|denied",
  "access_token": "jwt_token_if_approved",
  "refresh_token": "jwt_token_if_approved"
}
3. Обновить токены
http
POST /auth/refresh
Content-Type: application/json
Authorization: Bearer {refresh_token}

{
  "refresh_token": "your_refresh_token"
}
4. Выйти из системы
http
POST /auth/logout
Content-Type: application/json
Authorization: Bearer {access_token}

{
  "refresh_token": "your_refresh_token",
  "all_devices": false
}
🏢 Main Module API (http://localhost:3002)
1. Дисциплины
http
GET /api/courses
Authorization: Bearer {access_token}
http
GET /api/courses/:id
Authorization: Bearer {access_token}
2. Тесты
http
GET /api/courses/:course_id/tests
Authorization: Bearer {access_token}
http
POST /api/tests/:test_id/attempt
Authorization: Bearer {access_token}
3. Пользователи
http
GET /api/users/:id
Authorization: Bearer {access_token}
4. Уведомления
http
GET /api/notifications
Authorization: Bearer {access_token}
🌐 Web Client API (http://localhost:8080)
1. Главная страница
http
GET /
Показывает:

Если статус unknown → кнопки авторизации

Если статус anonymous → информацию об ожидании

Если статус authorized → личный кабинет

2. Авторизация
http
GET /login?type=github
Перенаправляет на Auth Module

3. Выход
http
GET /logout
Удаляет сессию и перенаправляет на главную

🤖 Telegram Bot API (http://localhost:8081)
1. Webhook endpoint
http
POST /webhook
Content-Type: application/json

{
  "update_id": 123,
  "message": {
    "message_id": 456,
    "chat": {"id": 789},
    "text": "/start"
  }
}
2. Проверка здоровья
http
GET /health
Используется для мониторинга

🐳 DOCKER КОМАНДЫ
🚀 Основные команды
bash
# Запустить все сервисы
docker-compose up -d

# Остановить все сервисы
docker-compose down

# Перезапустить конкретный сервис
docker-compose restart web-backend

# Просмотр логов
docker-compose logs -f web-backend
docker-compose logs -f telegram-backend
docker-compose logs -f auth-backend
docker-compose logs -f main-backend

# Просмотр всех запущенных контейнеров
docker-compose ps
🔧 Разработка
bash
# Запустить в режиме разработки
docker-compose -f docker-compose.dev.yml up

# Пересобрать и запустить
docker-compose up -d --build

# Очистка всего Docker
docker system prune -a

# Просмотр использования ресурсов
docker stats
🗄️ Работа с базами данных
bash
# Подключиться к Web Redis
docker-compose exec web-redis redis-cli
docker-compose exec web-redis redis-cli keys "*"

# Подключиться к Telegram Redis
docker-compose exec telegram-redis redis-cli
docker-compose exec telegram-redis redis-cli keys "*"

# Подключиться к MongoDB (Auth)
docker-compose exec auth-mongodb mongo -u admin -p password
# В MongoDB:
show dbs
use auth_db
show collections

# Подключиться к PostgreSQL (Main)
docker-compose exec main-postgres psql -U admin -d testing_system
# В PostgreSQL:
\dt -- список таблиц
SELECT * FROM users;
🐞 Отладка
bash
# Запустить контейнер в интерактивном режиме
docker-compose exec web-backend sh

# Копировать файлы в/из контейнера
docker cp testing-system/web/backend/src container_id:/app/src

# Проверить доступность портов
nc -zv localhost 8080
nc -zv localhost 3001

# Сбросить всю систему
docker-compose down -v
docker-compose up -d
🔧 РАЗРАБОТКА
📁 Структура Git веток
text
main          ← Продакшен (только через PR)
├── dev       ← Основная ветка разработки (мержим сюда)
│   ├── feature/web-login        ← Ветка для веб-авторизации
│   ├── feature/telegram-commands ← Ветка для команд бота
│   ├── feature/auth-oauth       ← Ветка OAuth авторизации
│   └── feature/main-courses     ← Ветка курсов в главном модуле
└── hotfix/*  ← Срочные исправления
🚀 Git workflow для команды
bash
# 1. Переключиться на dev и получить последние изменения
git checkout dev
git pull origin dev

# 2. Создать новую ветку для своей задачи
git checkout -b feature/ваша-фича
# Например:
git checkout -b feature/web-login-page
git checkout -b feature/telegram-start-command

# 3. Работать в ветке, делать коммиты
git add .
git commit -m "feat(web): добавить страницу логина"
# Формат коммитов:
# feat:     новая функциональность
# fix:      исправление бага
# docs:     документация
# style:    форматирование кода
# refactor: рефакторинг
# test:     тесты
# chore:    обновление зависимостей

# 4. Отправить ветку на GitHub
git push origin feature/ваша-фича

# 5. Создать Pull Request на GitHub
#    Сравнить: feature/ваша-фича ← dev
#    Добавить описание изменений
#    Назначить ревьюеров (2 других разработчика)

# 6. После получения 2 аппрувов → мержить PR
# 7. Удалить локальную ветку после мержа
git branch -d feature/ваша-фича
🧪 Тестирование
bash
# Запустить тесты в каждом модуле
cd testing-system/web/backend && npm test
cd testing-system/telegram/backend && npm test
cd testing-system/auth/backend && npm test
cd testing-system/main/backend && npm test

# Запустить все тесты
npm run test:all

# Проверить линтером
npm run lint

# Проверить типы TypeScript
npm run type-check
📦 Зависимости
Каждый модуль имеет свои зависимости:

bash
# Установить зависимости в модуле
cd testing-system/web/backend
npm install

# Обновить зависимости
npm update

# Добавить новую зависимость
npm install название-пакета --save
npm install @types/название-пакета --save-dev  # для TypeScript
📞 ПОЛЕЗНОЕ
🔍 Частые проблемы и решения
Проблема: Сервисы не запускаются
bash
# Проверьте, не заняты ли порты
sudo lsof -i :8080
sudo lsof -i :3001

# Если порт занят, освободите его или измените в docker-compose.yml
Проблема: Нет доступа к базе данных
bash
# Проверьте, запущены ли контейнеры с БД
docker-compose ps | grep redis
docker-compose ps | grep mongo
docker-compose ps | grep postgres

# Проверьте логи БД
docker-compose logs -f auth-mongodb
Проблема: Docker ошибка "port already allocated"
bash
# Измените порт в docker-compose.yml
web-nginx:
  ports:
    - "8081:80"  # вместо 8080
Проблема: .env переменные не загружаются
bash
# Убедитесь, что файл .env существует
ls -la .env

# Проверьте синтаксис .env файла
# Каждая переменная должна быть на новой строке:
# TELEGRAM_BOT_TOKEN=ваш_токен
# GITHUB_CLIENT_ID=ваш_id
📊 Мониторинг
bash
# Посмотреть использование ресурсов
docker stats

# Посмотреть логи в реальном времени
docker-compose logs -f --tail=100

# Проверить здоровье сервисов
curl http://localhost:8080/health
curl http://localhost:8081/health
curl http://localhost:3001/health
curl http://localhost:3002/health

# Проверить Redis
docker-compose exec web-redis redis-cli ping  # должно ответить PONG
🔄 Миграции базы данных
bash
# Создать миграцию для PostgreSQL
cd testing-system/main/backend
npm run migrate:create имя-миграции

# Применить миграции
npm run migrate:up

# Откатить миграцию
npm run migrate:down
🎨 Code Style
Отступы: 2 пробела

Именование: camelCase для переменных, PascalCase для классов

Комментарии: на английском, описывают "почему", а не "что"

Импорты: сортировать по алфавиту

Длина строки: макс. 80 символов

📚 Ресурсы для обучения
Для разработчика Web:
Express.js документация

Redis команды

Nginx конфигурация

Для разработчика Telegram:
node-telegram-bot-api

Telegram Bot API

Для разработчика Auth:
Passport.js

JWT.io

Mongoose документация

Для разработчика Main:
PostgreSQL документация

node-postgres

🆘 ЧТО ДЕЛАТЬ, ЕСЛИ ЗАСТРЯЛ
Посмотрите документацию в docs/ папке

Проверьте логи сервиса: docker-compose logs -f имя-сервиса

Запустите тесты для модуля

Спросите в чате команды в Telegram/WhatsApp

Создайте issue на GitHub с описанием проблемы

Проверьте закрытые issues - может проблема уже решена

📞 КОНТАКТЫ И ОТВЕТСТВЕННЫЕ
Модуль	Разработчик	Контакт	Дедлайн этапа
🌐 Web	Имя 1	@telegram	10 января
🤖 Telegram	Имя 2	@telegram	12 января
🔐 Auth	Имя 3	@telegram	15 января
🏢 Main	Имя 4	@telegram	18 января
🎯 ПРОГРЕСС РАЗРАБОТКИ
Неделя 1 (2-8 января)
Настройка окружения у всех разработчиков

Создание базовой структуры каждого модуля

Настройка Docker для каждого модуля

Реализация health-check эндпоинтов

Неделя 2 (9-15 января)
Web: базовые страницы и роутинг

Telegram: команды /start, /help

Auth: регистрация OAuth приложений

Main: проектирование схемы БД

Неделя 3 (16-22 января)
Web: интеграция с Auth

Telegram: интеграция с Auth

Auth: реализация GitHub OAuth

Main: базовые CRUD операции

Важно: Все изменения в main ветку только через Pull Request с 2 аппрувами.
Не коммитьте .env файл с реальными токенами!
Тестируйте свой код перед созданием PR.

Удачи в разработке! 🚀