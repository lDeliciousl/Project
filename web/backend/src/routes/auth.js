const express = require('express');
const router = express.Router();
const sessionManager = require('../utils/session');
const { generateLoginToken } = require('../utils/tokens');
const authApiClient = require('../utils/authApiClient');

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
    
    try {
      // Вызываем реальный auth модуль для инициализации OAuth
      const authResponse = await authApiClient.initOAuth(type, loginToken);
      
      if (authResponse && authResponse.auth_url) {
        // Редирект на реальный OAuth провайдер
        res.redirect(authResponse.auth_url);
      } else {
        throw new Error('Не получен auth_url от auth модуля');
      }
    } catch (error) {
      console.error(`[AUTH] Ошибка при инициализации OAuth (${type}):`, error);
      // Fallback на страницу ошибки
      res.status(500).render('error', {
        title: 'Ошибка авторизации',
        message: `Не удалось инициализировать авторизацию через ${type}. ${error.message || 'Попробуйте позже.'}`
      });
    }
  } else if (userStatus === 'authenticated') {
    // Авторизованных пользователей отправляем в личный кабинет
    res.redirect('/');
  }
});

// Колбэк от провайдера авторизации
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const { sessionToken, userStatus, sessionData } = req;
  
  console.log(`[AUTH CALLBACK] Код: ${code ? code.substring(0, 10) + '...' : 'нет'}, State: ${state}`);
  
  if (userStatus === 'unknown') {
    return res.redirect('/');
  }
  
  // Проверяем, что state совпадает с loginToken в сессии
  const loginToken = sessionData?.loginToken || state;
  
  if (!loginToken) {
    console.error('[AUTH CALLBACK] Нет loginToken в сессии');
    return res.status(400).render('error', {
      title: 'Ошибка авторизации',
      message: 'Не найден токен сессии. Попробуйте авторизоваться заново.'
    });
  }
  
  try {
    // Проверяем статус авторизации через auth модуль
    const verifyResponse = await authApiClient.verifyLoginToken(loginToken);
    
    if (verifyResponse && verifyResponse.status === 'authenticated') {
      // Авторизация успешна, обновляем сессию
      await sessionManager.updateToAuthenticated(
        sessionToken,
        verifyResponse.access_token,
        verifyResponse.refresh_token,
        verifyResponse.user || {
          id: verifyResponse.user_id || `user_${Date.now()}`,
          email: verifyResponse.email || 'unknown@example.com',
          name: verifyResponse.name || 'Пользователь',
          roles: verifyResponse.roles || ['student'],
          permissions: verifyResponse.permissions || ['course:read', 'test:take']
        }
      );
      
      console.log(`[AUTH] Пользователь авторизован через OAuth`);
      res.redirect('/');
    } else if (verifyResponse && verifyResponse.status === 'pending') {
      // Авторизация еще в процессе
      console.log(`[AUTH] Авторизация в процессе, ожидание...`);
      res.render('waiting', {
        title: 'Ожидание авторизации',
        loginToken: loginToken,
        authMethods: [
          { type: 'github', name: 'GitHub' },
          { type: 'yandex', name: 'Яндекс ID' },
          { type: 'code', name: 'Код' }
        ]
      });
    } else {
      // Авторизация отклонена или ошибка
      console.error(`[AUTH CALLBACK] Статус авторизации: ${verifyResponse?.status || 'unknown'}`);
      res.status(403).render('error', {
        title: 'Авторизация отклонена',
        message: verifyResponse?.message || 'Авторизация не была завершена. Попробуйте снова.'
      });
    }
  } catch (error) {
    console.error(`[AUTH CALLBACK] Ошибка при проверке статуса:`, error);
    res.status(500).render('error', {
      title: 'Ошибка авторизации',
      message: `Не удалось проверить статус авторизации. ${error.message || 'Попробуйте позже.'}`
    });
  }
});

// Проверка статуса авторизации (для AJAX)
router.get('/status', async (req, res) => {
  const { sessionData, userStatus, sessionToken } = req;
  
  // Если пользователь анонимный, проверяем статус через auth модуль
  if (userStatus === 'anonymous' && sessionData?.loginToken) {
    try {
      const verifyResponse = await authApiClient.verifyLoginToken(sessionData.loginToken);
      
      if (verifyResponse && verifyResponse.status === 'authenticated') {
        // Авторизация завершена, обновляем сессию
        await sessionManager.updateToAuthenticated(
          sessionToken,
          verifyResponse.access_token,
          verifyResponse.refresh_token,
          verifyResponse.user || {
            id: verifyResponse.user_id || `user_${Date.now()}`,
            email: verifyResponse.email || 'unknown@example.com',
            name: verifyResponse.name || 'Пользователь',
            roles: verifyResponse.roles || ['student'],
            permissions: verifyResponse.permissions || ['course:read', 'test:take']
          }
        );
        
        // Обновляем данные сессии для ответа
        const updatedSession = await sessionManager.getSession(sessionToken);
        return res.json({
          status: 'authenticated',
          data: {
            user: updatedSession?.userData,
            tokens: {
              access: updatedSession?.accessToken,
              refresh: updatedSession?.refreshToken
            }
          },
          timestamp: new Date().toISOString()
        });
      } else if (verifyResponse && verifyResponse.status === 'pending') {
        return res.json({
          status: 'anonymous',
          data: null,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error(`[AUTH STATUS] Ошибка при проверке статуса:`, error);
      // Продолжаем с текущим статусом
    }
  }
  
  res.json({
    status: userStatus,
    data: userStatus === 'authenticated' ? {
      user: sessionData?.userData,
      tokens: {
        access: sessionData?.accessToken,
        refresh: sessionData?.refreshToken
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