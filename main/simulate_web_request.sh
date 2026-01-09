#!/bin/bash

echo "🌐 Имитация работы веб-модуля:"
echo "================================"

# 1. Получаем список курсов (как это сделал бы веб-модуль)
echo "1. 📚 Запрос списка курсов:"
curl -s -X GET \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fake.jwt.token.for.test" \
  http://localhost:3002/api/courses | \
  python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(f'   ✅ Получено курсов: {data.get(\"count\", 0)}')
    for i, course in enumerate(data.get('courses', [])):
        print(f'   {i+1}. {course.get(\"name\")} ({course.get(\"id\")[:8]}...)')
except:
    print('   ❌ Ошибка парсинга ответа')
"

# 2. Проверка JWT токена
echo ""
echo "2. 🔐 Проверка JWT токена:"
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJyb2xlcyI6WyJzdHVkZW50Il0sInBlcm1pc3Npb25zIjpbInVzZXI6ZGF0YTpyZWFkIl19.test"}' \
  http://localhost:3002/api/auth/verify | \
  python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    if data.get('valid'):
        print(f'   ✅ Токен валиден')
        print(f'   👤 User ID: {data.get(\"user_id\")}')
        print(f'   🎭 Роли: {data.get(\"roles\")}')
    else:
        print(f'   ❌ Токен невалиден: {data.get(\"error\", \"unknown\")}')
except:
    print('   ❌ Ошибка проверки токена')
"

# 3. Health check (для мониторинга)
echo ""
echo "3. 🩺 Health check:"
curl -s http://localhost:3002/health | \
python3 -c "
import json, sys, time
try:
    data = json.load(sys.stdin)
    status = data.get('status', 'unknown')
    timestamp = data.get('timestamp', 0)
    current_time = int(time.time())
    age = current_time - timestamp if timestamp > 0 else 'N/A'
    print(f'   ✅ Status: {status}')
    print(f'   ⏰ Ответ получен {age} секунд назад')
    print(f'   🎯 Режим: {data.get(\"mode\", \"unknown\")}')
except:
    print('   ❌ Ошибка health check')
"
