# План тестирования модуля авторизации

## 📋 Содержание
1. [Подготовка окружения](#1-подготовка-окружения)
2. [Настройка переменных окружения](#2-настройка-переменных-окружения)
3. [Запуск зависимостей](#3-запуск-зависимостей)
4. [Запуск сервиса](#4-запуск-сервиса)
5. [Базовые проверки](#5-базовые-проверки)
6. [Тестирование OAuth авторизации](#6-тестирование-oauth-авторизации)
7. [Тестирование Code авторизации](#7-тестирование-code-авторизации)
8. [Тестирование токенов](#8-тестирование-токенов)
9. [Проверка соответствия ТЗ](#9-проверка-соответствия-тз)

---

## 1. Подготовка окружения

### 1.1 Установка зависимостей

```bash
cd auth
go mod download
go mod verify
```

### 1.2 Проверка Go версии

```bash
go version
# Должна быть Go 1.25.2 или выше
```

---

## 2. Настройка переменных окружения

Создайте файл `.env` в папке `auth/`:

```bash
# .env файл для тестирования
PORT=3001
HOST=0.0.0.0

# MongoDB
MONGODB_URI=mongodb://localhost:27017/auth_db
MONGODB_NAME=auth
MONGODB_TIMEOUT=10s

# Redis (опционально, если используется)
REDIS_URL=redis://localhost:6379/0
REDIS_PASSWORD=
REDIS_DB=0

# JWT секреты (ВАЖНО: в продакшене используйте сильные секреты!)
JWT_ACCESS_SECRET=test-access-secret-key-change-in-production
JWT_REFRESH_SECRET=test-refresh-secret-key-change-in-production
JWT_ACCESS_EXPIRY=1m
JWT_REFRESH_EXPIRY=168h

# GitHub OAuth (получите на https://github.com/settings/applications/new)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_REDIRECT_URL=http://localhost:3001/api/auth/github/callback

# Yandex OAuth (получите на https://oauth.yandex.ru/client/new)
YANDEX_CLIENT_ID=your_yandex_client_id
YANDEX_CLIENT_SECRET=your_yandex_client_secret
YANDEX_REDIRECT_URL=http://localhost:3001/api/auth/yandex/callback
```

---

## 3. Запуск зависимостей

### 3.1 MongoDB

**Вариант A: Docker**
```bash
docker run -d \
  --name mongodb-auth \
  -p 27017:27017 \
  -e MONGO_INITDB_DATABASE=auth \
  mongo:latest
```

**Вариант B: Локальная установка**
```bash
# Убедитесь что MongoDB запущен
mongod --version
```

**Проверка подключения:**
```bash
mongosh mongodb://localhost:27017/auth_db
# В MongoDB shell:
# use auth_db
# db.users.count()
```

### 3.2 Redis (опционально)

```bash
docker run -d \
  --name redis-auth \
  -p 6379:6379 \
  redis:latest
```

---

## 4. Запуск сервиса

### 4.1 Локальный запуск

```bash
cd auth
go run main.go
```

**Ожидаемый вывод:**
```
✅ Connected to MongoDB
🚀 Auth module started on http://0.0.0.0:3001
📚 API Documentation:
  POST /api/auth/init      - Инициализация авторизации
  GET  /api/auth/verify/:token - Проверка статуса
  POST /api/auth/refresh   - Обновление токенов
  POST /api/auth/logout    - Выход из системы
```

### 4.2 Проверка здоровья сервиса

```bash
curl http://localhost:3001/health
```

**Ожидаемый ответ:**
```json
{
  "status": "ok",
  "service": "auth-module"
}
```

---

## 5. Базовые проверки

### 5.1 Проверка главной страницы

```bash
curl http://localhost:3001/
```

**Ожидаемый ответ:** JSON с информацией о сервисе и эндпоинтах

### 5.2 Проверка структуры БД

Подключитесь к MongoDB и проверьте коллекции:

```bash
mongosh mongodb://localhost:27017/auth_db
```

```javascript
// Проверка коллекций
show collections
// Должны быть: users, login_sessions

// Проверка индексов
db.users.getIndexes()
db.login_sessions.getIndexes()
```

---

## 6. Тестирование OAuth авторизации

### 6.1 Инициализация GitHub авторизации

**Шаг 1: Генерация login_token (симулируем)**

```bash
# Генерируем случайный login_token
LOGIN_TOKEN=$(openssl rand -hex 16)
echo "Login Token: $LOGIN_TOKEN"
```

**Шаг 2: Инициализация авторизации**

```bash
curl -X POST http://localhost:3001/api/auth/init \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"github\",
    \"login_token\": \"$LOGIN_TOKEN\"
  }"
```

**Ожидаемый ответ:**
```json
{
  "auth_url": "https://github.com/login/oauth/authorize?client_id=...&state=..."
}
```

**Шаг 3: Проверка статуса сессии**

```bash
curl http://localhost:3001/api/auth/verify/$LOGIN_TOKEN
```

**Ожидаемый ответ (до авторизации):**
```json
{
  "status": "pending"
}
```

**Шаг 4: Переход по auth_url**

1. Скопируйте `auth_url` из ответа
2. Откройте в браузере
3. Авторизуйтесь через GitHub
4. Вы будете перенаправлены на callback URL

**Шаг 5: Проверка статуса после авторизации**

```bash
curl http://localhost:3001/api/auth/verify/$LOGIN_TOKEN
```

**Ожидаемый ответ:**
```json
{
  "status": "granted",
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "user_data": {
    "id": "...",
    "email": "user@example.com",
    "name": "Аноним123456",
    "roles": ["Студент"],
    "avatar_url": "..."
  }
}
```

### 6.2 Тестирование Yandex авторизации

Аналогично GitHub, но используйте `"type": "yandex"`:

```bash
LOGIN_TOKEN=$(openssl rand -hex 16)
curl -X POST http://localhost:3001/api/auth/init \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"yandex\",
    \"login_token\": \"$LOGIN_TOKEN\"
  }"
```

---

## 7. Тестирование Code авторизации

### 7.1 Генерация кода авторизации

**Шаг 1: Инициализация Code авторизации**

```bash
LOGIN_TOKEN=$(openssl rand -hex 16)

curl -X POST http://localhost:3001/api/auth/init \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"code\",
    \"login_token\": \"$LOGIN_TOKEN\"
  }"
```

**Шаг 2: Генерация кода**

```bash
curl -X POST http://localhost:3001/api/auth/code/generate \
  -H "Content-Type: application/json" \
  -d "{
    \"login_token\": \"$LOGIN_TOKEN\",
    \"email\": \"test@example.com\"
  }"
```

**Ожидаемый ответ:**
```json
{
  "code": "123456"
}
```

**Шаг 3: Получение refresh токена (симуляция)**

Для тестирования нужно получить refresh токен от авторизованного пользователя или создать временный:

```bash
# Используем refresh токен от предыдущей OAuth авторизации
REFRESH_TOKEN="your_refresh_token_here"

curl -X POST http://localhost:3001/api/auth/code/verify \
  -H "Content-Type: application/json" \
  -d "{
    \"login_token\": \"$LOGIN_TOKEN\",
    \"code\": \"123456\",
    \"refresh_token\": \"$REFRESH_TOKEN\"
  }"
```

**Ожидаемый ответ:**
```json
{
  "status": "success",
  "message": "Code verified successfully"
}
```

---

## 8. Тестирование токенов

### 8.1 Обновление токенов (Refresh)

```bash
# Используйте refresh_token из предыдущей авторизации
REFRESH_TOKEN="your_refresh_token_here"

curl -X POST http://localhost:3001/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{
    \"refresh_token\": \"$REFRESH_TOKEN\"
  }"
```

**Ожидаемый ответ:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 60
}
```

**Проверка времени жизни Access Token:**
- Должно быть `expires_in: 60` (1 минута по ТЗ)

### 8.2 Валидация Access Token

Создайте тестовый скрипт для проверки JWT токена:

```bash
# Сохраните токен
ACCESS_TOKEN="your_access_token_here"

# Проверьте содержимое токена (без валидации подписи)
echo $ACCESS_TOKEN | cut -d. -f2 | base64 -d | jq .
```

**Проверьте:**
- `exp` (expiration) - должно быть через 1 минуту от текущего времени
- `user_id` - ID пользователя
- `email` - email пользователя
- `roles` - массив ролей

### 8.3 Выход из системы (Logout)

```bash
REFRESH_TOKEN="your_refresh_token_here"

curl -X POST http://localhost:3001/api/auth/logout \
  -H "Content-Type: application/json" \
  -d "{
    \"refresh_token\": \"$REFRESH_TOKEN\"
  }"
```

**Ожидаемый ответ:** HTTP 200 OK

---

## 9. Проверка соответствия ТЗ

### 9.1 Проверка времени жизни токенов

```bash
# Получите access_token
ACCESS_TOKEN="your_access_token"

# Декодируйте и проверьте exp
echo $ACCESS_TOKEN | cut -d. -f2 | base64 -d | jq .exp

# Вычислите разницу с текущим временем
# Должно быть примерно 60 секунд (1 минута)
```

### 9.2 Проверка создания пользователя

```bash
mongosh mongodb://localhost:27017/auth_db
```

```javascript
// Проверьте созданного пользователя
db.users.findOne({ email: "test@example.com" })

// Проверьте:
// - name: должно начинаться с "Аноним"
// - roles: должно быть ["Студент"]
// - refresh_tokens: должен быть массив с токенами
```

### 9.3 Проверка времени жизни сессии

```bash
mongosh mongodb://localhost:27017/auth_db
```

```javascript
// Проверьте сессию
db.login_sessions.findOne({ login_token: "your_login_token" })

// Проверьте expires_at
// Должно быть через 5 минут от created_at
```

### 9.4 Проверка сохранения refresh токенов

```javascript
// В MongoDB
db.users.findOne({ email: "test@example.com" }, { refresh_tokens: 1 })

// Должен быть массив refresh_tokens с объектами:
// {
//   token: "...",
//   created_at: ISODate(...),
//   expires_at: ISODate(...) // через 7 дней
// }
```

---

## 10. Автоматизированное тестирование

### 10.1 Создайте тестовый скрипт

Создайте файл `test_auth.sh`:

```bash
#!/bin/bash

BASE_URL="http://localhost:3001"
LOGIN_TOKEN=$(openssl rand -hex 16)

echo "🧪 Тестирование модуля авторизации"
echo "=================================="

# 1. Health check
echo -e "\n1. Health check:"
curl -s $BASE_URL/health | jq .

# 2. Инициализация GitHub авторизации
echo -e "\n2. Инициализация GitHub авторизации:"
RESPONSE=$(curl -s -X POST $BASE_URL/api/auth/init \
  -H "Content-Type: application/json" \
  -d "{\"type\": \"github\", \"login_token\": \"$LOGIN_TOKEN\"}")
echo $RESPONSE | jq .

AUTH_URL=$(echo $RESPONSE | jq -r .auth_url)
echo "Auth URL: $AUTH_URL"

# 3. Проверка статуса
echo -e "\n3. Проверка статуса (должно быть pending):"
curl -s $BASE_URL/api/auth/verify/$LOGIN_TOKEN | jq .

# 4. Инициализация Code авторизации
echo -e "\n4. Инициализация Code авторизации:"
CODE_LOGIN_TOKEN=$(openssl rand -hex 16)
curl -s -X POST $BASE_URL/api/auth/init \
  -H "Content-Type: application/json" \
  -d "{\"type\": \"code\", \"login_token\": \"$CODE_LOGIN_TOKEN\"}" | jq .

# 5. Генерация кода
echo -e "\n5. Генерация кода:"
CODE_RESPONSE=$(curl -s -X POST $BASE_URL/api/auth/code/generate \
  -H "Content-Type: application/json" \
  -d "{\"login_token\": \"$CODE_LOGIN_TOKEN\", \"email\": \"test@example.com\"}")
echo $CODE_RESPONSE | jq .

echo -e "\n✅ Базовые тесты завершены"
echo "Для полного тестирования OAuth:"
echo "1. Откройте Auth URL в браузере"
echo "2. Авторизуйтесь"
echo "3. Проверьте статус: curl $BASE_URL/api/auth/verify/$LOGIN_TOKEN"
```

Сделайте скрипт исполняемым:
```bash
chmod +x test_auth.sh
./test_auth.sh
```

---

## 11. Проверка ошибок

### 11.1 Тестирование невалидных запросов

```bash
# Невалидный тип авторизации
curl -X POST http://localhost:3001/api/auth/init \
  -H "Content-Type: application/json" \
  -d '{"type": "invalid", "login_token": "test"}'

# Отсутствующий login_token
curl -X POST http://localhost:3001/api/auth/init \
  -H "Content-Type: application/json" \
  -d '{"type": "github"}'

# Невалидный refresh токен
curl -X POST http://localhost:3001/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "invalid_token"}'
```

### 11.2 Проверка истечения токенов

```bash
# Подождите 1 минуту после получения access_token
# Затем попробуйте использовать его - должен вернуть 401

# Подождите 7 дней после получения refresh_token
# Затем попробуйте обновить токены - должен вернуть ошибку
```

---

## 12. Проверка логов

### 12.1 Мониторинг логов сервиса

```bash
# Если запускаете через go run
# Логи будут в консоли

# Проверьте MongoDB логи
docker logs mongodb-auth

# Проверьте ошибки подключения
# Должны быть сообщения о подключении к MongoDB
```

---

## 13. Чек-лист проверки ТЗ

- [ ] Access Token живет 1 минуту
- [ ] Refresh Token живет 7 дней
- [ ] Сессия ожидания авторизации живет 5 минут
- [ ] Код авторизации живет 1 минуту
- [ ] Новые пользователи создаются с именем "Аноним+номер"
- [ ] Новые пользователи получают роль "Студент"
- [ ] Refresh токены сохраняются в БД пользователя
- [ ] Email извлекается из refresh токена при Code авторизации
- [ ] OAuth провайдеры (GitHub, Yandex) работают
- [ ] Callback обрабатывается корректно
- [ ] Статусы сессий обновляются правильно (pending → granted/denied)

---

## 14. Полезные команды для отладки

### 14.1 Очистка БД для повторного тестирования

```bash
mongosh mongodb://localhost:27017/auth_db
```

```javascript
// Очистить все данные
db.users.deleteMany({})
db.login_sessions.deleteMany({})

// Или удалить конкретного пользователя
db.users.deleteOne({ email: "test@example.com" })
```

### 14.2 Проверка структуры данных

```javascript
// Пользователь
db.users.findOne()

// Сессия
db.login_sessions.findOne()

// Проверка индексов
db.users.getIndexes()
db.login_sessions.getIndexes()
```

### 14.3 Мониторинг в реальном времени

```bash
# Следить за логами MongoDB
docker logs -f mongodb-auth

# Следить за изменениями в коллекциях
mongosh mongodb://localhost:27017/auth_db --eval "
  db.login_sessions.watch().forEach(change => printjson(change))
"
```

---

## 15. Решение проблем

### Проблема: Сервис не запускается

**Решение:**
1. Проверьте MongoDB: `mongosh mongodb://localhost:27017`
2. Проверьте переменные окружения: `cat .env`
3. Проверьте порт: `lsof -i :3001` или `netstat -an | grep 3001`

### Проблема: OAuth callback не работает

**Решение:**
1. Проверьте redirect URL в настройках OAuth приложения
2. Проверьте что callback URL совпадает с настройками
3. Проверьте логи сервиса на ошибки

### Проблема: Токены не валидируются

**Решение:**
1. Проверьте JWT секреты в `.env`
2. Убедитесь что токены не истекли
3. Проверьте формат токена (должен быть 3 части через точку)

---

## Готово! 🎉

После выполнения всех проверок модуль авторизации должен полностью соответствовать ТЗ.
