const express = require('express');
const router = express.Router();
const sessionManager = require('../utils/session');
const { generateLoginToken } = require('../utils/tokens');

// Инициализация авторизации
router.get('/login/:type', async (req, res) => {
  const { type } = req.params;
  const { sessionToken, userStatus } = req;
  
  // Допустимые типы авторизации
  const validTypes = ['github', 'yandex', 'code'];
  if (!validTypes.includes(type)) {
    return res.redirect('/');
  }
  
  let newSessionToken = sessionToken;
  
  // Если пользователь неизвестный - создаем новую сессию
  if (userStatus === 'unknown') {
    const loginToken = generateLoginToken();
    newSessionToken = await sessionManager.createAnonymousSession(loginToken);
    
    if (!newSessionToken) {
      return res.status(500).render('error', {
        title: 'Ошибка',
        message: 'Не удалось создать сессию'
      });
    }
    
    // Устанавливаем куку с токеном сессии
    res.cookie('session_token', newSessionToken, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 дней
      sameSite: 'lax'
    });
    
    console.log(`[AUTH] Создана новая сессия: ${newSessionToken}`);
  }
  
  // Для анонимных пользователей обновляем токен входа
  if (userStatus === 'anonymous' || userStatus === 'unknown') {
    const loginToken = generateLoginToken();
    await sessionManager.updateSession(newSessionToken || sessionToken, {
      loginToken: loginToken,
      updatedAt: new Date().toISOString()
    });
    
    console.log(`[AUTH] Обновлен токен входа: ${loginToken}`);
    
      // Временная заглушка - редирект на страницу имитации OAuth
    res.redirect(`/mock/auth?type=${type}&token=${loginToken}&status=success`);
  } else if (userStatus === 'authenticated') {
    // Авторизованных пользователей отправляем в личный кабинет
    res.redirect('/');
  }
});

// Колбэк от провайдера авторизации (заглушка)
router.get('/callback', async (req, res) => {
  const { type, token, status } = req.query;
  const { sessionToken, userStatus } = req;
  
  console.log(`[AUTH CALLBACK] Тип: ${type}, Токен: ${token}, Статус: ${status}`);
  
  if (userStatus === 'unknown') {
    return res.redirect('/');
  }
  
  // Фиктивные данные пользователя
  const mockUserData = {
    id: `user_${Date.now()}`,
    email: 'student@example.com',
    name: status === 'success' ? 'Успешный Студент' : 'Тестовый Пользователь',
    roles: ['student'],
    permissions: ['course:read', 'test:take', 'user:profile:read']
  };
  
  const mockAccessToken = `mock_access_${Date.now()}`;
  const mockRefreshToken = `mock_refresh_${Date.now()}`;
  
  if (userStatus === 'anonymous') {
    // Имитируем успешную авторизацию
    await sessionManager.updateToAuthenticated(
      sessionToken,
      mockAccessToken,
      mockRefreshToken,
      mockUserData
    );
    
    console.log(`[AUTH] Пользователь авторизован: ${mockUserData.name}`);
    res.redirect('/');
  } else {
    res.redirect('/');
  }
});

// Проверка статуса авторизации (для AJAX)
router.get('/status', async (req, res) => {
  const { sessionData, userStatus } = req;
  
  res.json({
    status: userStatus,
    data: userStatus === 'authenticated' ? {
      user: sessionData.userData,
      tokens: {
        access: sessionData.accessToken,
        refresh: sessionData.refreshToken
      }
    } : null,
    timestamp: new Date().toISOString()
  });
});

// Быстрый вход для тестирования
router.get('/test-login', async (req, res) => {
  const loginToken = generateLoginToken();
  const sessionToken = await sessionManager.createAnonymousSession(loginToken);
  
  if (!sessionToken) {
    return res.status(500).send('Ошибка создания сессии');
  }
  
  const mockUserData = {
    id: `test_user_${Date.now()}`,
    email: 'test@example.com',
    name: 'Тестовый Аккаунт',
    roles: ['student', 'teacher'],
    permissions: ['course:read', 'course:write', 'test:take', 'test:create']
  };
  
  await sessionManager.updateToAuthenticated(
    sessionToken,
    `test_access_${Date.now()}`,
    `test_refresh_${Date.now()}`,
    mockUserData
  );
  
  res.cookie('session_token', sessionToken, {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  });
  
  res.redirect('/');
});

module.exports = router;