# check-fixed.ps1 - Исправленная проверка
Write-Host "=== ПРОВЕРКА AUTH MODULE (ИСПРАВЛЕННАЯ) ===" -ForegroundColor Cyan
Write-Host "-" * 50

# 1. Контейнеры
Write-Host "`n1. СТАТУС КОНТЕЙНЕРОВ:" -ForegroundColor Yellow
docker-compose ps

# 2. API
Write-Host "`n2. ПРОВЕРКА API:" -ForegroundColor Yellow

Write-Host "   GET http://localhost:8001/ ..." -NoNewline
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8001/" -TimeoutSec 5
    Write-Host " ✅ ($($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host " ❌" -ForegroundColor Red
}

Write-Host "   GET http://localhost:8001/health ..." -NoNewline
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8001/health" -TimeoutSec 5
    Write-Host " ✅ ($($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host " ❌" -ForegroundColor Red
}

# 3. Базы данных (исправленная проверка)
Write-Host "`n3. ПРОВЕРКА БАЗ ДАННЫХ:" -ForegroundColor Yellow

# MongoDB - альтернативные способы проверки
Write-Host "   MongoDB (способ 1 - telnet) ..." -NoNewline
docker-compose exec mongo timeout 2 bash -c "echo > /dev/tcp/localhost/27017" 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host " ✅ (порт открыт)" -ForegroundColor Green
} else {
    Write-Host " ❌" -ForegroundColor Red
}

Write-Host "   MongoDB (способ 2 - mongosh) ..." -NoNewline
$mongoResult = docker-compose exec mongo mongosh --eval "db.adminCommand({ping:1})" --quiet 2>$null
if ($mongoResult -match '"ok"\s*:\s*1') {
    Write-Host " ✅" -ForegroundColor Green
} else {
    Write-Host " ❌" -ForegroundColor Red
    Write-Host "     Вывод: $mongoResult" -ForegroundColor Gray
}

# Redis
Write-Host "   Redis ..." -NoNewline
$redisResult = docker-compose exec redis redis-cli ping 2>$null
if ($redisResult -eq "PONG") {
    Write-Host " ✅" -ForegroundColor Green
} else {
    Write-Host " ❌" -ForegroundColor Red
    Write-Host "     Вывод: $redisResult" -ForegroundColor Gray
}

# 4. Проверка сети между контейнерами
Write-Host "`n4. ПРОВЕРКА СЕТИ МЕЖДУ КОНТЕЙНЕРАМИ:" -ForegroundColor Yellow

Write-Host "   auth-module -> mongo:27017 ..." -NoNewline
docker-compose exec auth-module timeout 2 nc -zv mongo 27017 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host " ✅" -ForegroundColor Green
} else {
    Write-Host " ❌" -ForegroundColor Red
}

Write-Host "   auth-module -> redis:6379 ..." -NoNewline  
docker-compose exec auth-module timeout 2 nc -zv redis 6379 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host " ✅" -ForegroundColor Green
} else {
    Write-Host " ❌" -ForegroundColor Red
}

# Итог
Write-Host "`n" + ("-" * 50)
Write-Host "📊 ИТОГ ПРОВЕРКИ:" -ForegroundColor Cyan

# Проверяем что auth-module подключался к MongoDB (по логам)
$logs = docker-compose logs --tail=5 auth-module 2>$null
if ($logs -match "Connected to MongoDB") {
    Write-Host "✅ Auth Module УСПЕШНО подключился к MongoDB" -ForegroundColor Green
} elseif ($logs -match "Failed to connect to MongoDB") {
    Write-Host "❌ Auth Module НЕ СМОГ подключиться к MongoDB" -ForegroundColor Red
} else {
    Write-Host "⚠️  Не удалось проверить подключение по логам" -ForegroundColor Yellow
}

Write-Host "`n📍 Auth Module доступен по: http://localhost:8001" -ForegroundColor Gray