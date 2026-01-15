const express = require('express');
const router = express.Router();
const mainApiClient = require('../utils/mainApiClient');
const sessionManager = require('../utils/session');
const authApiClient = require('../utils/authApiClient');

// Вспомогательная функция для получения курсов пользователя
async function getUserCourses(req, userId) {
  try {
    const coursesResp = await mainApiClient.requestWithRefresh({
      endpoint: `/api/db/users/${userId}/courses`,
      method: 'get',
      sessionToken: req.sessionToken,
      sessionData: req.sessionData,
      sessionManager,
      authApiClient,
      res: req.res
    });
    const coursesData = coursesResp?.data;
    
    if (coursesData && Array.isArray(coursesData)) {
      return coursesData;
    } else if (coursesData && coursesData.courses && Array.isArray(coursesData.courses)) {
      return coursesData.courses;
    } else if (coursesData && coursesData.length > 0) {
      return coursesData;
    }
    
    return [];
  } catch (err) {
    console.warn(`[MAIN] Не удалось получить курсы пользователя ${userId}:`, err.message);
    return [];
  }
}

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
          { type: 'code', name: 'Код на email', icon: 'key' },
          { type: 'confirm', name: 'Подтверждение', icon: 'phone' }
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
        // Фоллбек имени, если провайдер не прислал
        if (!user.name || user.name.trim() === '') {
          user.name = user.email || 'Пользователь';
        }

        const accessToken = sessionData?.accessToken;
        
        let courses = [];
        let notifications = [];
        
        // Получаем данные пользователя из main модуля
        if (user.id && accessToken) {
          try {
            // Получаем курсы пользователя
            courses = await getUserCourses(req, user.id);
            
            // Получаем дополнительную информацию о пользователе
            try {
              const userNameResp = await mainApiClient.requestWithRefresh({
                endpoint: `/api/db/users/${user.id}/name`,
                method: 'get',
                sessionToken: req.sessionToken,
                sessionData,
                sessionManager,
                authApiClient,
                res
              });
              const userName = userNameResp?.data;
              if (userName && userName.name) {
                user.name = userName.name;
              }
            } catch (err) {
              console.warn(`[MAIN] Не удалось получить имя пользователя ${user.id}:`, err.message);
            }
            
            // Получаем тесты пользователя для отображения в курсах
            try {
              const userTestsResp = await mainApiClient.requestWithRefresh({
                endpoint: `/api/db/users/${user.id}/tests`,
                method: 'get',
                sessionToken: req.sessionToken,
                sessionData,
                sessionManager,
                authApiClient,
                res
              });
              const userTestsData = userTestsResp?.data;
              if (userTestsData && userTestsData.tests) {
                user.tests = userTestsData.tests;
              }
            } catch (err) {
              console.warn(`[MAIN] Не удалось получить тесты пользователя ${user.id}:`, err.message);
            }
            
            // Получаем уведомления пользователя
            try {
              const notificationsResp = await mainApiClient.requestWithRefresh({
                endpoint: `/notification`,
                method: 'get',
                sessionToken: req.sessionToken,
                sessionData,
                sessionManager,
                authApiClient,
                res
              });
              const notificationsData = notificationsResp?.data;
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
          notifications: notifications,
          sessionData
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
          error: 'Не удалось загрузить данные.',
          sessionData
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

  return res.redirect('/');
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
// GET /logout - выход только на этом устройстве (удаление Redis сессии)
// GET /logout?all=true - выход на всех устройствах (+ инвалидация refresh token в auth модуле)
router.get('/logout', async (req, res) => {
  const { sessionToken, sessionData } = req;
  
  const logoutAll = req.query.all === 'true';
  
  // Если all=true и есть refresh токен, вызываем logout в auth модуле (инвалидируем на всех устройствах)
  if (logoutAll && sessionData?.refreshToken) {
    try {
      await authApiClient.logout(sessionData.refreshToken);
      console.log('[LOGOUT] Токены инвалидированы в auth модуле (all devices)');
    } catch (error) {
      console.error('[LOGOUT] Ошибка при logout в auth модуле:', error);
    }
  }
  
  // Удаляем текущую сессию в Redis (всегда)
  if (sessionToken) {
    await sessionManager.deleteSession(sessionToken);
    console.log('[LOGOUT] Сессия удалена из Redis');
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
          const courseResp = await mainApiClient.requestWithRefresh({
            endpoint: `/api/courses/${courseId}`,
            method: 'get',
            sessionToken: req.sessionToken,
            sessionData,
            sessionManager,
            authApiClient,
            res
          });
          const courseData = courseResp?.data;
          if (courseData && courseData.id) {
            course = courseData;
          }
        } catch (err) {
          console.warn(`[MAIN] Не удалось получить курс ${courseId} напрямую:`, err.message);
        }
        
        // Если не получили, ищем в курсах пользователя
        if (!course) {
          const courses = await getUserCourses(req, user.id);
          course = courses.find(c => c.id === courseId || c.id === parseInt(courseId));
        }
        
        // Если курс найден, получаем тесты курса
        if (course) {
          try {
            const testsResp = await mainApiClient.requestWithRefresh({
              endpoint: `/api/courses/${courseId}/tests`,
              method: 'get',
              sessionToken: req.sessionToken,
              sessionData,
              sessionManager,
              authApiClient,
              res
            });
            const testsData = testsResp?.data;
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
        status: 404,
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
      status: 500,
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
    const testResp = await mainApiClient.requestWithRefresh({
      endpoint: `/api/tests/${testId}`,
      method: 'get',
      sessionToken: req.sessionToken,
      sessionData,
      sessionManager,
      authApiClient,
      res
    });
    const testData = testResp?.data;
    
    if (!testData || !testData.id) {
      return res.status(404).render('error', {
        title: 'Тест не найден',
        status: 404,
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
        status: 404,
        message: 'Запрошенный тест не существует.'
      });
    }
    
    if (error.status === 403) {
      return res.status(403).render('error', {
        title: 'Доступ запрещён',
        status: 403,
        message: 'У вас нет доступа к этому тесту.'
      });
    }

    if (error.status === 401) {
      return res.redirect('/logout');
    }
    
    res.status(500).render('error', {
      title: 'Ошибка',
      status: 500,
      message: 'Не удалось загрузить тест. Попробуйте позже.'
    });
  }
});

// Страница результатов попытки теста
router.get('/test/:testId/result/:attemptId', async (req, res) => {
  const { userStatus, sessionData } = req;
  
  if (userStatus !== 'authenticated') {
    return res.redirect('/login');
  }
  
  const { testId, attemptId } = req.params;
  const user = sessionData?.userData || { name: 'Пользователь', email: 'unknown@example.com' };
  
  try {
    const testResp = await mainApiClient.requestWithRefresh({
      endpoint: `/api/tests/${testId}`,
      method: 'get',
      sessionToken: req.sessionToken,
      sessionData,
      sessionManager,
      authApiClient,
      res
    });
    const test = testResp?.data;
    
    if (!test || !test.id) {
      return res.status(404).render('error', {
        title: 'Тест не найден',
        status: 404,
        message: 'Запрошенный тест не существует.'
      });
    }
    
    const attemptResp = await mainApiClient.requestWithRefresh({
      endpoint: `/api/attempts/${attemptId}`,
      method: 'get',
      sessionToken: req.sessionToken,
      sessionData,
      sessionManager,
      authApiClient,
      res
    });
    const attempt = attemptResp?.data;
    
    if (!attempt) {
      return res.status(404).render('error', {
        title: 'Попытка не найдена',
        status: 404,
        message: 'Запрошенная попытка не существует.'
      });
    }
    
    const answersResp = await mainApiClient.requestWithRefresh({
      endpoint: `/api/attempts/${attemptId}/answers`,
      method: 'get',
      sessionToken: req.sessionToken,
      sessionData,
      sessionManager,
      authApiClient,
      res
    });
    const answers = answersResp?.data?.answers || [];
    
    const correctAnswers = answers.filter(a => a.is_correct).length;
    const totalQuestions = answers.length;
    const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
    
    res.render('test-result', {
      title: `Результаты - ${test.name}`,
      user: user,
      test: test,
      attempt: attempt,
      answers: answers,
      correctAnswers: correctAnswers,
      totalQuestions: totalQuestions,
      score: score
    });
  } catch (error) {
    console.error(`[MAIN] Ошибка при загрузке результатов теста ${testId}:`, error);
    
    if (error.status === 404) {
      return res.status(404).render('error', {
        title: 'Не найдено',
        status: 404,
        message: 'Запрошенные данные не существуют.'
      });
    }
    
    res.status(500).render('error', {
      title: 'Ошибка',
      status: 500,
      message: 'Не удалось загрузить результаты. Попробуйте позже.'
    });
  }
});

// Страница дисциплин
router.get('/disciplines', async (req, res) => {
  const { userStatus, sessionData } = req;
  
  if (userStatus !== 'authenticated') {
    return res.redirect('/');
  }
  
  try {
    const user = sessionData?.userData || { name: 'Пользователь', email: 'unknown@example.com' };
    const accessToken = sessionData?.accessToken;
    
    let allCourses = [];
    let userCourses = [];
    
    // Получаем все доступные курсы
    if (accessToken) {
      try {
        const allCoursesResp = await mainApiClient.requestWithRefresh({
          endpoint: `/api/courses`,
          method: 'get',
          sessionToken: req.sessionToken,
          sessionData,
          sessionManager,
          authApiClient,
          res
        });
        const allCoursesData = allCoursesResp?.data;

        if (allCoursesData && Array.isArray(allCoursesData)) {
          allCourses = allCoursesData;
        } else if (allCoursesData && allCoursesData.courses && Array.isArray(allCoursesData.courses)) {
          allCourses = allCoursesData.courses;
        } else {
          allCourses = [];
        }
      } catch (err) {
        console.warn('[MAIN] Не удалось получить все курсы:', err.message);
      }
      
      // Получаем курсы пользователя
      if (user.id) {
        userCourses = await getUserCourses(req, user.id);
      }
    }
    
    // Определяем, на какие курсы пользователь уже записан
    const userCourseIds = new Set(userCourses.map(course => course.id));
    
    // Разделяем курсы на доступные для записи и уже записанные
    // Примечание: API не возвращает поле active, показываем все курсы
    const availableCourses = allCourses.filter(course => 
      !userCourseIds.has(course.id)
    );
    const enrolledCourses = allCourses.filter(course => 
      userCourseIds.has(course.id)
    );
    
    console.log('[MAIN] Final availableCourses:', availableCourses);
    console.log('[MAIN] Final enrolledCourses:', enrolledCourses);
    
    res.render('disciplines', {
      title: 'Дисциплины',
      user: user,
      availableCourses: availableCourses,
      enrolledCourses: enrolledCourses
    });
  } catch (error) {
    console.error('[MAIN] Ошибка при загрузке дисциплин:', error);
    res.status(500).render('error', {
      title: 'Ошибка',
      status: 500,
      message: 'Не удалось загрузить дисциплины. Попробуйте позже.'
    });
  }
});

// Страница профиля
router.get('/profile', async (req, res) => {
  if (req.userStatus !== 'authenticated') {
    return res.redirect('/');
  }

  const sessionUser = req.sessionData?.userData || {};
  const roles = sessionUser.roles || [];
  const isAdmin = roles.includes('admin') || roles.includes('Админ');

  // Получаем актуальное имя из API
  let userName = sessionUser.name;
  if (sessionUser.id) {
    try {
      const nameResp = await mainApiClient.requestWithRefresh({
        endpoint: `/api/db/users/${sessionUser.id}/name`,
        method: 'get',
        sessionToken: req.sessionToken,
        sessionData: req.sessionData,
        sessionManager,
        authApiClient,
        res
      });
      if (nameResp?.data?.name) {
        userName = nameResp.data.name;
      }
    } catch (err) {
      console.warn('[PROFILE] Не удалось получить имя из API:', err.message);
    }
  }

  const user = { ...sessionUser, name: userName };

  res.render('profile', {
    title: 'Мой профиль',
    user,
    isAdmin
  });
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