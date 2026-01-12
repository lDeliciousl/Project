#!/bin/bash

echo "🧪 Тестирование API Главного модуля"
echo "======================================"

BASE_URL="http://localhost:3002"
TIMEOUT=5

# Функция проверки
check_endpoint() {
    endpoint=$1
    method=${2:-GET}
    data=${3:-}
    
    echo -n "🔍 $method $endpoint ... "
    
    if [ "$method" = "POST" ]; then
        curl_output=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
            -H "Content-Type: application/json" \
            -d "$data" \
            --max-time $TIMEOUT \
            "$BASE_URL$endpoint" 2>/dev/null || echo "000")
    else
        curl_output=$(curl -s -o /dev/null -w "%{http_code}" \
            --max-time $TIMEOUT \
            "$BASE_URL$endpoint" 2>/dev/null || echo "000")
    fi
    
    if [[ "$curl_output" =~ ^2[0-9][0-9]$ ]]; then
        echo "✅ OK ($curl_output)"
        return 0
    elif [[ "$curl_output" =~ ^[0-9][0-9][0-9]$ ]]; then
        echo "⚠️  Код: $curl_output"
        return 1
    else
        echo "❌ Ошибка подключения"
        return 2
    fi
}

# Проверяем endpoints
echo ""
echo "1. Базовые проверки:"
check_endpoint "/"
check_endpoint "/health"

echo ""
echo "2. API endpoints:"
check_endpoint "/api/users"
check_endpoint "/api/courses"
check_endpoint "/api/auth/verify" "POST" '{"token": "test"}'
check_endpoint "/api/echo" "POST" '{"message": "test"}'

echo ""
echo "3. Проверка содержимого:"
echo "   📊 Количество пользователей:"
curl -s "$BASE_URL/api/users" | grep -o '"count"' | head -1 && echo "   ✅ Поле count найдено" || echo "   ❌ Поле count не найдено"

echo ""
echo "======================================"
echo "🎯 Тестирование завершено"
echo ""
echo "📝 Рекомендации:"
echo "   • Сервер доступен на $BASE_URL"
echo "   • Используйте /health для мониторинга"
echo "   • Все endpoints возвращают JSON"
echo "   • Данные из заглушки (PostgreSQL не подключен)"
