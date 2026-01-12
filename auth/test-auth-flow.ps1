# test-auth.ps1 - Тестирование авторизации
Write-Host "=== ТЕСТИРОВАНИЕ AUTH MODULE ===" -ForegroundColor Cyan
Write-Host "-" * 40

$baseUrl = "http://localhost:8001"

# 1. Проверка сервиса
Write-Host "1. Проверка сервиса..." -ForegroundColor Yellow
try {
    $info = Invoke-WebRequest -Uri "$baseUrl/" | ConvertFrom-Json
    Write-Host "   OK: $($info.service) v$($info.version)" -ForegroundColor Green
} catch {
    Write-Host "   ERROR: Сервис недоступен" -ForegroundColor Red
    exit 1
}

# 2. Тест регистрации через email
Write-Host "`n2. Тест регистрации через email..." -ForegroundColor Yellow
$testEmail = "test_$(Get-Date -Format 'yyyyMMdd_HHmmss')@example.com"
$emailBody = @{
    provider = "email"
    email = $testEmail
    password = "TestPassword123!"
} | ConvertTo-Json

Write-Host "   Email: $testEmail" -ForegroundColor Gray

try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/auth/init" `
        -Method POST `
        -ContentType "application/json" `
        -Body $emailBody `
        -ErrorAction Stop
    
    $result = $response.Content | ConvertFrom-Json
    Write-Host "   SUCCESS: $($result.message)" -ForegroundColor Green
    
    # Сохраняем токены
    $accessToken = $result.access_token
    $refreshToken = $result.refresh_token
    
} catch {
    Write-Host "   ERROR: Регистрация не удалась" -ForegroundColor Red
    Write-Host "   Причина: $($_.Exception.Message)" -ForegroundColor Gray
}

# 3. Тест обновления токена
if ($refreshToken) {
    Write-Host "`n3. Тест обновления токена..." -ForegroundColor Yellow
    $refreshBody = @{
        refresh_token = $refreshToken
    } | ConvertTo-Json
    
    try {
        $response = Invoke-WebRequest -Uri "$baseUrl/api/auth/refresh" `
            -Method POST `
            -ContentType "application/json" `
            -Body $refreshBody
        
        $result = $response.Content | ConvertFrom-Json
        Write-Host "   OK: Токен обновлен" -ForegroundColor Green
        
    } catch {
        Write-Host "   WARN: Не удалось обновить токен" -ForegroundColor Yellow
    }
}

# 4. Проверка OAuth endpoints
Write-Host "`n4. Проверка OAuth endpoints..." -ForegroundColor Yellow

$oauthEndpoints = @(
    @{Name="GitHub Callback"; Url="$baseUrl/api/auth/github/callback?code=test123"},
    @{Name="Yandex Callback"; Url="$baseUrl/api/auth/yandex/callback?code=test456"}
)

foreach ($endpoint in $oauthEndpoints) {
    Write-Host "   $($endpoint.Name) ..." -NoNewline
    try {
        $response = Invoke-WebRequest -Uri $endpoint.Url -ErrorAction SilentlyContinue
        Write-Host " OK ($($response.StatusCode))" -ForegroundColor Green
    } catch {
        $status = $_.Exception.Response.StatusCode.Value__
        Write-Host " ($status)" -ForegroundColor $(if ($status -eq 400) { "Yellow" } else { "Red" })
    }
}

# 5. Проверка токена
if ($accessToken) {
    Write-Host "`n5. Проверка токена..." -ForegroundColor Yellow
    try {
        $response = Invoke-WebRequest -Uri "$baseUrl/api/auth/verify/$accessToken"
        $result = $response.Content | ConvertFrom-Json
        Write-Host "   OK: Токен валиден" -ForegroundColor Green
        
    } catch {
        Write-Host "   WARN: Не удалось проверить токен" -ForegroundColor Yellow
    }
}

# 6. Выход из системы
if ($accessToken) {
    Write-Host "`n6. Тест выхода из системы..." -ForegroundColor Yellow
    $logoutBody = @{
        access_token = $accessToken
    } | ConvertTo-Json
    
    try {
        $response = Invoke-WebRequest -Uri "$baseUrl/api/auth/logout" `
            -Method POST `
            -ContentType "application/json" `
            -Body $logoutBody
        
        Write-Host "   OK: Выход выполнен" -ForegroundColor Green
        
    } catch {
        Write-Host "   WARN: Не удалось выполнить выход" -ForegroundColor Yellow
    }
}

Write-Host "`n" + ("-" * 40)
Write-Host "ИТОГ:" -ForegroundColor Cyan
Write-Host "Auth Module работает на: $baseUrl" -ForegroundColor Green
Write-Host "Для OAuth нужны реальные Client ID/Secret" -ForegroundColor Gray