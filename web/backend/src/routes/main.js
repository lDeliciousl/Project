const express = require('express');
const router = express.Router();
const mainApiClient = require('../utils/mainApiClient');

// Главная страница
router.get('/', async (req, res) => {
  const { userStatus, sessionData } = req;
  
  console.log(`[MAIN] Статус пользователя: ${userStatus}`);
  
  switch (userStatus) {
    case 'unknown':
      // Показываем страницу авторизации
      res.render('login', {
        title: 'Вход в систему',
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
        loginToken: sessionData?.loginToken || 'NO_TOKEN',
        authMethods: [
          { type: 'github', name: 'GitHub' },
          { type: 'yandex', name: 'Яндекс ID' },
          { type: 'code', name: 'Код' }
        ]
      });
      break;
      
    case 'authenticated':
      // Показываем личный кабинет с реальными данными из main модуля
      try {
        const user = sessionData?.userData || { 
          name: 'Пользователь', 
          email: 'unknown@example.com',
          roles: ['student']
        };
        const accessToken = sessionData?.accessToken;
        
        let courses = [];
        let notifications = [];
        
        // Получаем данные пользователя из main модуля
        if (user.id && accessToken) {
          try {
            // Получаем курсы пользователя
            const coursesData = await mainApiClient.getUserCourses(user.id, accessToken);
            if (coursesData && Array.isArray(coursesData)) {
              courses = coursesData;
            } else if (coursesData && coursesData.courses) {
              courses = coursesData.courses;
            }
            
            // Получаем дополнительную информацию о пользователе
            try {
              const userName = await mainApiClient.getUserName(user.id, accessToken);
              if (userName && userName.name) {
                user.name = userName.name;
              }
            } catch (err) {
              console.warn(`[MAIN] Не удалось получить имя пользователя ${user.id}:`, err.message);
            }
            
            // Получаем тесты пользователя для отображения в курсах
            try {
              const userTestsData = await mainApiClient.getUserTests(user.id, accessToken);
              if (userTestsData && userTestsData.tests) {
                user.tests = userTestsData.tests;
              }
            } catch (err) {
              console.warn(`[MAIN] Не удалось получить тесты пользователя ${user.id}:`, err.message);
            }
            
            // Получаем уведомления пользователя
            try {
              const notificationsData = await mainApiClient.getNotifications(accessToken);
              if (notificationsData && notificationsData.notifications) {
                notifications = notificationsData.notifications;
              }
            } catch (err) {
              console.warn(`[MAIN] Не удалось получить уведомления:`, err.message);
            }
          } catch (err) {
            console.error(`[MAIN] Ошибка при получении данных пользователя ${user.id}:`, err.message);
          }
        } else {
          console.warn('[MAIN] Нет ID пользователя или accessToken');
        }
        
        res.render('dashboard', {
          title: 'Личный кабинет',
          user: user,
          courses: courses,
          notifications: notifications
        });
      } catch (error) {
        console.error('[MAIN] Критическая ошибка при загрузке dashboard:', error);
        res.render('dashboard', {
          title: 'Личный кабинет',
          user: sessionData?.userData || { 
            name: 'Пользователь', 
            email: 'unknown@example.com',
            roles: ['student']
          },
          courses: [],
          notifications: [],
          error: 'Не удалось загрузить данные.'
        });
      }
      break;
      
    default:
      res.redirect('/');
  }
});

// Страница входа (без параметров)
router.get('/login', (req, res) => {
  const { userStatus } = req;
  
  if (userStatus === 'authenticated') {
    return res.redirect('/');
  }
  
  res.render('login', {
    title: 'Вход в систему',
    authMethods: [
      { type: 'github', name: 'GitHub', icon: 'github' },
      { type: 'yandex', name: 'Яндекс ID', icon: 'yandex' },
      { type: 'code', name: 'Код авторизации', icon: 'key' }
    ]
  });
});

// Страница регистрации
router.get('/register', (req, res) => {
  const { userStatus } = req;
  
  if (userStatus === 'authenticated') {
    return res.redirect('/');
  }
  
  res.render('register', {
    title: 'Регистрация',
    authMethods: [
      { type: 'github', name: 'GitHub', icon: 'github' },
      { type: 'yandex', name: 'Яндекс ID', icon: 'yandex' },
      { type: 'code', name: 'Код авторизации', icon: 'key' }
    ]
  });
});

// Выход из системы
router.get('/logout', async (req, res) => {
  const { sessionToken, sessionData } = req;
  const sessionManager = require('../utils/session');
  const authApiClient = require('../utils/authApiClient');
  
  // Если есть refresh токен, вызываем logout в auth модуле
  if (sessionData?.refreshToken) {
    try {
      await authApiClient.logout(sessionData.refreshToken);
      console.log('[LOGOUT] Токены инвалидированы в auth модуле');
    } catch (error) {
      console.error('[LOGOUT] Ошибка при logout в auth модуле:', error);
      // Продолжаем удаление сессии даже если logout в auth модуле не удался
    }
  }
  
  if (sessionToken) {
    await sessionManager.deleteSession(sessionToken);
  }
  
  res.clearCookie('session_token');
  res.redirect('/');
});

// Страница курса
router.get('/course/:id', async (req, res) => {
  const { userStatus, sessionData } = req;
  
  if (userStatus !== 'authenticated') {
    return res.redirect('/');
  }
  
  const courseId = req.params.id;
  let course = null;
  
  try {
    // Пытаемся получить реальные данные курса из main модуля
    const user = sessionData?.userData;
    const accessToken = sessionData?.accessToken;
    
    if (user && user.id && accessToken) {
      try {
        // Сначала пытаемся получить информацию о курсе напрямую
        try {
          const courseData = await mainApiClient.getCourse(courseId, accessToken);
          if (courseData && courseData.id) {
            course = courseData;
          }
        } catch (err) {
          console.warn(`[MAIN] Не удалось получить курс ${courseId} напрямую:`, err.message);
        }
        
        // Если не получили, ищем в курсах пользователя
        if (!course) {
          const coursesData = await mainApiClient.getUserCourses(user.id, accessToken);
          const courses = Array.isArray(coursesData) ? coursesData : (coursesData?.courses || []);
          course = courses.find(c => c.id === courseId || c.id === parseInt(courseId));
        }
        
        // Если курс найден, получаем тесты курса
        if (course) {
          try {
            const testsData = await mainApiClient.getCourseTests(courseId, accessToken);
            if (testsData && testsData.tests) {
              course.tests = testsData.tests;
            }
          } catch (err) {
            console.warn(`[MAIN] Не удалось получить тесты для курса ${courseId}:`, err.message);
          }
        }
      } catch (err) {
        console.error(`[MAIN] Ошибка при получении данных курса ${courseId}:`, err.message);
      }
    }
    
    if (!course) {
      return res.status(404).render('error', {
        title: 'Курс не найден',
        statusCode: 404,
        message: 'Запрошенный курс не существует или недоступен.'
      });
    }
    
    res.render('course', {
      title: course.name,
      user: sessionData?.userData || { name: 'Пользователь', email: 'unknown@example.com' },
      course: course
    });
  } catch (error) {
    console.error('[MAIN] Критическая ошибка при загрузке курса:', error);
    res.status(500).render('error', {
      title: 'Ошибка',
      statusCode: 500,
      message: 'Не удалось загрузить данные курса. Попробуйте позже.'
    });
  }
});

// Страница теста
router.get('/test/:id', async (req, res) => {
  const { userStatus, sessionData } = req;
  
  if (userStatus !== 'authenticated') {
    return res.redirect('/login');
  }
  
  const testId = req.params.id;
  const user = sessionData?.userData || { name: 'Пользователь', email: 'unknown@example.com' };
  const accessToken = sessionData?.accessToken;
  
  try {
    // Получаем детали теста из main модуля
    const testData = await mainApiClient.getTestDetails(testId, accessToken);
    
    if (!testData || !testData.id) {
      return res.status(404).render('error', {
        title: 'Тест не найден',
        statusCode: 404,
        message: 'Запрошенный тест не существует или был удалён.'
      });
    }
    
    res.render('test', {
      title: testData.name,
      user: user,
      test: testData
    });
  } catch (error) {
    console.error(`[MAIN] Ошибка при загрузке теста ${testId}:`, error);
    
    if (error.status === 404) {
      return res.status(404).render('error', {
        title: 'Тест не найден',
        statusCode: 404,
        message: 'Запрошенный тест не существует.'
      });
    }
    
    if (error.status === 403) {
      return res.status(403).render('error', {
        title: 'Доступ запрещён',
        statusCode: 403,
        message: 'У вас нет доступа к этому тесту.'
      });
    }

    if (error.status === 401) {
      // Сессия есть, но токен невалиден/истёк. Пока нет автоматического refresh-flow,
      // поэтому сбрасываем сессию и предлагаем войти снова.
      return res.redirect('/logout');
    }
    
    res.status(500).render('error', {
      title: 'Ошибка',
      statusCode: 500,
      message: 'Не удалось загрузить тест. Попробуйте позже.'
    });
  }
});

// Страница 404
router.get('/404', (req, res) => {
  res.status(404).render('404', {
    title: 'Страница не найдена',
    userStatus: req.userStatus || 'unknown'
  });
});

// Отладочная страница
router.get('/debug', (req, res) => {
  res.json({
    userStatus: req.userStatus,
    sessionToken: req.sessionToken,
    sessionData: req.sessionData,
    cookies: req.cookies,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;