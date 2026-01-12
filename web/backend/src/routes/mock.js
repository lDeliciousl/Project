// Маршруты для тестирования и заглушек

const express = require('express');
const router = express.Router();
const sessionManager = require('../utils/session');

// Страница имитации OAuth колбэка
router.get('/auth', async (req, res) => {
  const { type, token, status } = req.query;
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Тестовая авторизация</title>
        <style>
            body { font-family: Arial, sans-serif; padding: 40px; text-align: center; }
            .container { max-width: 500px; margin: 0 auto; }
            .success { color: green; }
            .error { color: red; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1 class="${status === 'success' ? 'success' : 'error'}">
                ${status === 'success' ? '✅ Авторизация успешна!' : '❌ Авторизация отклонена'}
            </h1>
            <p>Тип: ${type}</p>
            <p>Токен: ${token}</p>
            <p>Статус: ${status}</p>
            <p>
                <a href="/">Вернуться в систему</a> | 
                <a href="/auth/test-login">Быстрый вход (тест)</a>
            </p>
            <script>
                // Автоматический редирект через 3 секунды
                setTimeout(() => window.location.href = '/', 3000);
            </script>
        </div>
    </body>
    </html>
  `);
});

// Страница успешной имитации OAuth (более красивая версия)
router.get('/auth-success', async (req, res) => {
  const { token, type } = req.query;
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Авторизация успешна</title>
        <style>
            body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                padding: 40px; 
                text-align: center; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0;
            }
            .container { 
                background: white; 
                max-width: 500px; 
                margin: 0 auto; 
                padding: 40px;
                border-radius: 15px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            }
            .success-icon { 
                color: #10b981; 
                font-size: 48px;
                margin-bottom: 20px;
            }
            h1 {
                color: #333;
                margin-bottom: 10px;
            }
            p {
                color: #666;
                line-height: 1.6;
                margin-bottom: 20px;
            }
            .token {
                background: #f8f9fa;
                border: 1px dashed #dee2e6;
                padding: 10px;
                border-radius: 8px;
                font-family: monospace;
                font-size: 14px;
                color: #333;
                margin: 15px 0;
                word-break: break-all;
            }
            .btn {
                display: inline-block;
                margin-top: 20px;
                padding: 12px 30px;
                background: #667eea;
                color: white;
                text-decoration: none;
                border-radius: 8px;
                font-weight: 600;
                transition: all 0.3s;
                border: none;
                cursor: pointer;
                font-size: 16px;
            }
            .btn:hover {
                background: #5a67d8;
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
            }
            .provider {
                display: inline-block;
                padding: 5px 15px;
                background: #e9ecef;
                border-radius: 20px;
                font-size: 14px;
                color: #495057;
                margin: 10px 0;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="success-icon">✅</div>
            <h1>Авторизация успешна!</h1>
            <div class="provider">Через: ${type.toUpperCase()}</div>
            <p>Вы успешно авторизовались в системе тестирования. Теперь вы можете перейти в личный кабинет.</p>
            
            <div class="token">Токен сессии: ${token}</div>
            
            <p style="font-size: 14px; color: #888;">
                Этот токен будет использоваться для идентификации вашей сессии.
            </p>
            
            <a href="/" class="btn">Перейти в личный кабинет</a>
            
            <script>
                // Автоматический редирект через 3 секунды
                setTimeout(() => {
                    window.location.href = '/';
                }, 3000);
                
                // Логика для автоматической авторизации
                // В реальном приложении здесь был бы AJAX запрос для подтверждения токена
                console.log('Токен авторизации:', '${token}');
                
                // Имитация успешной авторизации
                setTimeout(() => {
                    console.log('Авторизация подтверждена');
                }, 1000);
            </script>
        </div>
    </body>
    </html>
  `);
});


// Быстрый вход для тестирования
router.get('/quick-login', async (req, res) => {
  const sessionManager = require('../utils/session');
  const { generateLoginToken } = require('../utils/tokens');
  
  // Создаем новую сессию
  const loginToken = generateLoginToken();
  const sessionToken = await sessionManager.createAnonymousSession(loginToken);
  
  if (!sessionToken) {
    return res.status(500).send('Ошибка создания сессии');
  }
  
  // Сразу авторизуем
  const mockUser = {
    id: `test_user_${Date.now()}`,
    email: 'test@example.com',
    name: 'Тестовый Пользователь',
    roles: ['student'],
    permissions: ['course:read', 'test:take']
  };
  
  await sessionManager.updateToAuthenticated(
    sessionToken,
    `mock_access_${Date.now()}`,
    `mock_refresh_${Date.now()}`,
    mockUser
  );
  
  // Устанавливаем куку
  res.cookie('session_token', sessionToken, {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  });
  
  res.redirect('/');
});

// Информация о текущей сессии
router.get('/session-info', (req, res) => {
  res.json({
    userStatus: req.userStatus,
    sessionToken: req.sessionToken,
    sessionData: req.sessionData,
    cookies: req.cookies,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;