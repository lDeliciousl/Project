const express = require('express');
const router = express.Router();
const sessionManager = require('../utils/session');
const { generateLoginToken } = require('../utils/tokens');

// Инициализация авторизации через провайдера
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
  }
  
  // Для анонимных пользователей обновляем токен входа
  if (userStatus === 'anonymous' || userStatus === 'unknown') {
    const loginToken = generateLoginToken();
    await sessionManager.updateSession(newSessionToken, {
      loginToken: loginToken,
      updatedAt: new Date().toISOString()
    });
    
    // TODO: Вызов модуля авторизации
    // const authUrl = await authModule.initAuth(type, loginToken);
    
    // Временная заглушка - редирект на страницу успеха
    res.redirect(`/auth/callback?type=${type}&token=${loginToken}&status=success`);
  } else if (userStatus === 'authenticated') {
    // Авторизованных пользователей отправляем в личный кабинет
    res.redirect('/');
  }
});

// Колбэк от провайдера авторизации
router.get('/callback', async (req, res) => {
  const { type, token, status, error } = req.query;
  const { sessionToken, userStatus } = req;
  
  if (userStatus === 'unknown') {
    return res.redirect('/');
  }
  
  // TODO: В реальности здесь будет проверка ответа от модуля авторизации
  // const authResult = await authModule.verifyAuth(token);
  
  // Временная заглушка для демонстрации
  if (status === 'success') {
    if (userStatus === 'anonymous') {
      // Имитируем успешную авторизацию
      const mockUserData = {
        id: 'user_' + Date.now(),
        email: 'user@example.com',
        name: 'Тестовый Пользователь',
        roles: ['student']
      };
      
      const mockAccessToken = 'mock_access_token_' + Date.now();
      const mockRefreshToken = 'mock_refresh_token_' + Date.now();
      
      await sessionManager.updateToAuthenticated(
        sessionToken,
        mockAccessToken,
        mockRefreshToken,
        mockUserData
      );
      
      res.redirect('/');
    }
  } else if (error) {
    // Ошибка авторизации
    await sessionManager.deleteSession(sessionToken);
    res.clearCookie('session_token');
    res.render('auth_error', {
      title: 'Ошибка авторизации',
      message: 'Авторизация не удалась. Попробуйте снова.'
    });
  }
});

// Проверка статуса авторизации (для AJAX запросов)
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
    } : null
  });
});

module.exports = router;