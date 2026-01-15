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
  
  // Обновляем время последней активности (не чаще чем раз в минуту)
  const now = Date.now();
  const lastUpdate = new Date(sessionData.lastActivity || 0).getTime();
  if (!lastUpdate || now - lastUpdate > 60000) { // раз в минуту
    await sessionManager.updateSession(sessionToken, {
      lastActivity: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

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
      // Добавляем таймаут для операции с Main модулем
      const usersResponse = await Promise.race([
        mainApiClient.getUsers(sessionData.accessToken),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Main module timeout')), 5000)
        )
      ]);
      
      const userList = Array.isArray(usersResponse) ? usersResponse : (usersResponse?.users || []);
      const userExists = userList.some(user => user.id === sessionData.userData.id);
      
      if (!userExists) {
        // Синхронизируем пользователя с main-module с таймаутом
        await Promise.race([
          mainApiClient.addUser({
            user_id: sessionData.userData.id,
            email: sessionData.userData.email,
            full_name: sessionData.userData.name,
            roles: `{${sessionData.userData.roles.join(',')}}`
          }, sessionData.accessToken),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Main module timeout during sync')), 3000)
          )
        ]);
        console.log('[SESSION] Пользователь синхронизирован с main-module:', sessionData.userData.email);
      }
    } catch (syncError) {
      if (syncError.message === 'Main module timeout' || syncError.message === 'Main module timeout during sync') {
        console.warn('[SESSION] Таймаут при синхронизации с main-module, пропускаем');
      } else {
        console.warn('[SESSION] Ошибка синхронизации с main-module:', syncError.message || syncError);
      }
      // Не прерываем работу при ошибке синхронизации
    }
  }

  // Временно упрощаем проверку для авторизованных пользователей
  if (sessionData.status === 'authenticated') {
    console.log('[SESSION] Авторизованный пользователь:', sessionData.userData?.email);
  }

  next();
}

module.exports = sessionMiddleware;