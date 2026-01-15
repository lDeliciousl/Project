const express = require('express');
const router = express.Router();
const mainApiClient = require('../utils/mainApiClient');

// Хелпер для получения accessToken из сессии
function getAccessToken(req) {
  return req.sessionData?.accessToken || null;
}

// Middleware для проверки авторизации
function requireAuth(req, res, next) {
  if (req.userStatus !== 'authenticated' || !getAccessToken(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Тестовый маршрут
router.get('/', (req, res) => {
  res.json({ 
    message: 'API работает',
    timestamp: new Date().toISOString(),
    userStatus: req.userStatus || 'unknown'
  });
});

// Тест Redis
router.get('/test-redis', async (req, res) => {
  try {
    const redisClient = require('../utils/redisClient').getClient();
    const timestamp = new Date().toISOString();
    await redisClient.set('last_test', timestamp);
    const value = await redisClient.get('last_test');
    
    res.json({
      message: 'Redis test successful',
      timestamp: timestamp,
      retrieved: value
    });
  } catch (error) {
    res.status(500).json({
      error: 'Redis test failed',
      details: error.message
    });
  }
});

// Текущее имя пользователя из main модуля
router.get('/me/name', requireAuth, async (req, res) => {
  try {
    const userId = req.sessionData?.userData?.id;
    if (!userId) {
      return res.status(400).json({ error: 'User ID not found in session' });
    }
    const resp = await mainApiClient.requestWithRefresh({
      endpoint: `/api/db/users/${userId}/name`,
      method: 'get',
      sessionToken: req.sessionToken,
      sessionData: req.sessionData,
      sessionManager: require('../utils/session'),
      authApiClient: require('../utils/authApiClient'),
      res
    });

    // Если токены обновились, возвращаем их в ответ для возможной синхронизации
    if (resp?.newTokens) {
      res.set('x-new-access-token', resp.newTokens.accessToken);
      res.set('x-new-refresh-token', resp.newTokens.refreshToken);
    }

    return res.json(resp?.data || {});
  } catch (error) {
    console.error('[API] /me/name error:', error.message || error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to fetch user name' });
  }
});

router.get('/session-tokens', (req, res) => {
  console.log('[API] /session-tokens called, userStatus:', req.userStatus, 'sessionData.accessToken present:', !!req.sessionData?.accessToken);
  const accessToken = req.sessionData?.accessToken;
  const refreshToken = req.sessionData?.refreshToken;
  if (!accessToken || !refreshToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({ accessToken, refreshToken });
});

// Текущий пользователь из сессии (+ опционально имя из main)
router.get('/me', requireAuth, async (req, res) => {
  const user = req.sessionData?.userData;
  if (!user) {
    return res.status(404).json({ error: 'User not found in session' });
  }

  const response = {
    user,
    tokens: {
      accessToken: req.sessionData?.accessToken,
      refreshToken: req.sessionData?.refreshToken
    }
  };

  // Если передан ?main=1 и есть user.id, подтягиваем имя из main
  if (req.query?.main === '1' && user.id && req.sessionData?.accessToken) {
    try {
      const sessionManager = require('../utils/session');
      const authApiClient = require('../utils/authApiClient');
      const mainResp = await mainApiClient.requestWithRefresh({
        endpoint: `/api/db/users/${user.id}/name`,
        method: 'get',
        sessionToken: req.sessionToken,
        sessionData: req.sessionData,
        sessionManager,
        authApiClient,
        res
      });
      response.main = mainResp?.data || null;
      if (mainResp?.newTokens) {
        response.tokens.accessToken = mainResp.newTokens.accessToken;
        response.tokens.refreshToken = mainResp.newTokens.refreshToken;
      }
    } catch (error) {
      response.mainError = error.message || 'Failed to fetch main profile';
    }
  }

  res.json(response);
});

// Маршрут для проверки здоровья
router.get('/health', (req, res) => {
  console.log('[API] /health called');
  res.json({
    status: 'ok',
    service: 'web-backend-api',
    timestamp: new Date().toISOString()
  });
});

// Проверка подключения к main модулю
router.get('/main-health', async (req, res) => {
  try {
    const mainApiClient = require('../utils/mainApiClient');
    const health = await mainApiClient.healthCheck();
    
    res.json({
      status: 'ok',
      mainModule: {
        url: mainApiClient.baseURL,
        status: health.status || 'ok',
        message: health.message || 'Connected'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      mainModule: {
        url: process.env.MAIN_MODULE_URL || 'http://main-module:3002',
        status: 'unavailable',
        error: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Проверка подключения к auth модулю
router.get('/auth-health', async (req, res) => {
  try {
    const authApiClient = require('../utils/authApiClient');
    const health = await authApiClient.healthCheck();
    
    res.json({
      status: 'ok',
      authModule: {
        url: authApiClient.baseURL,
        status: health.status || 'ok',
        message: health.message || 'Connected'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      authModule: {
        url: process.env.AUTH_MODULE_URL || 'http://auth-module:8001',
        status: 'unavailable',
        error: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

// ========== Проксирование запросов к main модулю ==========

// ========== ТЕСТЫ ==========

router.get('/tests', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.getTests(getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.get('/tests/:id', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.getTestDetails(req.params.id, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.post('/tests', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.createTest(req.body, getAccessToken(req));
    res.status(201).json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.put('/tests/:id/activate', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.activateTest(req.params.id, req.body.is_active, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.post('/tests/:id/questions', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.addQuestionToTest(req.params.id, req.body, getAccessToken(req));
    res.status(201).json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.delete('/tests/:testId/questions/:questionId', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.removeQuestionFromTest(req.params.testId, req.params.questionId, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.put('/tests/:id/questions/order', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.updateQuestionsOrder(req.params.id, req.body.question_ids, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.put('/tests/:id', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.updateTest(req.params.id, req.body, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.delete('/tests/:id', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.deleteTest(req.params.id, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.post('/tests/attempts', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.createTestAttempt(req.body, getAccessToken(req));
    res.status(201).json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

// ========== ПОПЫТКИ (ATTEMPTS) ==========

router.get('/attempts/:id', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.getAttempt(req.params.id, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.post('/attempts/:id/finish', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.finishAttempt(req.params.id, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.put('/attempts/:attemptId/answers/:answerId', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.updateAnswer(req.params.attemptId, req.params.answerId, req.body.option_id, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.get('/attempts/:id/answers', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.getAttemptAnswers(req.params.id, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.delete('/attempts/:attemptId/answers/:answerId', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.deleteAnswer(req.params.attemptId, req.params.answerId, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

// ========== ВОПРОСЫ (QUESTIONS) ==========

router.get('/questions', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.getQuestions(getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.get('/questions/:id', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.getQuestion(req.params.id, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.post('/questions', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.createQuestion(req.body, getAccessToken(req));
    res.status(201).json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.put('/questions/:id', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.updateQuestion(req.params.id, req.body, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.delete('/questions/:id', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.deleteQuestion(req.params.id, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

// ========== КУРСЫ (COURSES) ==========

router.get('/courses', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.getCourses(getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.get('/courses/:id', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.getCourse(req.params.id, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.post('/courses', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.createCourse(req.body, getAccessToken(req));
    res.status(201).json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.put('/courses/:id', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.updateCourse(req.params.id, req.body, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.delete('/courses/:id', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.deleteCourse(req.params.id, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.get('/courses/:id/students', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.getCourseStudents(req.params.id, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.get('/courses/:id/tests', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.getCourseTests(req.params.id, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.post('/courses/:id/enroll', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.enrollToCourse(req.params.id, req.body.user_id, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.delete('/courses/:courseId/enroll/:userId', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.unenrollFromCourse(req.params.courseId, req.params.userId, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

// ========== ПОЛЬЗОВАТЕЛИ (USERS) ==========

router.get('/users', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.getUsers(getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.get('/users/:id/name', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.getUserName(req.params.id, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.put('/users/:id/name', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.setUserName(req.params.id, req.body.name, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.get('/users/:id/courses', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.getUserCourses(req.params.id, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

// Alias для получения попыток пользователя (используется в профиле)
router.get('/users/:id/attempts', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.getUserTests(req.params.id, getAccessToken(req));
    // Преобразуем формат для удобства использования в UI
    const tests = data.tests || [];
    const attempts = tests.map(t => ({
      id: t.attempt_id,
      test_id: t.id,
      test_name: t.name,
      score: t.max_score > 0 ? Math.round((t.score / t.max_score) * 100) : 0,
      status: t.completed ? 'finished' : 'in_progress',
      started_at: t.date
    }));
    res.json({ attempts });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.put('/users/:id/roles', requireAuth, async (req, res) => {
  try {
    // Проверяем, что пользователь админ или изменяет свои роли
    const currentUser = req.sessionData?.userData;
    const isAdmin = currentUser?.roles?.includes('admin') || currentUser?.roles?.includes('Админ');
    const isSelf = currentUser?.id === req.params.id;
    
    if (!isAdmin && !isSelf) {
      return res.status(403).json({ error: 'Только администратор может изменять роли пользователей' });
    }
    
    // Используем auth модуль для обновления ролей
    const authApiClient = require('../utils/authApiClient');
    const data = await authApiClient.updateUserRoles(req.params.id, req.body.roles);
    res.json(data);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.message, details: error.response?.data });
  }
});

router.get('/users/:id/block', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.getUserBlocked(req.params.id, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.put('/users/:id/block', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.setUserBlocked(req.params.id, req.body.is_blocked, getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

// ========== УВЕДОМЛЕНИЯ (NOTIFICATIONS) ==========

router.get('/notification', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.getNotifications(getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

router.delete('/notification', requireAuth, async (req, res) => {
  try {
    const data = await mainApiClient.clearNotifications(getAccessToken(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

// ========== ПРОФИЛЬ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ ==========

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = req.sessionData?.userData;
    if (!user || !user.id) {
      return res.status(404).json({ error: 'User not found in session' });
    }
    
    const accessToken = getAccessToken(req);
    
    // Получаем дополнительные данные о пользователе
    let userData = { ...user };
    
    try {
      const nameData = await mainApiClient.getUserName(user.id, accessToken);
      if (nameData && nameData.name) {
        userData.name = nameData.name;
      }
    } catch (err) {
      console.warn('[API /me] Не удалось получить имя:', err.message);
    }
    
    try {
      const coursesData = await mainApiClient.getUserCourses(user.id, accessToken);
      userData.courses = coursesData?.courses || [];
    } catch (err) {
      console.warn('[API /me] Не удалось получить курсы:', err.message);
      userData.courses = [];
    }
    
    try {
      const testsData = await mainApiClient.getUserTests(user.id, accessToken);
      userData.tests = testsData?.tests || [];
    } catch (err) {
      console.warn('[API /me] Не удалось получить тесты:', err.message);
      userData.tests = [];
    }
    
    res.json(userData);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.data });
  }
});

// Получить статистику студента курса
router.get('/courses/:courseId/student/:studentId/stats', requireAuth, async (req, res) => {
  const { courseId, studentId } = req.params;
  const accessToken = getAccessToken(req);
  
  try {
    // Получаем статистику студента по тестам курса
    const testsResponse = await mainApiClient.requestWithRefresh({
      endpoint: `/api/db/users/${studentId}/tests`,
      method: 'get',
      accessToken
    });
    
    const tests = testsResponse?.data?.tests || [];
    
    // Фильтруем тесты только для этого курса
    const courseTests = tests.filter(test => test.course_id === courseId);
    
    // Считаем статистику
    const testsCount = courseTests.length;
    const completedTests = courseTests.filter(test => test.completed);
    const totalScore = completedTests.reduce((sum, test) => sum + (test.score || 0), 0);
    const maxScore = completedTests.reduce((sum, test) => sum + (test.max_score || 0), 0);
    const averageScore = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
    
    // Находим дату последнего теста
    const lastTest = completedTests.sort((a, b) => new Date(b.finished_at) - new Date(a.finished_at))[0];
    
    res.json({
      tests_count: testsCount,
      completed_tests: completedTests.length,
      average_score: averageScore,
      total_score: totalScore,
      max_score: maxScore,
      last_test_date: lastTest?.finished_at || null
    });
  } catch (error) {
    console.error(`[API] Error getting student stats:`, error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;