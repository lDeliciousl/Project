const sessionManager = require('../utils/session');

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

  next();
}

module.exports = sessionMiddleware;