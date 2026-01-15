const sessionManager = require('../utils/session');
const authApiClient = require('../utils/authApiClient');
const mainApiClient = require('../utils/mainApiClient');

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
        
        // Синхронизируем пользователя с main-module
        if (userData && verifyResponse.access_token) {
          try {
            await mainApiClient.addUser({
              user_id: userData.id,
              email: userData.email,
              full_name: userData.name,
              roles: `{${userData.roles.join(',')}}`
            }, verifyResponse.access_token);
            console.log('[SESSION] Пользователь синхронизирован с main-module:', userData.email);
          } catch (syncError) {
            console.warn('[SESSION] Ошибка синхронизации с main-module:', syncError.message || syncError);
            // Не прерываем авторизацию при ошибке синхронизации
          }
        }

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

  // Дополнительная синхронизация для авторизованных пользователей (если еще не синхронизирован)
  if (sessionData.status === 'authenticated' && sessionData.accessToken && sessionData.userData) {
    console.log('[SESSION] Проверка синхронизации для пользователя:', sessionData.userData.email);
    try {
      // Проверяем, есть ли пользователь в main-module
      const userExists = await mainApiClient.getUsers(sessionData.accessToken)
        .then(users => {
          const userList = users.users || users;
          return userList && userList.some(user => user.id === sessionData.userData.id);
        })
        .catch(() => false);
      
      if (!userExists) {
        // Синхронизируем пользователя с main-module
        await mainApiClient.addUser({
          user_id: sessionData.userData.id,
          email: sessionData.userData.email,
          full_name: sessionData.userData.name,
          roles: `{${sessionData.userData.roles.join(',')}}`
        }, sessionData.accessToken);
        console.log('[SESSION] Пользователь синхронизирован с main-module:', sessionData.userData.email);
      }
    } catch (syncError) {
      console.warn('[SESSION] Ошибка синхронизации с main-module:', syncError.message || syncError);
      // Не прерываем работу при ошибке синхронизации
    }
  }

  next();
}

module.exports = sessionMiddleware;