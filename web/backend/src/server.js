const express = require('express');
const cookieParser = require('cookie-parser');
const redisClient = require('./utils/redisClient');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Подключение к Redis при старте сервера
redisClient.connect().then(() => {
  console.log('✅ Server connected to Redis');
}).catch(err => {
  console.error('❌ Failed to connect to Redis:', err);
});

// Основной маршрут
app.get('/', (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Система тестирования - Веб модуль</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                max-width: 800px;
                margin: 50px auto;
                padding: 20px;
                background-color: #f5f5f5;
            }
            .container {
                background: white;
                padding: 30px;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                text-align: center;
            }
            h1 {
                color: #2c3e50;
            }
            .status {
                color: #27ae60;
                font-weight: bold;
            }
            .info-box {
                margin: 20px 0;
                padding: 15px;
                background: #e8f4fc;
                border-radius: 5px;
                border-left: 4px solid #3498db;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🚀 Веб-модуль системы тестирования</h1>
            <p class="status">Сервер работает успешно!</p>
            
            <div class="info-box">
                <p><strong>Архитектура контейнеров:</strong></p>
                <p>Node.js (порт 3000 внутри Docker) → Nginx (порт 80) → Хост (порт 8080)</p>
            </div>
            
            <p>Серверная часть активна и готова к работе.</p>
            <div style="margin-top: 30px; padding: 15px; background: #f8f9fa; border-radius: 5px;">
                <p>Проверьте состояние системы:</p>
                <p><a href="/health" style="color: #3498db;">/health</a> - Проверка состояния сервера</p>
                <p><a href="/api/test-redis" style="color: #3498db;">/api/test-redis</a> - Тест подключения к Redis</p>
            </div>
        </div>
    </body>
    </html>
  `;
  res.send(html);
});

// Маршрут для проверки здоровья
app.get('/health', (req, res) => {
  const healthStatus = {
    status: 'ok',
    service: 'web-backend',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
    redis: redisClient.getClient().isOpen ? 'connected' : 'disconnected',
    access_via: 'http://localhost:8080/health (через Nginx)'
  };
  res.json(healthStatus);
});

// Простой тестовый маршрут для Redis
app.get('/api/test-redis', async (req, res) => {
  try {
    const client = redisClient.getClient();
    const timestamp = new Date().toISOString();
    await client.set('last_test', timestamp);
    const value = await client.get('last_test');
    
    res.json({
      message: 'Redis test successful',
      timestamp: timestamp,
      retrieved: value,
      note: 'Данные сохраняются в Redis внутри контейнера web-redis'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Redis test failed',
      details: error.message
    });
  }
});

// Маршрут для отладки (показывает информацию о запросе)
app.get('/api/debug', (req, res) => {
  res.json({
    headers: req.headers,
    hostname: req.hostname,
    ip: req.ip,
    protocol: req.protocol,
    originalUrl: req.originalUrl,
    note: 'Этот маршрут показывает, как Nginx проксирует запросы'
  });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🌐 ВЕБ-МОДУЛЬ СИСТЕМЫ ТЕСТИРОВАНИЯ');
  console.log('='.repeat(60));
  console.log(`✅ Backend сервер запущен на порту: ${PORT}`);
  console.log(`📡 Внутри Docker: http://web-backend:${PORT}`);
  console.log(`🔗 Через Nginx: http://localhost:8080`);
  console.log('');
  console.log('📊 Доступные эндпоинты:');
  console.log(`   • Главная страница: http://localhost:8080/`);
  console.log(`   • Проверка здоровья: http://localhost:8080/health`);
  console.log(`   • Тест Redis: http://localhost:8080/api/test-redis`);
  console.log(`   • Отладка: http://localhost:8080/api/debug`);
  console.log('');
  console.log('🐳 Docker сервисы:');
  console.log('   • web-backend: Node.js/Express приложение');
  console.log('   • web-nginx: Прокси-сервер (Nginx)');
  console.log('   • web-redis: База данных сессий');
  console.log('='.repeat(60));
});