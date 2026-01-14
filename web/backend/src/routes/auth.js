const express = require('express');
const router = express.Router();
const sessionManager = require('../utils/session');
const { generateLoginToken } = require('../utils/tokens');
const authApiClient = require('../utils/authApiClient');

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const value = email.trim();
  if (value.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Инициализация авторизации
router.get('/login/:type', async (req, res) => {
  const { type } = req.params;
  const flow = (req.query?.flow || 'login').toString();
  const { sessionToken, userStatus } = req;

  // Допустимые типы авторизации
  const validTypes = ['github', 'yandex', 'code', 'confirm'];
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
      codeFlow: flow === 'register' ? 'register' : 'login',
      updatedAt: new Date().toISOString()
    });

    console.log(`[AUTH] Обновлен токен входа: ${loginToken}`);

    try {
      // Вызываем реальный auth модуль для инициализации OAuth
      const authResponse = await authApiClient.initOAuth(type, loginToken);

      if (type === 'code') {
        return res.render('code', {
          title: flow === 'register' ? 'Регистрация по коду' : 'Вход по коду',
          loginToken: loginToken,
          message: null,
          error: null,
          email: '',
          flow: flow === 'register' ? 'register' : 'login'
        });
      }

      if (type === 'confirm') {
        // Для confirm auth-module возвращает код подтверждения напрямую
        const confirmCode = authResponse.auth_url; // auth_url содержит сгенерированный код
        return res.render('confirm', {
          title: 'Вход по коду подтверждения',
          loginToken: loginToken,
          confirmCode: confirmCode,
          expiresIn: 60, // 1 минута
          message: null,
          error: null
        });
      }

      if (authResponse && authResponse.auth_url) {
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

router.post('/code/send', async (req, res) => {
  const { sessionToken, userStatus, sessionData } = req;

  if (userStatus === 'unknown' || !sessionToken) {
    return res.redirect('/login');
  }

  const loginToken = sessionData?.loginToken;
  const flow = sessionData?.codeFlow || 'login';
  const email = (req.body?.email || '').trim();

  if (!loginToken) {
    return res.status(400).render('error', {
      title: 'Ошибка авторизации',
      message: 'Не найден токен входа. Попробуйте заново.'
    });
  }

  if (!email) {
    return res.status(400).render('code', {
      title: flow === 'register' ? 'Регистрация по коду' : 'Вход по коду',
      loginToken,
      message: null,
      error: 'Введите email',
      email: '',
      flow,
      errorCode: 'invalid_email'
    });
  }

  if (!isValidEmail(email)) {
    return res.status(400).render('code', {
      title: flow === 'register' ? 'Регистрация по коду' : 'Вход по коду',
      loginToken,
      message: null,
      error: 'Введите корректный email',
      email,
      flow,
      errorCode: 'invalid_email'
    });
  }

  try {
    await authApiClient.generateAuthCode(loginToken, email, flow);

    return res.render('code', {
      title: flow === 'register' ? 'Регистрация по коду' : 'Вход по коду',
      loginToken,
      message: 'Код сгенерирован. Проверьте логи auth-модуля.',
      error: null,
      email,
      flow
    });
  } catch (error) {
    console.error('[AUTH CODE] Ошибка при генерации кода:', error);

    if (error && error.status === 404) {
      return res.status(404).render('code', {
        title: flow === 'register' ? 'Регистрация по коду' : 'Вход по коду',
        loginToken,
        message: null,
        error: 'Аккаунт не найден. Пожалуйста, зарегистрируйтесь.',
        email,
        flow,
        errorCode: 'account_not_found'
      });
    }

    if (error && error.status === 409) {
      return res.status(409).render('code', {
        title: flow === 'register' ? 'Регистрация по коду' : 'Вход по коду',
        loginToken,
        message: null,
        error: 'Аккаунт уже существует. Пожалуйста, войдите.',
        email,
        flow,
        errorCode: 'account_already_exists'
      });
    }

    return res.status(500).render('code', {
      title: flow === 'register' ? 'Регистрация по коду' : 'Вход по коду',
      loginToken,
      message: null,
      error: error.message || 'Не удалось сгенерировать код',
      email,
      flow,
      errorCode: 'server_error'
    });
  }
});

router.post('/code/verify', async (req, res) => {
  const { sessionToken, userStatus, sessionData } = req;

  if (userStatus === 'unknown' || !sessionToken) {
    return res.redirect('/login');
  }

  const loginToken = sessionData?.loginToken;
  const flow = sessionData?.codeFlow || 'login';
  const email = (req.body?.email || '').trim();
  const code = (req.body?.code || '').trim();

  if (!loginToken) {
    return res.status(400).render('error', {
      title: 'Ошибка авторизации',
      message: 'Не найден токен входа. Попробуйте заново.'
    });
  }

  if (email && !isValidEmail(email)) {
    return res.status(400).render('code', {
      title: flow === 'register' ? 'Регистрация по коду' : 'Вход по коду',
      loginToken,
      message: null,
      error: 'Введите корректный email',
      email,
      flow,
      errorCode: 'invalid_email'
    });
  }

  if (!code) {
    return res.status(400).render('code', {
      title: flow === 'register' ? 'Регистрация по коду' : 'Вход по коду',
      loginToken,
      message: null,
      error: 'Введите код',
      email,
      flow,
      errorCode: 'invalid_code'
    });
  }

  try {
    await authApiClient.verifyAuthCode(loginToken, code, sessionData?.refreshToken || '', flow);
    const verifyResponse = await authApiClient.verifyLoginToken(loginToken);

    if (verifyResponse && verifyResponse.status === 'granted') {
      const userData = verifyResponse.user_data;
      await sessionManager.updateToAuthenticated(
        sessionToken,
        verifyResponse.access_token,
        verifyResponse.refresh_token,
        userData || {
          id: `user_${Date.now()}`,
          email: email || 'unknown@example.com',
          name: 'Пользователь',
          roles: ['student']
        }
      );

      return res.redirect('/');
    }

    return res.status(403).render('code', {
      title: flow === 'register' ? 'Регистрация по коду' : 'Вход по коду',
      loginToken,
      message: null,
      error: verifyResponse?.message || 'Авторизация не завершена. Попробуйте снова.',
      email,
      flow,
      errorCode: 'authorization_failed'
    });
  } catch (error) {
    console.error('[AUTH CODE] Ошибка при проверке кода:', error);

    if (error && error.status === 404) {
      return res.status(404).render('code', {
        title: flow === 'register' ? 'Регистрация по коду' : 'Вход по коду',
        loginToken,
        message: null,
        error: 'Аккаунт не найден. Пожалуйста, зарегистрируйтесь.',
        email,
        flow,
        errorCode: 'account_not_found'
      });
    }

    if (error && error.status === 409) {
      return res.status(409).render('code', {
        title: flow === 'register' ? 'Регистрация по коду' : 'Вход по коду',
        loginToken,
        message: null,
        error: 'Аккаунт уже существует. Пожалуйста, войдите.',
        email,
        flow,
        errorCode: 'account_already_exists'
      });
    }

    if (error && error.status === 400) {
      return res.status(400).render('code', {
        title: flow === 'register' ? 'Регистрация по коду' : 'Вход по коду',
        loginToken,
        message: null,
        error: error.message || 'Неверный код',
        email,
        flow,
        errorCode: 'invalid_code'
      });
    }

    return res.status(500).render('code', {
      title: flow === 'register' ? 'Регистрация по коду' : 'Вход по коду',
      loginToken,
      message: null,
      error: error.message || 'Не удалось проверить код',
      email,
      flow,
      errorCode: 'server_error'
    });
  }
});

// Колбэк от провайдера авторизации (вызывается после редиректа от auth модуля)
router.get('/callback', async (req, res) => {
  const { token } = req.query; // token = loginToken из state
  const { sessionToken, userStatus, sessionData } = req;

  console.log(`[AUTH CALLBACK] Token: ${token ? token.substring(0, 10) + '...' : 'нет'}`);
  
  if (userStatus === 'unknown') {
    return res.redirect('/');
  }
  
  // Проверяем, что token совпадает с loginToken в сессии
  const loginToken = sessionData?.loginToken || token;
  
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
    
    if (verifyResponse && verifyResponse.status === 'granted') {
      // Авторизация успешна, обновляем сессию
      const userData = verifyResponse.user_data;
      await sessionManager.updateToAuthenticated(
        sessionToken,
        verifyResponse.access_token,
        verifyResponse.refresh_token,
        userData || {
          id: `user_${Date.now()}`,
          email: 'unknown@example.com',
          name: 'Пользователь',
          roles: ['student']
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

      if (verifyResponse && (verifyResponse.status === 'denied' || verifyResponse.status === 'expired')) {
        if (sessionToken) {
          await sessionManager.deleteSession(sessionToken);
        }
        res.clearCookie('session_token');
        return res.redirect('/');
      }

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

// Страница ошибки авторизации
router.get('/error', (req, res) => {
  const { message } = req.query;
  res.render('error', {
    title: 'Ошибка авторизации',
    message: message || 'Произошла ошибка при авторизации. Попробуйте снова.'
  });
});

// Проверка статуса авторизации (для AJAX)
router.get('/status', async (req, res) => {
  const { sessionData, userStatus, sessionToken } = req;
  const queryLoginToken = (req.query?.loginToken || '').toString().trim();
  const effectiveLoginToken = sessionData?.loginToken || queryLoginToken;
  
  if ((userStatus === 'anonymous' || userStatus === 'unknown') && effectiveLoginToken) {
    try {
      const verifyResponse = await authApiClient.verifyLoginToken(effectiveLoginToken);
      
      if (verifyResponse && verifyResponse.status === 'granted') {
        // Авторизация завершена, обновляем сессию
        if (!sessionToken) {
          return res.json({
            status: 'authenticated',
            data: null,
            timestamp: new Date().toISOString()
          });
        }

        const userData = verifyResponse.user_data;
        await sessionManager.updateToAuthenticated(
          sessionToken,
          verifyResponse.access_token,
          verifyResponse.refresh_token,
          userData || {
            id: `user_${Date.now()}`,
            email: 'unknown@example.com',
            name: 'Пользователь',
            roles: ['student']
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
      } else if (verifyResponse && (verifyResponse.status === 'denied' || verifyResponse.status === 'expired')) {
        if (sessionToken) {
          await sessionManager.deleteSession(sessionToken);
        }
        res.clearCookie('session_token');
        return res.json({
          status: 'unknown',
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

// Страница для ввода кода подтверждения на авторизованном устройстве
router.get('/confirm', (req, res) => {
  const { userStatus } = req;
  
  if (userStatus !== 'authenticated') {
    return res.status(401).render('confirm-input', {
      title: 'Подтвердить вход на другом устройстве',
      message: null,
      error: 'Нужно войти в аккаунт на этом устройстве, чтобы подтвердить код.'
    });
  }
  
  res.render('confirm-input', {
    title: 'Подтвердить вход на другом устройстве',
    message: null,
    error: null
  });
});

// Обработка подтверждения кода с авторизованного устройства
router.post('/confirm/verify', async (req, res) => {
  const { userStatus, sessionData } = req;
  
  if (userStatus !== 'authenticated') {
    return res.status(401).render('confirm-input', {
      title: 'Подтвердить вход на другом устройстве',
      message: null,
      error: 'Нужно войти в аккаунт на этом устройстве, чтобы подтвердить код.'
    });
  }
  
  const code = (req.body?.code || '').trim();
  const refreshToken = sessionData?.refreshToken;
  
  if (!code) {
    return res.status(400).render('confirm-input', {
      title: 'Подтвердить вход на другом устройстве',
      message: null,
      error: 'Введите код подтверждения'
    });
  }
  
  if (!refreshToken) {
    return res.status(400).render('error', {
      title: 'Ошибка',
      message: 'Не найден токен авторизации. Попробуйте войти заново.'
    });
  }
  
  try {
    await authApiClient.verifyConfirmCode(code, refreshToken);
    
    return res.render('confirm-input', {
      title: 'Подтвердить вход на другом устройстве',
      message: 'Код подтверждён! Вход на другом устройстве выполнен.',
      error: null
    });
  } catch (error) {
    console.error('[CONFIRM CODE] Ошибка при подтверждении кода:', error);
    
    let errorMsg = 'Не удалось подтвердить код';
    if (error.message === 'invalid code') {
      errorMsg = 'Неверный код подтверждения';
    } else if (error.message === 'code expired') {
      errorMsg = 'Код подтверждения истёк';
    }
    
    return res.status(400).render('confirm-input', {
      title: 'Подтвердить вход на другом устройстве',
      message: null,
      error: errorMsg
    });
  }
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