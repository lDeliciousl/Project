const express = require('express');
const router = express.Router();

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

// Маршрут для проверки здоровья
router.get('/health', (req, res) => {
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

// Работа с тестами
router.get('/tests', async (req, res) => {
  try {
    const mainApiClient = require('../utils/mainApiClient');
    const data = await mainApiClient.getTests();
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'Ошибка при получении списка тестов',
      details: error.data
    });
  }
});

router.get('/tests/:id', async (req, res) => {
  try {
    const mainApiClient = require('../utils/mainApiClient');
    const data = await mainApiClient.getTestDetails(req.params.id);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'Ошибка при получении теста',
      details: error.data
    });
  }
});

router.post('/tests', async (req, res) => {
  try {
    const mainApiClient = require('../utils/mainApiClient');
    const data = await mainApiClient.createTest(req.body);
    res.status(201).json(data);
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'Ошибка при создании теста',
      details: error.data
    });
  }
});

router.post('/tests/:id/questions', async (req, res) => {
  try {
    const mainApiClient = require('../utils/mainApiClient');
    const data = await mainApiClient.addQuestion(req.params.id, req.body);
    res.status(201).json(data);
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'Ошибка при добавлении вопроса',
      details: error.data
    });
  }
});

router.post('/tests/attempts', async (req, res) => {
  try {
    const mainApiClient = require('../utils/mainApiClient');
    const data = await mainApiClient.createTestAttempt(req.body);
    res.status(201).json(data);
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'Ошибка при создании попытки',
      details: error.data
    });
  }
});

// Работа с пользователями
router.get('/users', async (req, res) => {
  try {
    const mainApiClient = require('../utils/mainApiClient');
    const data = await mainApiClient.getUsers();
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'Ошибка при получении списка пользователей',
      details: error.data
    });
  }
});

router.get('/users/:id/courses', async (req, res) => {
  try {
    const mainApiClient = require('../utils/mainApiClient');
    const data = await mainApiClient.getUserCourses(req.params.id);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'Ошибка при получении курсов пользователя',
      details: error.data
    });
  }
});

router.get('/users/:id/tests', async (req, res) => {
  try {
    const mainApiClient = require('../utils/mainApiClient');
    const data = await mainApiClient.getUserTests(req.params.id);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'Ошибка при получении тестов пользователя',
      details: error.data
    });
  }
});

router.get('/users/:id/grades', async (req, res) => {
  try {
    const mainApiClient = require('../utils/mainApiClient');
    const data = await mainApiClient.getUserGrades(req.params.id);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'Ошибка при получении оценок пользователя',
      details: error.data
    });
  }
});

module.exports = router;