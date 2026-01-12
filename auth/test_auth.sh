#!/bin/bash

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="${AUTH_URL:-http://localhost:3001}"
LOGIN_TOKEN=$(openssl rand -hex 16)

echo -e "${GREEN}🧪 Тестирование модуля авторизации${NC}"
echo "=================================="
echo "Base URL: $BASE_URL"
echo ""

# Функция для проверки ответа
check_response() {
    local response=$1
    local expected_status=$2
    
    if echo "$response" | grep -q "$expected_status"; then
        echo -e "${GREEN}✅ OK${NC}"
        return 0
    else
        echo -e "${RED}❌ FAILED${NC}"
        echo "Response: $response"
        return 1
    fi
}

# 1. Health check
echo -e "\n${YELLOW}1. Health check:${NC}"
HEALTH=$(curl -s $BASE_URL/health)
echo "$HEALTH" | jq . 2>/dev/null || echo "$HEALTH"
check_response "$HEALTH" "ok"

# 2. Главная страница
echo -e "\n${YELLOW}2. Главная страница:${NC}"
ROOT=$(curl -s $BASE_URL/)
echo "$ROOT" | jq . 2>/dev/null || echo "$ROOT"
check_response "$ROOT" "service"

# 3. Инициализация GitHub авторизации
echo -e "\n${YELLOW}3. Инициализация GitHub авторизации:${NC}"
GITHUB_RESPONSE=$(curl -s -X POST $BASE_URL/api/auth/init \
  -H "Content-Type: application/json" \
  -d "{\"type\": \"github\", \"login_token\": \"$LOGIN_TOKEN\"}")
echo "$GITHUB_RESPONSE" | jq . 2>/dev/null || echo "$GITHUB_RESPONSE"

if echo "$GITHUB_RESPONSE" | grep -q "auth_url"; then
    echo -e "${GREEN}✅ OK${NC}"
    AUTH_URL=$(echo $GITHUB_RESPONSE | jq -r .auth_url 2>/dev/null)
    echo "Auth URL: $AUTH_URL"
else
    echo -e "${RED}❌ FAILED${NC}"
fi

# 4. Проверка статуса (должно быть pending)
echo -e "\n${YELLOW}4. Проверка статуса сессии:${NC}"
STATUS_RESPONSE=$(curl -s $BASE_URL/api/auth/verify/$LOGIN_TOKEN)
echo "$STATUS_RESPONSE" | jq . 2>/dev/null || echo "$STATUS_RESPONSE"
check_response "$STATUS_RESPONSE" "pending"

# 5. Инициализация Code авторизации
echo -e "\n${YELLOW}5. Инициализация Code авторизации:${NC}"
CODE_LOGIN_TOKEN=$(openssl rand -hex 16)
CODE_INIT_RESPONSE=$(curl -s -X POST $BASE_URL/api/auth/init \
  -H "Content-Type: application/json" \
  -d "{\"type\": \"code\", \"login_token\": \"$CODE_LOGIN_TOKEN\"}")
echo "$CODE_INIT_RESPONSE" | jq . 2>/dev/null || echo "$CODE_INIT_RESPONSE"
check_response "$CODE_INIT_RESPONSE" "code_auth_initialized"

# 6. Генерация кода
echo -e "\n${YELLOW}6. Генерация кода авторизации:${NC}"
CODE_RESPONSE=$(curl -s -X POST $BASE_URL/api/auth/code/generate \
  -H "Content-Type: application/json" \
  -d "{\"login_token\": \"$CODE_LOGIN_TOKEN\", \"email\": \"test@example.com\"}")
echo "$CODE_RESPONSE" | jq . 2>/dev/null || echo "$CODE_RESPONSE"

if echo "$CODE_RESPONSE" | grep -q "code"; then
    echo -e "${GREEN}✅ OK${NC}"
    CODE=$(echo $CODE_RESPONSE | jq -r .code 2>/dev/null)
    echo "Сгенерированный код: $CODE"
else
    echo -e "${RED}❌ FAILED${NC}"
fi

# 7. Проверка невалидного запроса
echo -e "\n${YELLOW}7. Проверка обработки ошибок (невалидный тип):${NC}"
ERROR_RESPONSE=$(curl -s -X POST $BASE_URL/api/auth/init \
  -H "Content-Type: application/json" \
  -d "{\"type\": \"invalid\", \"login_token\": \"test\"}")
echo "$ERROR_RESPONSE" | jq . 2>/dev/null || echo "$ERROR_RESPONSE"
check_response "$ERROR_RESPONSE" "error\|unsupported"

echo -e "\n${GREEN}=================================="
echo "✅ Базовые тесты завершены"
echo "==================================${NC}"

echo -e "\n${YELLOW}📝 Следующие шаги для полного тестирования:${NC}"
echo "1. Для тестирования OAuth:"
echo "   - Откройте Auth URL в браузере: $AUTH_URL"
echo "   - Авторизуйтесь через GitHub/Yandex"
echo "   - Проверьте статус: curl $BASE_URL/api/auth/verify/$LOGIN_TOKEN"
echo ""
echo "2. Для тестирования Code авторизации:"
echo "   - Используйте сгенерированный код: $CODE"
echo "   - Нужен refresh токен от авторизованного пользователя"
echo ""
echo "3. Проверьте MongoDB:"
echo "   mongosh mongodb://localhost:27017/auth_db"
echo "   db.users.find()"
echo "   db.login_sessions.find()"
