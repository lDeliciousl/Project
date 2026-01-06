const express = require('express');
const router = express.Router();
const sessionManager = require('../utils/session');

// Главная страница
router.get('/', async (req, res) => {
  const { userStatus, sessionData } = req;
  
  switch (userStatus) {
    case 'unknown':
      // Показываем страницу авторизации
      res.render('login', {
        title: 'Авторизация',
        authMethods: [
          { type: 'github', name: 'GitHub', icon: 'github' },
          { type: 'yandex', name: 'Яндекс ID', icon: 'yandex' },
          { type: 'code', name: 'Код авторизации', icon: 'key' }
        ]
      });
      break;
      
    case 'anonymous':
      // Показываем страницу ожидания авторизации
      res.render('waiting', {
        title: 'Ожидание авторизации',
        loginToken: sessionData.loginToken,
        authMethods: [
          { type: 'github', name: 'GitHub' },
          { type: 'yandex', name: 'Яндекс ID' },
          { type: 'code', name: 'Код' }
        ]
      });
      break;
      
    case 'authenticated':
      // Показываем личный кабинет
      res.render('dashboard', {
        title: 'Личный кабинет',
        user: sessionData.userData,
        courses: [] // TODO: Загрузить курсы пользователя
      });
      break;
      
    default:
      res.redirect('/');
  }
});

// Страница входа (без параметров - редирект на главную)
router.get('/login', (req, res) => {
  res.redirect('/');
});

// Выход из системы
router.get('/logout', async (req, res) => {
  const { sessionToken, query } = req;
  
  if (sessionToken) {
    // Удаляем сессию из Redis
    await sessionManager.deleteSession(sessionToken);
    
    // Если нужно выйти со всех устройств
    if (query.all === 'true' && req.sessionData?.refreshToken) {
      // TODO: Вызов API модуля авторизации для инвалидации токена обновления
      // await authModule.logout(req.sessionData.refreshToken);
    }
  }
  
  // Удаляем куку
  res.clearCookie('session_token');
  
  // Редирект на главную
  res.redirect('/');
});

// Страница 404
router.get('/404', (req, res) => {
  res.status(404).render('404', {
    title: 'Страница не найдена',
    userStatus: req.userStatus || 'unknown'
  });
});

module.exports = router;