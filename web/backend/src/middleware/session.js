const sessionManager = require('../utils/session');
const authApiClient = require('../utils/authApiClient');

async function sessionMiddleware(req, res, next) {
  const sessionToken = req.cookies.session_token;
  
  if (!sessionToken) {
    // Нет токена сессии - неизвестный пользователь
    req.userStatus = 'unknown';
    req.sessionToken = null;
    req.sessionData = null;
    return next();
  }

  // Получаем данные сессии из Redis
  const sessionData = await sessionManager.getSession(sessionToken);
  
  if (!sessionData) {
    // Сессия не найдена - неизвестный пользователь
    req.userStatus = 'unknown';
    req.sessionToken = null;
    req.sessionData = null;
    
    // Удаляем невалидную куку
    res.clearCookie('session_token');
    return next();
  }

  // Сохраняем данные сессии в запросе
  req.userStatus = sessionData.status;
  req.sessionToken = sessionToken;
  req.sessionData = sessionData;
  
  // Обновляем время последней активности
  await sessionManager.updateSession(sessionToken, {
    lastActivity: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // По ТЗ: для anonymous пользователей проверяем статус loginToken через auth-module
  // Это делается на каждом запросе (кроме /auth/* чтобы избежать циклов)
  if (sessionData.status === 'anonymous' && sessionData.loginToken && !req.path.startsWith('/auth')) {
    try {
      const verifyResponse = await authApiClient.verifyLoginToken(sessionData.loginToken);
      
      if (verifyResponse && verifyResponse.status === 'granted') {
        // Авторизация завершена - обновляем сессию
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
        
        // Обновляем данные в запросе
        req.userStatus = 'authenticated';
        req.sessionData = await sessionManager.getSession(sessionToken);
        console.log('[SESSION] Пользователь автоматически авторизован через loginToken');
      } else if (verifyResponse && (verifyResponse.status === 'denied' || verifyResponse.status === 'expired')) {
        // Авторизация отклонена или истекла - удаляем сессию
        await sessionManager.deleteSession(sessionToken);
        res.clearCookie('session_token');
        req.userStatus = 'unknown';
        req.sessionToken = null;
        req.sessionData = null;
        console.log('[SESSION] Сессия удалена: loginToken denied/expired');
        return res.redirect('/');
      }
      // Если status === 'pending' - ничего не делаем, оставляем anonymous
    } catch (error) {
      // Ошибка при проверке - продолжаем с текущим статусом
      console.warn('[SESSION] Ошибка при проверке loginToken:', error.message || error);
    }
  }

  next();
}

module.exports = sessionMiddleware;