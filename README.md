# 🎓 Testing System - Система тестирования

Полнофункциональная система тестирования с авторизацией через GitHub, Yandex или код. 
Микросервисная архитектура с Docker контейнеризацией.

## 🚀 Быстрый старт

### 1. Клонирование и настройка
```bash
git clone https://github.com/ваш-логин/Project
cd testing-system
```

### 2. Запуск всех сервисов
```bash
# Запускаем все контейнеры
docker-compose up -d

# Проверяем, что всё запустилось
docker-compose ps
```

### 3. Проверка работоспособности
```bash
# Проверяем доступность сервисов
curl http://localhost:8000/health  # Web
curl http://localhost:8001/health  # Telegram  
curl http://localhost:3001/health  # Auth
curl http://localhost:3002/health  # Main
```

## 🌐 Доступ к сервисам

| Сервис | URL | Порт | Назначение |
|--------|-----|------|------------|
| 🌐 Web Client | http://localhost:8000 | 8000 | Веб-интерфейс |
| 🤖 Telegram Bot | http://localhost:8001 | 8001 | API для бота |
| 🔐 Auth Module | http://localhost:3001 | 3001 | Авторизация |
| 🏢 Main Module | http://localhost:3002 | 3002 | Бизнес-логика |

## 🏗️ Архитектура

Система состоит из 4 независимых микросервисов:

- **Web Module** (Node.js + Express) - Веб-интерфейс с авторизацией
- **Telegram Module** (Node.js) - Telegram бот для доступа к системе  
- **Auth Module** (Go) - Централизованная авторизация через OAuth
- **Main Module** (C++) - Основная бизнес-логика и база данных

Каждый модуль имеет собственную базу данных:
- Web/Telegram: Redis для сессий
- Auth: MongoDB для пользователей  
- Main: PostgreSQL для данных тестирования

## 🐳 Полезные команды

```bash
# Просмотр логов
docker-compose logs -f web-backend

# Перезапуск сервиса
docker-compose restart web-backend

# Подключение к базам данных
docker-compose exec web-redis redis-cli
docker-compose exec main-postgres psql -U main_module -d testing_system

# Очистка и пересборка
docker-compose down -v
docker-compose up -d --build
```
## 📄 Лицензия

ISC License
