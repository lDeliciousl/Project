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

module.exports = router;